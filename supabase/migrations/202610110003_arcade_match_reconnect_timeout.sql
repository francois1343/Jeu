-- Reconnection enforcement without trusting unload events: every heartbeat also checks
-- whether the other online player exceeded the server-side grace period.

create or replace function public.arcade_match_heartbeat(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  player_row public.match_players%rowtype;
  match_row public.matches%rowtype;
  timed_out_slot smallint;
  next_version bigint;
  was_disconnected boolean;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;

  select * into match_row from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  select * into player_row from public.match_players
  where match_id = p_match_id and user_id = caller_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  if match_row.status not in ('waiting', 'active') then
    return public.arcade_match_payload(p_match_id);
  end if;

  was_disconnected := player_row.connection_state = 'disconnected';
  if match_row.status = 'active'
     and match_row.mode in ('invite', 'matchmaking')
     and was_disconnected
     and player_row.reconnect_deadline is not null
     and player_row.reconnect_deadline <= clock_timestamp() then
    next_version := match_row.version + 1;
    update public.match_players set connection_state = 'left', left_at = now()
    where id = player_row.id;
    update public.matches set
      status = 'completed', version = next_version,
      result_source = 'timeout', settled_at = now(), updated_at = now(),
      result = jsonb_build_object('winner_slot', 3 - player_row.slot, 'reason', 'reconnect_timeout')
    where id = p_match_id;
    insert into public.match_events (
      match_id, actor_user_id, actor_slot, event_type, turn_number, match_version, payload
    ) values (
      p_match_id, caller_id, player_row.slot, 'settled', match_row.turn_number, next_version,
      jsonb_build_object('winner_slot', 3 - player_row.slot, 'reason', 'reconnect_timeout')
    );
    return public.arcade_match_payload(p_match_id);
  end if;

  update public.match_players set
    connection_state = 'connected', last_seen_at = now(), reconnect_deadline = null
  where id = player_row.id;
  if was_disconnected then
    insert into public.match_events (
      match_id, actor_user_id, actor_slot, event_type, match_version
    ) values (p_match_id, caller_id, player_row.slot, 'reconnected', match_row.version);
  end if;

  if match_row.status = 'active' and match_row.mode in ('invite', 'matchmaking') then
    select player.slot into timed_out_slot
    from public.match_players player
    where player.match_id = p_match_id
      and player.player_kind = 'human'
      and player.user_id <> caller_id
      and (
        (player.connection_state = 'disconnected'
          and player.reconnect_deadline is not null
          and player.reconnect_deadline <= clock_timestamp())
        or
        (player.connection_state = 'connected'
          and player.last_seen_at <= clock_timestamp()
            - make_interval(secs => match_row.reconnect_grace_seconds))
      )
    order by player.slot
    limit 1 for update;

    if found then
      next_version := match_row.version + 1;
      update public.match_players set
        connection_state = 'left', left_at = now(), reconnect_deadline = null
      where match_id = p_match_id and slot = timed_out_slot;
      update public.matches set
        status = 'completed', version = next_version,
        result_source = 'timeout', settled_at = now(), updated_at = now(),
        result = jsonb_build_object('winner_slot', 3 - timed_out_slot, 'reason', 'reconnect_timeout')
      where id = p_match_id;
      insert into public.match_events (
        match_id, actor_slot, event_type, turn_number, match_version, payload
      ) values (
        p_match_id, timed_out_slot, 'settled', match_row.turn_number, next_version,
        jsonb_build_object('winner_slot', 3 - timed_out_slot, 'reason', 'reconnect_timeout')
      );
    end if;
  end if;

  return public.arcade_match_payload(p_match_id);
end;
$$;

revoke execute on function public.arcade_match_heartbeat(uuid) from public, anon;
grant execute on function public.arcade_match_heartbeat(uuid) to authenticated;

notify pgrst, 'reload schema';
