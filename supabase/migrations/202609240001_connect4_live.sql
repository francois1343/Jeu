-- Puissance 4 Live: authoritative rooms, turn clock and Elo ratings.

create table public.connect4_ratings (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  rating integer not null default 1000 check (rating between 100 and 4000),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  updated_at timestamptz not null default now()
);

create table public.connect4_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'waiting' check (status in (
    'waiting', 'active', 'completed', 'abandoned', 'expired'
  )),
  host_user_id uuid not null references public.profiles(user_id) on delete cascade,
  guest_user_id uuid references public.profiles(user_id) on delete set null,
  red_user_id uuid references public.profiles(user_id) on delete set null,
  yellow_user_id uuid references public.profiles(user_id) on delete set null,
  board smallint[] not null default array_fill(0::smallint, array[42]),
  current_player smallint not null default 1 check (current_player in (1, 2)),
  move_count smallint not null default 0 check (move_count between 0 and 42),
  turn_seconds integer not null default 30 check (turn_seconds between 15 and 90),
  turn_started_at timestamptz,
  winner_user_id uuid references public.profiles(user_id) on delete set null,
  result_reason text check (result_reason is null or result_reason in (
    'connect4', 'draw', 'timeout', 'resignation'
  )),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint connect4_room_players_distinct check (
    guest_user_id is null or guest_user_id <> host_user_id
  ),
  constraint connect4_room_colors_distinct check (
    red_user_id is null or yellow_user_id is null or red_user_id <> yellow_user_id
  ),
  constraint connect4_board_shape check (
    array_ndims(board) = 1
    and array_length(board, 1) = 42
    and board <@ array[0, 1, 2]::smallint[]
  )
);

create index connect4_rooms_host_status_idx
  on public.connect4_rooms (host_user_id, status, updated_at desc);
create index connect4_rooms_guest_status_idx
  on public.connect4_rooms (guest_user_id, status, updated_at desc)
  where guest_user_id is not null;

create table public.connect4_matches (
  room_id uuid primary key references public.connect4_rooms(id) on delete cascade,
  red_user_id uuid not null references public.profiles(user_id) on delete cascade,
  yellow_user_id uuid not null references public.profiles(user_id) on delete cascade,
  winner_user_id uuid references public.profiles(user_id) on delete set null,
  result_reason text not null check (result_reason in ('connect4', 'draw', 'timeout', 'resignation')),
  red_rating_before integer not null,
  yellow_rating_before integer not null,
  red_rating_after integer not null,
  yellow_rating_after integer not null,
  move_count smallint not null check (move_count between 0 and 42),
  finished_at timestamptz not null default now()
);

create index connect4_matches_finished_idx
  on public.connect4_matches (finished_at desc);

alter table public.connect4_ratings enable row level security;
alter table public.connect4_rooms enable row level security;
alter table public.connect4_matches enable row level security;

create policy connect4_ratings_read_own on public.connect4_ratings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy connect4_rooms_read_participant on public.connect4_rooms
  for select to authenticated
  using ((select auth.uid()) in (host_user_id, guest_user_id));

create policy connect4_matches_read_participant on public.connect4_matches
  for select to authenticated
  using ((select auth.uid()) in (red_user_id, yellow_user_id));

revoke all on public.connect4_ratings, public.connect4_rooms, public.connect4_matches
  from anon, authenticated;
grant select on public.connect4_ratings, public.connect4_rooms, public.connect4_matches
  to authenticated;

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

