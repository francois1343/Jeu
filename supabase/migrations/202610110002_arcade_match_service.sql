-- Shared turn-based match service for solo, bot, local, invite and matchmaking modes.
-- Browsers may transport actions and report a proposed result, but only trusted server
-- code may settle a match as completed.

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.game_catalog(game_key) on update cascade,
  mode text not null check (mode in ('solo', 'bot', 'local', 'invite', 'matchmaking')),
  status text not null check (status in ('waiting', 'active', 'completed', 'abandoned', 'cancelled', 'expired')),
  created_by uuid not null references auth.users(id) on delete cascade,
  max_players smallint not null check (max_players between 1 and 2),
  current_player_slot smallint check (current_player_slot between 1 and 2),
  turn_number integer not null default 0 check (turn_number >= 0),
  version bigint not null default 1 check (version > 0),
  turn_seconds integer check (turn_seconds between 10 and 300),
  turn_deadline timestamptz,
  reconnect_grace_seconds integer not null default 90 check (reconnect_grace_seconds between 15 and 300),
  options jsonb not null default '{}'::jsonb check (pg_column_size(options) <= 8192),
  result jsonb check (result is null or pg_column_size(result) <= 8192),
  result_source text check (result_source is null or result_source in ('server_validator', 'abandonment', 'timeout', 'cancelled')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_mode_size_check check (
    (mode = 'solo' and max_players = 1)
    or (mode <> 'solo' and max_players = 2)
  ),
  constraint matches_terminal_result_check check (
    (status in ('waiting', 'active') and settled_at is null)
    or (status in ('completed', 'abandoned', 'cancelled', 'expired') and settled_at is not null)
  )
);

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  slot smallint not null check (slot between 1 and 2),
  user_id uuid references auth.users(id) on delete cascade,
  player_kind text not null check (player_kind in ('human', 'bot', 'local')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  connection_state text not null default 'connected' check (connection_state in ('connected', 'disconnected', 'left')),
  last_seen_at timestamptz not null default now(),
  reconnect_deadline timestamptz,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 4096),
  unique (match_id, slot),
  constraint match_players_identity_check check (
    (player_kind = 'human' and user_id is not null)
    or (player_kind in ('bot', 'local') and user_id is null)
  )
);

create unique index match_players_match_user_idx
  on public.match_players(match_id, user_id) where user_id is not null;
create index match_players_user_active_idx
  on public.match_players(user_id, last_seen_at desc) where user_id is not null;

create table public.match_invites (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  token_hash bytea not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index match_invites_match_status_idx on public.match_invites(match_id, status);
create index match_invites_expiry_idx on public.match_invites(expires_at) where status = 'pending';

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_slot smallint check (actor_slot between 1 and 2),
  event_type text not null check (event_type in (
    'created', 'matched', 'joined', 'turn', 'result_reported',
    'disconnected', 'reconnected', 'abandoned', 'settled', 'expired'
  )),
  turn_number integer not null default 0 check (turn_number >= 0),
  match_version bigint not null check (match_version > 0),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 8192),
  created_at timestamptz not null default now()
);

create index match_events_match_id_idx on public.match_events(match_id, id);
create index matches_matchmaking_queue_idx
  on public.matches(game_key, created_at)
  where mode = 'matchmaking' and status = 'waiting';

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_invites enable row level security;
alter table public.match_events enable row level security;

revoke all on public.matches, public.match_players, public.match_invites, public.match_events
  from public, anon, authenticated;

create or replace function public.arcade_match_is_participant(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_players
    where match_id = p_match_id and user_id = p_user_id
  );
$$;

revoke execute on function public.arcade_match_is_participant(uuid, uuid) from public, anon, authenticated;

create policy matches_read_participant on public.matches
  for select to authenticated
  using (public.arcade_match_is_participant(id, auth.uid()));

create policy match_players_read_participant on public.match_players
  for select to authenticated
  using (public.arcade_match_is_participant(match_id, auth.uid()));

create policy match_events_read_participant on public.match_events
  for select to authenticated
  using (public.arcade_match_is_participant(match_id, auth.uid()));

grant select on public.matches, public.match_players, public.match_events to authenticated;

