-- Remove PL/pgSQL shadow warnings from the first Live migration.

create or replace function public.connect4_has_won(
  p_board smallint[],
  p_player smallint
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  direction_row integer;
  direction_column integer;
  directions integer[][] := array[[0, 1], [1, 0], [1, 1], [1, -1]];
begin
  for row_index in 0..5 loop
    for column_index in 0..6 loop
      if p_board[(row_index * 7) + column_index + 1] <> p_player then
        continue;
      end if;
      for direction_index in 1..4 loop
        direction_row := directions[direction_index][1];
        direction_column := directions[direction_index][2];
        for step_index in 1..3 loop
          if row_index + (direction_row * step_index) not between 0 and 5
             or column_index + (direction_column * step_index) not between 0 and 6
             or p_board[((row_index + (direction_row * step_index)) * 7)
               + column_index + (direction_column * step_index) + 1] <> p_player then
            exit;
          end if;
          if step_index = 3 then
            return true;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  return false;
end;
$$;

create or replace function public.connect4_create_room(p_turn_seconds integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  room public.connect4_rooms%rowtype;
  generated_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_turn_seconds is null or p_turn_seconds not between 15 and 90 then
    raise exception 'invalid_turn_seconds' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 42004));
  insert into public.connect4_ratings (user_id) values (caller_id)
  on conflict (user_id) do nothing;

  update public.connect4_rooms set
    status = 'expired', updated_at = now(), finished_at = now(), version = version + 1
  where host_user_id = caller_id and status = 'waiting'
    and created_at < now() - interval '30 minutes';

  select * into room from public.connect4_rooms
  where caller_id in (host_user_id, guest_user_id)
    and status in ('waiting', 'active')
  order by updated_at desc limit 1;
  if found then
    return public.connect4_room_payload(room);
  end if;

  for attempt in 1..20 loop
    select string_agg(substr(alphabet, floor(random() * length(alphabet))::integer + 1, 1), '')
      into generated_code from generate_series(1, 6);
    begin
      insert into public.connect4_rooms (code, host_user_id, turn_seconds)
      values (generated_code, caller_id, p_turn_seconds)
      returning * into room;
      exit;
    exception when unique_violation then
      if attempt = 20 then raise; end if;
    end;
  end loop;

  return public.connect4_room_payload(room);
end;
$$;

revoke execute on function public.connect4_has_won(smallint[], smallint) from public, anon, authenticated;
revoke execute on function public.connect4_create_room(integer) from public, anon;
grant execute on function public.connect4_create_room(integer) to authenticated;

notify pgrst, 'reload schema';