create or replace function public.connect4_room_payload(p_room public.connect4_rooms)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_room.id,
    'code', p_room.code,
    'status', p_room.status,
    'host_user_id', p_room.host_user_id,
    'guest_user_id', p_room.guest_user_id,
    'red_user_id', p_room.red_user_id,
    'yellow_user_id', p_room.yellow_user_id,
    'board', to_jsonb(p_room.board),
    'current_player', p_room.current_player,
    'move_count', p_room.move_count,
    'turn_seconds', p_room.turn_seconds,
    'turn_started_at', p_room.turn_started_at,
    'turn_deadline', case
      when p_room.turn_started_at is null then null
      else p_room.turn_started_at + make_interval(secs => p_room.turn_seconds)
    end,
    'winner_user_id', p_room.winner_user_id,
    'result_reason', p_room.result_reason,
    'version', p_room.version,
    'created_at', p_room.created_at,
    'updated_at', p_room.updated_at,
    'finished_at', p_room.finished_at,
    'server_now', clock_timestamp(),
    'me_user_id', auth.uid(),
    'me_player', case
      when auth.uid() = p_room.red_user_id then 1
      when auth.uid() = p_room.yellow_user_id then 2
      else null
    end,
    'red_player', case when p_room.red_user_id is null then null else (
      select jsonb_build_object(
        'user_id', profile.user_id,
        'display_name', coalesce(profile.display_name, 'Joueur rouge'),
        'rating', coalesce(rating.rating, 1000),
        'games_played', coalesce(rating.games_played, 0)
      )
      from public.profiles profile
      left join public.connect4_ratings rating on rating.user_id = profile.user_id
      where profile.user_id = p_room.red_user_id
    ) end,
    'yellow_player', case when p_room.yellow_user_id is null then null else (
      select jsonb_build_object(
        'user_id', profile.user_id,
        'display_name', coalesce(profile.display_name, 'Joueur jaune'),
        'rating', coalesce(rating.rating, 1000),
        'games_played', coalesce(rating.games_played, 0)
      )
      from public.profiles profile
      left join public.connect4_ratings rating on rating.user_id = profile.user_id
      where profile.user_id = p_room.yellow_user_id
    ) end
  );
$$;

create or replace function public.connect4_finish_locked(
  p_room_id uuid,
  p_winner_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.connect4_rooms%rowtype;
  red_rating integer;
  yellow_rating integer;
  red_expected double precision;
  yellow_expected double precision;
  red_score double precision;
  yellow_score double precision;
  red_after integer;
  yellow_after integer;
begin
  if p_reason not in ('connect4', 'draw', 'timeout', 'resignation') then
    raise exception 'invalid_finish_reason' using errcode = 'P0001';
  end if;

  select * into room from public.connect4_rooms where id = p_room_id for update;
  if room.status <> 'active' then
    return;
  end if;
  if p_winner_user_id is not null
     and p_winner_user_id not in (room.red_user_id, room.yellow_user_id) then
    raise exception 'invalid_winner' using errcode = 'P0001';
  end if;

  insert into public.connect4_ratings (user_id)
  values (room.red_user_id), (room.yellow_user_id)
  on conflict (user_id) do nothing;

  select rating into red_rating
  from public.connect4_ratings where user_id = room.red_user_id for update;
  select rating into yellow_rating
  from public.connect4_ratings where user_id = room.yellow_user_id for update;

  red_score := case
    when p_winner_user_id is null then 0.5
    when p_winner_user_id = room.red_user_id then 1.0
    else 0.0
  end;
  yellow_score := 1.0 - red_score;
  red_expected := 1.0 / (1.0 + power(10.0, (yellow_rating - red_rating) / 400.0));
  yellow_expected := 1.0 - red_expected;
  red_after := greatest(100, round(red_rating + (32.0 * (red_score - red_expected)))::integer);
  yellow_after := greatest(100, round(yellow_rating + (32.0 * (yellow_score - yellow_expected)))::integer);

  update public.connect4_ratings set
    rating = red_after,
    games_played = games_played + 1,
    wins = wins + case when red_score = 1.0 then 1 else 0 end,
    losses = losses + case when red_score = 0.0 then 1 else 0 end,
    draws = draws + case when red_score = 0.5 then 1 else 0 end,
    updated_at = now()
  where user_id = room.red_user_id;

  update public.connect4_ratings set
    rating = yellow_after,
    games_played = games_played + 1,
    wins = wins + case when yellow_score = 1.0 then 1 else 0 end,
    losses = losses + case when yellow_score = 0.0 then 1 else 0 end,
    draws = draws + case when yellow_score = 0.5 then 1 else 0 end,
    updated_at = now()
  where user_id = room.yellow_user_id;

  insert into public.connect4_matches (
    room_id, red_user_id, yellow_user_id, winner_user_id, result_reason,
    red_rating_before, yellow_rating_before, red_rating_after,
    yellow_rating_after, move_count
  ) values (
    room.id, room.red_user_id, room.yellow_user_id, p_winner_user_id, p_reason,
    red_rating, yellow_rating, red_after, yellow_after, room.move_count
  ) on conflict (room_id) do nothing;

  update public.connect4_rooms set
    status = 'completed',
    winner_user_id = p_winner_user_id,
    result_reason = p_reason,
    finished_at = now(),
    updated_at = now(),
    last_activity_at = now(),
    version = version + 1
  where id = room.id;
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

create or replace function public.connect4_join_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_code text := upper(trim(coalesce(p_code, '')));
  room public.connect4_rooms%rowtype;
  host_is_red boolean;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if normalized_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'invalid_room_code' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 42004));
  select * into room from public.connect4_rooms where code = normalized_code for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if caller_id in (room.host_user_id, room.guest_user_id) then
    return public.connect4_room_payload(room);
  end if;
  if room.status <> 'waiting' or room.guest_user_id is not null
     or room.created_at < now() - interval '30 minutes' then
    raise exception 'room_unavailable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.connect4_rooms existing
    where caller_id in (existing.host_user_id, existing.guest_user_id)
      and existing.status = 'active'
  ) then
    raise exception 'already_in_active_room' using errcode = 'P0001';
  end if;

  update public.connect4_rooms set
    status = 'abandoned', finished_at = now(), updated_at = now(), version = version + 1
  where host_user_id = caller_id and status = 'waiting';

  insert into public.connect4_ratings (user_id) values (caller_id)
  on conflict (user_id) do nothing;
  host_is_red := random() < 0.5;
  update public.connect4_rooms set
    guest_user_id = caller_id,
    red_user_id = case when host_is_red then host_user_id else caller_id end,
    yellow_user_id = case when host_is_red then caller_id else host_user_id end,
    status = 'active',
    turn_started_at = now(),
    updated_at = now(),
    last_activity_at = now(),
    version = version + 1
  where id = room.id
  returning * into room;

  return public.connect4_room_payload(room);