create or replace function public.arcade_match_payload(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', match.id,
    'game_key', match.game_key,
    'mode', match.mode,
    'status', match.status,
    'created_by', match.created_by,
    'max_players', match.max_players,
    'current_player_slot', match.current_player_slot,
    'turn_number', match.turn_number,
    'version', match.version,
    'turn_seconds', match.turn_seconds,
    'turn_deadline', match.turn_deadline,
    'reconnect_grace_seconds', match.reconnect_grace_seconds,
    'options', match.options,
    'result', match.result,
    'result_source', match.result_source,
    'settled_at', match.settled_at,
    'created_at', match.created_at,
    'updated_at', match.updated_at,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot', player.slot,
        'user_id', player.user_id,
        'kind', player.player_kind,
        'display_name', player.display_name,
        'connection_state', player.connection_state,
        'last_seen_at', player.last_seen_at,
        'reconnect_deadline', player.reconnect_deadline,
        'metadata', player.metadata
      ) order by player.slot)
      from public.match_players player where player.match_id = match.id
    ), '[]'::jsonb)
  )
  from public.matches match
  where match.id = p_match_id;
$$;

revoke execute on function public.arcade_match_payload(uuid) from public, anon, authenticated;

create or replace function public.arcade_match_create(
  p_game_key text,
  p_mode text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_id uuid := gen_random_uuid();
  clean_options jsonb := coalesce(p_options, '{}'::jsonb);
  player_name text;
  match_status text;
  player_count smallint;
  first_slot smallint;
  configured_turn_seconds integer;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_mode not in ('solo', 'bot', 'local', 'invite') then
    raise exception 'invalid_match_mode' using errcode = 'P0001';
  end if;
  if p_game_key is null or p_game_key !~ '^[a-z0-9_-]{1,64}$'
     or not exists (select 1 from public.game_catalog where game_key = p_game_key) then
    raise exception 'invalid_game_key' using errcode = 'P0001';
  end if;
  if jsonb_typeof(clean_options) <> 'object' or pg_column_size(clean_options) > 8192 then
    raise exception 'invalid_match_options' using errcode = 'P0001';
  end if;
  if (select count(*) from public.matches
      where created_by = caller_id and created_at > now() - interval '1 minute') >= 12 then
    raise exception 'match_create_rate_limit' using errcode = 'P0001';
  end if;

  configured_turn_seconds := nullif(clean_options ->> 'turn_seconds', '')::integer;
  if configured_turn_seconds is not null and configured_turn_seconds not between 10 and 300 then
    raise exception 'invalid_turn_seconds' using errcode = 'P0001';
  end if;
  select coalesce(display_name, 'Joueur') into player_name
  from public.profiles where user_id = caller_id;
  player_name := coalesce(player_name, 'Joueur');
  match_status := case when p_mode = 'invite' then 'waiting' else 'active' end;
  player_count := case when p_mode = 'solo' then 1 else 2 end;
  first_slot := 1;

  insert into public.matches (
    id, game_key, mode, status, created_by, max_players,
    current_player_slot, turn_seconds, turn_deadline, options
  ) values (
    match_id, p_game_key, p_mode, match_status, caller_id, player_count,
    first_slot, configured_turn_seconds,
    case when match_status = 'active' and configured_turn_seconds is not null
      then now() + make_interval(secs => configured_turn_seconds) else null end,
    clean_options
  );

  insert into public.match_players (match_id, slot, user_id, player_kind, display_name)
  values (match_id, 1, caller_id, 'human', player_name);

  if p_mode = 'bot' then
    insert into public.match_players (match_id, slot, player_kind, display_name, metadata)
    values (match_id, 2, 'bot', coalesce(nullif(clean_options ->> 'bot_name', ''), 'Arcade Bot'),
      jsonb_build_object('difficulty', coalesce(clean_options ->> 'difficulty', 'normal')));
  elsif p_mode = 'local' then
    insert into public.match_players (match_id, slot, player_kind, display_name)
    values (match_id, 2, 'local', coalesce(nullif(clean_options ->> 'guest_name', ''), 'Joueur 2'));
  end if;

  insert into public.match_events (match_id, actor_user_id, actor_slot, event_type, match_version, payload)
  values (match_id, caller_id, 1, 'created', 1, jsonb_build_object('mode', p_mode));

  return public.arcade_match_payload(match_id);
exception when invalid_text_representation then
  raise exception 'invalid_turn_seconds' using errcode = 'P0001';
end;
$$;

create or replace function public.arcade_match_find(
  p_game_key text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  clean_options jsonb := coalesce(p_options, '{}'::jsonb);
  queue_key text;
  player_name text;
  target public.matches%rowtype;
  existing_match_id uuid;
  match_id uuid := gen_random_uuid();
  first_slot smallint;
  configured_turn_seconds integer;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_game_key is null or p_game_key !~ '^[a-z0-9_-]{1,64}$'
     or not exists (select 1 from public.game_catalog where game_key = p_game_key) then
    raise exception 'invalid_game_key' using errcode = 'P0001';
  end if;
  if jsonb_typeof(clean_options) <> 'object' or pg_column_size(clean_options) > 8192 then
    raise exception 'invalid_match_options' using errcode = 'P0001';
  end if;
  queue_key := coalesce(nullif(clean_options ->> 'queue', ''), 'public');
  if queue_key !~ '^[A-Za-z0-9_-]{1,32}$' then
    raise exception 'invalid_queue' using errcode = 'P0001';
  end if;
  configured_turn_seconds := coalesce(nullif(clean_options ->> 'turn_seconds', '')::integer, 30);
  if configured_turn_seconds not between 10 and 300 then
    raise exception 'invalid_turn_seconds' using errcode = 'P0001';
  end if;

  select match.id into existing_match_id
  from public.matches match
  join public.match_players player on player.match_id = match.id
  where player.user_id = caller_id
    and match.game_key = p_game_key
    and match.mode = 'matchmaking'
    and match.status in ('waiting', 'active')
  order by match.created_at desc limit 1;
  if found then
    return public.arcade_match_payload(existing_match_id)
      || jsonb_build_object('matched', (select status = 'active' from public.matches where id = existing_match_id));
  end if;

  perform pg_advisory_xact_lock(hashtextextended('arcade-match:' || p_game_key || ':' || queue_key, 51002));

  select match.* into target
  from public.matches match
  where match.game_key = p_game_key
    and match.mode = 'matchmaking'
    and match.status = 'waiting'
    and match.created_by <> caller_id
    and coalesce(match.options ->> 'queue', 'public') = queue_key
  order by match.created_at
  limit 1 for update skip locked;

  select coalesce(display_name, 'Joueur') into player_name
  from public.profiles where user_id = caller_id;
  player_name := coalesce(player_name, 'Joueur');

  if found then
    insert into public.match_players (match_id, slot, user_id, player_kind, display_name)
    values (target.id, 2, caller_id, 'human', player_name);
    first_slot := floor(random() * 2)::smallint + 1;
    update public.matches set
      status = 'active',
      current_player_slot = first_slot,
      turn_seconds = coalesce(turn_seconds, configured_turn_seconds),
      turn_deadline = now() + make_interval(secs => coalesce(turn_seconds, configured_turn_seconds)),
      version = version + 1,
      updated_at = now()
    where id = target.id;
    insert into public.match_events (
      match_id, actor_user_id, actor_slot, event_type, match_version, payload
    ) values (
      target.id, caller_id, 2, 'matched', target.version + 1,
      jsonb_build_object('queue', queue_key, 'first_player_slot', first_slot)
    );
    return public.arcade_match_payload(target.id) || jsonb_build_object('matched', true);
  end if;

  insert into public.matches (
    id, game_key, mode, status, created_by, max_players,
    current_player_slot, turn_seconds, options
  ) values (
    match_id, p_game_key, 'matchmaking', 'waiting', caller_id, 2,
    1, configured_turn_seconds, clean_options || jsonb_build_object('queue', queue_key)
  );
  insert into public.match_players (match_id, slot, user_id, player_kind, display_name)
  values (match_id, 1, caller_id, 'human', player_name);
  insert into public.match_events (match_id, actor_user_id, actor_slot, event_type, match_version, payload)
  values (match_id, caller_id, 1, 'created', 1, jsonb_build_object('mode', 'matchmaking', 'queue', queue_key));
  return public.arcade_match_payload(match_id) || jsonb_build_object('matched', false);
exception when invalid_text_representation then
  raise exception 'invalid_turn_seconds' using errcode = 'P0001';
end;
$$;

create or replace function public.arcade_match_create_invite(
  p_match_id uuid,
  p_invitee_user_id uuid default null,
  p_ttl_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches%rowtype;
  invite_id uuid := gen_random_uuid();
  invite_token text := encode(public.gen_random_bytes(24), 'hex');
  invite_expiry timestamptz;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_ttl_minutes not between 5 and 1440 then
    raise exception 'invalid_invite_ttl' using errcode = 'P0001';
  end if;
  if p_invitee_user_id = caller_id then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = p_match_id for update;
  if not found or match_row.created_by <> caller_id then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  if match_row.mode <> 'invite' or match_row.status <> 'waiting' then
    raise exception 'match_not_invitable' using errcode = 'P0001';
  end if;

  update public.match_invites set status = 'revoked'
  where match_id = p_match_id and status = 'pending';
  invite_expiry := now() + make_interval(mins => p_ttl_minutes);
  insert into public.match_invites (
    id, match_id, created_by, invitee_user_id, token_hash, expires_at
  ) values (
    invite_id, p_match_id, caller_id, p_invitee_user_id,
    public.digest(convert_to(invite_token, 'UTF8'), 'sha256'), invite_expiry
  );

  return jsonb_build_object(
    'invite_id', invite_id,
    'match_id', p_match_id,
    'token', invite_token,
    'expires_at', invite_expiry
  );
end;
$$;

create or replace function public.arcade_match_accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invite_row public.match_invites%rowtype;
  match_row public.matches%rowtype;
  player_name text;
  first_slot smallint;
  next_version bigint;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  select * into invite_row from public.match_invites
  where token_hash = public.digest(convert_to(p_token, 'UTF8'), 'sha256')
  for update;
  if not found or invite_row.status <> 'pending' or invite_row.expires_at <= now() then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  if invite_row.invitee_user_id is not null and invite_row.invitee_user_id <> caller_id then
    raise exception 'invite_not_for_user' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = invite_row.match_id for update;
  if not found or match_row.mode <> 'invite' or match_row.status <> 'waiting'
     or match_row.created_by = caller_id then
    raise exception 'match_not_joinable' using errcode = 'P0001';
  end if;

  select coalesce(display_name, 'Joueur') into player_name
  from public.profiles where user_id = caller_id;
  first_slot := floor(random() * 2)::smallint + 1;
  next_version := match_row.version + 1;
  insert into public.match_players (match_id, slot, user_id, player_kind, display_name)
  values (match_row.id, 2, caller_id, 'human', coalesce(player_name, 'Joueur'));
  update public.matches set
    status = 'active',
    current_player_slot = first_slot,
    turn_seconds = coalesce(turn_seconds, 30),
    turn_deadline = now() + make_interval(secs => coalesce(turn_seconds, 30)),
    version = next_version,
    updated_at = now()
  where id = match_row.id;
  update public.match_invites set status = 'accepted', accepted_at = now()
  where id = invite_row.id;
  update public.match_invites set status = 'revoked'
  where match_id = match_row.id and status = 'pending' and id <> invite_row.id;
  insert into public.match_events (
    match_id, actor_user_id, actor_slot, event_type, match_version, payload
  ) values (
    match_row.id, caller_id, 2, 'joined', next_version,
    jsonb_build_object('first_player_slot', first_slot)
  );
  return public.arcade_match_payload(match_row.id);
end;
$$;

create or replace function public.arcade_match_get(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if not public.arcade_match_is_participant(p_match_id, caller_id) then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  return public.arcade_match_payload(p_match_id);
end;
$$;

create or replace function public.arcade_match_heartbeat(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  player_slot smallint;
  match_version bigint;
  was_disconnected boolean;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  select slot, connection_state = 'disconnected' into player_slot, was_disconnected
  from public.match_players where match_id = p_match_id and user_id = caller_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  update public.match_players set
    connection_state = 'connected', last_seen_at = now(), reconnect_deadline = null
  where match_id = p_match_id and user_id = caller_id;
  select version into match_version from public.matches where id = p_match_id;
  if was_disconnected then
    insert into public.match_events (
      match_id, actor_user_id, actor_slot, event_type, match_version
    ) values (p_match_id, caller_id, player_slot, 'reconnected', match_version);
  end if;
  return public.arcade_match_payload(p_match_id);
end;
$$;

create or replace function public.arcade_match_disconnect(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  player_slot smallint;
  match_row public.matches%rowtype;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = p_match_id for update;
  if not found or match_row.status not in ('waiting', 'active') then
    raise exception 'match_not_active' using errcode = 'P0001';
  end if;
  select slot into player_slot from public.match_players
  where match_id = p_match_id and user_id = caller_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  update public.match_players set
    connection_state = 'disconnected',
    last_seen_at = now(),
    reconnect_deadline = now() + make_interval(secs => match_row.reconnect_grace_seconds)
  where match_id = p_match_id and user_id = caller_id;
  insert into public.match_events (
    match_id, actor_user_id, actor_slot, event_type, match_version
  ) values (p_match_id, caller_id, player_slot, 'disconnected', match_row.version);
  return public.arcade_match_payload(p_match_id);
end;
$$;

create or replace function public.arcade_match_submit_turn(
  p_match_id uuid,
  p_expected_version bigint,
  p_action jsonb,
  p_actor_slot smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches%rowtype;
  caller_slot smallint;
  actor_slot smallint;
  next_slot smallint;
  next_version bigint;
  winner_slot smallint;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_action, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_action) > 8192 then
    raise exception 'invalid_match_action' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = p_match_id for update;
  if not found or match_row.status <> 'active' then
    raise exception 'match_not_active' using errcode = 'P0001';
  end if;
  select slot into caller_slot from public.match_players
  where match_id = p_match_id and user_id = caller_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  if match_row.version <> p_expected_version then
    raise exception 'stale_match_version' using errcode = 'P0001';
  end if;

  if match_row.turn_deadline is not null and match_row.turn_deadline <= clock_timestamp() then
    winner_slot := case when match_row.max_players = 2 then 3 - match_row.current_player_slot else null end;
    next_version := match_row.version + 1;
    update public.matches set
      status = 'completed', version = next_version, settled_at = now(), updated_at = now(),
      result_source = 'timeout',
      result = jsonb_build_object('winner_slot', winner_slot, 'reason', 'turn_timeout')
    where id = p_match_id;
    insert into public.match_events (
      match_id, event_type, turn_number, match_version, payload
    ) values (
      p_match_id, 'settled', match_row.turn_number, next_version,
      jsonb_build_object('winner_slot', winner_slot, 'reason', 'turn_timeout')
    );
    return public.arcade_match_payload(p_match_id);
  end if;

  actor_slot := caller_slot;
  if match_row.mode in ('bot', 'local') and match_row.created_by = caller_id
     and p_actor_slot in (1, 2) then
    actor_slot := p_actor_slot;
  elsif p_actor_slot is not null and p_actor_slot <> caller_slot then
    raise exception 'invalid_actor_slot' using errcode = 'P0001';
  end if;
  if actor_slot <> match_row.current_player_slot then
    raise exception 'not_your_turn' using errcode = 'P0001';
  end if;

  next_slot := case when match_row.max_players = 1 then 1 else 3 - actor_slot end;
  next_version := match_row.version + 1;
  update public.matches set
    current_player_slot = next_slot,
    turn_number = turn_number + 1,
    version = next_version,
    turn_deadline = case when turn_seconds is null then null
      else now() + make_interval(secs => turn_seconds) end,
    updated_at = now()
  where id = p_match_id;
  update public.match_players set last_seen_at = now(), connection_state = 'connected', reconnect_deadline = null
  where match_id = p_match_id and user_id = caller_id;
  insert into public.match_events (
    match_id, actor_user_id, actor_slot, event_type, turn_number, match_version, payload
  ) values (
    p_match_id, caller_id, actor_slot, 'turn', match_row.turn_number + 1, next_version, p_action
  );
  return public.arcade_match_payload(p_match_id);
end;
$$;

create or replace function public.arcade_match_report_result(
  p_match_id uuid,
  p_expected_version bigint,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches%rowtype;
  player_slot smallint;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_result, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_result) > 8192 then
    raise exception 'invalid_match_result' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = p_match_id for update;
  if not found or match_row.status <> 'active' or match_row.version <> p_expected_version then
    raise exception 'match_not_reportable' using errcode = 'P0001';
  end if;
  select slot into player_slot from public.match_players
  where match_id = p_match_id and user_id = caller_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.match_events
      where match_id = p_match_id and actor_user_id = caller_id
        and event_type = 'result_reported' and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'result_report_rate_limit' using errcode = 'P0001';
  end if;
  insert into public.match_events (
    match_id, actor_user_id, actor_slot, event_type, turn_number, match_version, payload
  ) values (
    p_match_id, caller_id, player_slot, 'result_reported',
    match_row.turn_number, match_row.version, p_result
  );
  return jsonb_build_object(
    'match_id', p_match_id,
    'accepted', true,
    'settled', false,
    'status', 'awaiting_server_validation',
    'version', match_row.version
  );
end;
$$;

create or replace function public.arcade_match_abandon(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches%rowtype;
  player_slot smallint;
  winner_slot smallint;
  next_status text;
  next_version bigint;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = p_match_id for update;
  if not found or match_row.status not in ('waiting', 'active') then
    raise exception 'match_not_active' using errcode = 'P0001';
  end if;
  select slot into player_slot from public.match_players
  where match_id = p_match_id and user_id = caller_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;

  winner_slot := case
    when match_row.status = 'active' and match_row.mode in ('invite', 'matchmaking') then 3 - player_slot
    else null
  end;
  next_status := case when winner_slot is null then 'abandoned' else 'completed' end;
  next_version := match_row.version + 1;
  update public.match_players set
    connection_state = 'left', left_at = now(), reconnect_deadline = null
  where match_id = p_match_id and user_id = caller_id;
  update public.matches set
    status = next_status, version = next_version, settled_at = now(), updated_at = now(),
    result_source = 'abandonment',
    result = jsonb_build_object('winner_slot', winner_slot, 'loser_slot', player_slot, 'reason', 'abandonment')
  where id = p_match_id;
  update public.match_invites set status = 'revoked'
  where match_id = p_match_id and status = 'pending';
  insert into public.match_events (
    match_id, actor_user_id, actor_slot, event_type, turn_number, match_version, payload
  ) values (
    p_match_id, caller_id, player_slot, 'abandoned', match_row.turn_number, next_version,
    jsonb_build_object('winner_slot', winner_slot)
  );
  return public.arcade_match_payload(p_match_id);
end;
$$;

create or replace function public.arcade_match_settle(
  p_match_id uuid,
  p_expected_version bigint,
  p_result jsonb,
  p_verifier text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row public.matches%rowtype;
  next_version bigint;
  winner_slot integer;
begin
  if p_verifier is null or p_verifier !~ '^[a-z0-9_-]{2,64}$' then
    raise exception 'invalid_match_verifier' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_result, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_result) > 8192 then
    raise exception 'invalid_match_result' using errcode = 'P0001';
  end if;
  select * into match_row from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0001';
  end if;
  if match_row.status <> 'active' then
    return public.arcade_match_payload(p_match_id);
  end if;
  if match_row.version <> p_expected_version then
    raise exception 'stale_match_version' using errcode = 'P0001';
  end if;
  winner_slot := nullif(p_result ->> 'winner_slot', '')::integer;
  if winner_slot is not null and winner_slot not between 1 and match_row.max_players then
    raise exception 'invalid_winner_slot' using errcode = 'P0001';
  end if;
  next_version := match_row.version + 1;
  update public.matches set
    status = 'completed', result = p_result || jsonb_build_object('verifier', p_verifier),
    result_source = 'server_validator', version = next_version,
    settled_at = now(), updated_at = now()
  where id = p_match_id;
  insert into public.match_events (
    match_id, event_type, turn_number, match_version, payload
  ) values (p_match_id, 'settled', match_row.turn_number, next_version,
    p_result || jsonb_build_object('verifier', p_verifier));
  return public.arcade_match_payload(p_match_id);
exception when invalid_text_representation then
  raise exception 'invalid_winner_slot' using errcode = 'P0001';
end;
$$;

create or replace function public.arcade_match_expire_stale()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_invites integer := 0;
  expired_waiting integer := 0;
  expired_reconnections integer := 0;
begin
  update public.match_invites set status = 'expired'
  where status = 'pending' and expires_at <= now();
  get diagnostics expired_invites = row_count;

  update public.matches set
    status = 'expired', result_source = 'timeout', settled_at = now(), updated_at = now(),
    version = version + 1, result = jsonb_build_object('reason', 'waiting_timeout')
  where status = 'waiting' and created_at <= now() - interval '30 minutes';
  get diagnostics expired_waiting = row_count;

  with timed_out as (
    select match.id, player.slot,
      case when count(*) over (partition by match.id) = 1 then 3 - player.slot else null end as winner_slot
    from public.matches match
    join public.match_players player on player.match_id = match.id
    where match.status = 'active'
      and match.mode in ('invite', 'matchmaking')
      and player.connection_state = 'disconnected'
      and player.reconnect_deadline <= now()
  ), per_match as (
    select id, min(winner_slot) as winner_slot from timed_out group by id
  )
  update public.matches match set
    status = 'completed', result_source = 'timeout', settled_at = now(), updated_at = now(),
    version = match.version + 1,
    result = jsonb_build_object('winner_slot', per_match.winner_slot, 'reason', 'reconnect_timeout')
  from per_match where match.id = per_match.id;
  get diagnostics expired_reconnections = row_count;

  return jsonb_build_object(
    'expired_invites', expired_invites,
    'expired_waiting_matches', expired_waiting,
    'expired_reconnections', expired_reconnections
  );
end;
$$;

revoke execute on function public.arcade_match_create(text, text, jsonb) from public, anon;
revoke execute on function public.arcade_match_find(text, jsonb) from public, anon;
revoke execute on function public.arcade_match_create_invite(uuid, uuid, integer) from public, anon;
revoke execute on function public.arcade_match_accept_invite(text) from public, anon;
revoke execute on function public.arcade_match_get(uuid) from public, anon;
revoke execute on function public.arcade_match_heartbeat(uuid) from public, anon;
revoke execute on function public.arcade_match_disconnect(uuid) from public, anon;
revoke execute on function public.arcade_match_submit_turn(uuid, bigint, jsonb, smallint) from public, anon;
revoke execute on function public.arcade_match_report_result(uuid, bigint, jsonb) from public, anon;
revoke execute on function public.arcade_match_abandon(uuid) from public, anon;
revoke execute on function public.arcade_match_settle(uuid, bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function public.arcade_match_expire_stale() from public, anon, authenticated;

grant execute on function public.arcade_match_create(text, text, jsonb) to authenticated;
grant execute on function public.arcade_match_find(text, jsonb) to authenticated;
grant execute on function public.arcade_match_create_invite(uuid, uuid, integer) to authenticated;
grant execute on function public.arcade_match_accept_invite(text) to authenticated;
grant execute on function public.arcade_match_get(uuid) to authenticated;
grant execute on function public.arcade_match_heartbeat(uuid) to authenticated;
grant execute on function public.arcade_match_disconnect(uuid) to authenticated;
grant execute on function public.arcade_match_submit_turn(uuid, bigint, jsonb, smallint) to authenticated;
grant execute on function public.arcade_match_report_result(uuid, bigint, jsonb) to authenticated;
grant execute on function public.arcade_match_abandon(uuid) to authenticated;
grant execute on function public.arcade_match_settle(uuid, bigint, jsonb, text) to service_role;
grant execute on function public.arcade_match_expire_stale() to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_players'
  ) then
    alter publication supabase_realtime add table public.match_players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
exception when undefined_object then
  null;
end;
$$;

notify pgrst, 'reload schema';