end;
$$;

create or replace function public.connect4_get_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_code text := upper(trim(coalesce(p_code, '')));
  room public.connect4_rooms%rowtype;
  timeout_winner uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  select * into room from public.connect4_rooms where code = normalized_code for update;
  if not found or caller_id not in (room.host_user_id, room.guest_user_id) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;

  if room.status = 'waiting' and room.created_at < now() - interval '30 minutes' then
    update public.connect4_rooms set
      status = 'expired', finished_at = now(), updated_at = now(), version = version + 1
    where id = room.id returning * into room;
  elsif room.status = 'active'
    and clock_timestamp() >= room.turn_started_at + make_interval(secs => room.turn_seconds) then
    timeout_winner := case when room.current_player = 1 then room.yellow_user_id else room.red_user_id end;
    perform public.connect4_finish_locked(room.id, timeout_winner, 'timeout');
    select * into room from public.connect4_rooms where id = room.id;
  end if;

  return public.connect4_room_payload(room);
end;
$$;

create or replace function public.connect4_play(p_code text, p_column integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_code text := upper(trim(coalesce(p_code, '')));
  room public.connect4_rooms%rowtype;
  expected_user uuid;
  timeout_winner uuid;
  row_index integer;
  board_index integer;
  new_board smallint[];
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_column is null or p_column not between 0 and 6 then
    raise exception 'invalid_column' using errcode = 'P0001';
  end if;

  select * into room from public.connect4_rooms where code = normalized_code for update;
  if not found or caller_id not in (room.host_user_id, room.guest_user_id) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if room.status <> 'active' then
    raise exception 'room_not_active' using errcode = 'P0001';
  end if;
  if clock_timestamp() >= room.turn_started_at + make_interval(secs => room.turn_seconds) then
    timeout_winner := case when room.current_player = 1 then room.yellow_user_id else room.red_user_id end;
    perform public.connect4_finish_locked(room.id, timeout_winner, 'timeout');
    select * into room from public.connect4_rooms where id = room.id;
    return public.connect4_room_payload(room);
  end if;

  expected_user := case when room.current_player = 1 then room.red_user_id else room.yellow_user_id end;
  if caller_id <> expected_user then
    raise exception 'not_your_turn' using errcode = 'P0001';
  end if;

  new_board := room.board;
  row_index := 5;
  while row_index >= 0 loop
    board_index := (row_index * 7) + p_column + 1;
    if new_board[board_index] = 0 then exit; end if;
    row_index := row_index - 1;
  end loop;
  if row_index < 0 then
    raise exception 'column_full' using errcode = 'P0001';
  end if;

  new_board[board_index] := room.current_player;
  update public.connect4_rooms set
    board = new_board,
    move_count = move_count + 1,
    updated_at = now(),
    last_activity_at = now(),
    version = version + 1
  where id = room.id
  returning * into room;

  if public.connect4_has_won(new_board, room.current_player) then
    perform public.connect4_finish_locked(room.id, caller_id, 'connect4');
  elsif room.move_count = 42 then
    perform public.connect4_finish_locked(room.id, null, 'draw');
  else
    update public.connect4_rooms set
      current_player = case when current_player = 1 then 2 else 1 end,
      turn_started_at = now(),
      updated_at = now(),
      version = version + 1
    where id = room.id;
  end if;

  select * into room from public.connect4_rooms where id = room.id;
  return public.connect4_room_payload(room);
end;
$$;

create or replace function public.connect4_resign(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_code text := upper(trim(coalesce(p_code, '')));
  room public.connect4_rooms%rowtype;
  winner uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  select * into room from public.connect4_rooms where code = normalized_code for update;
  if not found or caller_id not in (room.host_user_id, room.guest_user_id) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;

  if room.status = 'waiting' and caller_id = room.host_user_id then
    update public.connect4_rooms set
      status = 'abandoned', result_reason = 'resignation', finished_at = now(),
      updated_at = now(), last_activity_at = now(), version = version + 1
    where id = room.id returning * into room;
  elsif room.status = 'active' then
    winner := case when caller_id = room.red_user_id then room.yellow_user_id else room.red_user_id end;
    perform public.connect4_finish_locked(room.id, winner, 'resignation');
    select * into room from public.connect4_rooms where id = room.id;
  end if;

  return public.connect4_room_payload(room);
end;
$$;

create or replace function public.connect4_get_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  insert into public.connect4_ratings (user_id) values (caller_id)
  on conflict (user_id) do nothing;

  with ranked as (
    select rating.user_id, coalesce(profile.display_name, 'Joueur') as display_name,
      rating.rating, rating.games_played, rating.wins, rating.losses, rating.draws,
      row_number() over (order by rating.rating desc, rating.wins desc, rating.updated_at asc) as rank
    from public.connect4_ratings rating
    join public.profiles profile on profile.user_id = rating.user_id
  ), top_players as (
    select * from ranked order by rank limit 20
  )
  select jsonb_build_object(
    'top', coalesce((select jsonb_agg(to_jsonb(top_players) order by rank) from top_players), '[]'::jsonb),
    'me', (select to_jsonb(ranked) from ranked where ranked.user_id = caller_id),
    'server_now', clock_timestamp()
  ) into result;
  return result;
end;
$$;

revoke execute on function public.connect4_has_won(smallint[], smallint) from public, anon, authenticated;
revoke execute on function public.connect4_room_payload(public.connect4_rooms) from public, anon, authenticated;
revoke execute on function public.connect4_finish_locked(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.connect4_create_room(integer) from public, anon;
revoke execute on function public.connect4_join_room(text) from public, anon;
revoke execute on function public.connect4_get_room(text) from public, anon;
revoke execute on function public.connect4_play(text, integer) from public, anon;
revoke execute on function public.connect4_resign(text) from public, anon;
revoke execute on function public.connect4_get_leaderboard() from public, anon;

grant execute on function public.connect4_create_room(integer) to authenticated;
grant execute on function public.connect4_join_room(text) to authenticated;
grant execute on function public.connect4_get_room(text) to authenticated;
grant execute on function public.connect4_play(text, integer) to authenticated;
grant execute on function public.connect4_resign(text) to authenticated;
grant execute on function public.connect4_get_leaderboard() to authenticated;

update public.game_catalog set
  migration_stage = 'verified',
  verification_level = 'server',
  updated_at = now()
where game_key = 'puissance4';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'connect4_rooms'
  ) then
    alter publication supabase_realtime add table public.connect4_rooms;
  end if;
exception when undefined_object then
  null;
end;
$$;

notify pgrst, 'reload schema';
