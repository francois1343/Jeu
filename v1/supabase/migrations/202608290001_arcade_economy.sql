create extension if not exists pgcrypto;

create table public.economy_config (
  singleton boolean primary key default true check (singleton),
  version integer not null default 1 check (version > 0),
  enabled boolean not null default true,
  unit_name text not null default 'Coin',
  units_per_coin integer not null default 100 check (units_per_coin > 0),
  starter_grant_units integer not null default 300 check (starter_grant_units >= 0),
  default_play_cost_units integer not null default 100 check (default_play_cost_units >= 0),
  default_win_payout_units integer not null default 125 check (default_win_payout_units >= 0),
  rewarded_ad_units integer not null default 100 check (rewarded_ad_units >= 0),
  rewarded_ads_daily_limit integer not null default 3 check (rewarded_ads_daily_limit >= 0),
  daily_bonus_units integer not null default 100 check (daily_bonus_units >= 0),
  daily_win_bonus_cap_units integer not null default 500 check (daily_win_bonus_cap_units >= 0),
  max_paid_starts_per_minute integer not null default 10 check (max_paid_starts_per_minute > 0),
  max_paid_starts_per_day integer not null default 100 check (max_paid_starts_per_day > 0),
  updated_at timestamptz not null default now()
);

insert into public.economy_config (singleton) values (true)
on conflict (singleton) do nothing;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 2 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_units bigint not null default 0 check (balance_units >= 0),
  lifetime_earned_units bigint not null default 0 check (lifetime_earned_units >= 0),
  lifetime_spent_units bigint not null default 0 check (lifetime_spent_units >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in (
    'starter_grant', 'game_entry', 'game_win', 'rewarded_ad',
    'daily_bonus', 'achievement', 'admin_adjustment', 'refund'
  )),
  amount_units bigint not null check (amount_units <> 0),
  balance_after_units bigint not null check (balance_after_units >= 0),
  reference_type text,
  reference_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wallet_transaction_direction check (
    transaction_type = 'admin_adjustment'
    or (transaction_type = 'game_entry' and amount_units < 0)
    or (transaction_type <> 'game_entry' and amount_units > 0)
  ),
  unique (user_id, idempotency_key)
);

create index wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create or replace function public.prevent_wallet_transaction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Autorise uniquement le nettoyage déclenché en cascade par la suppression du compte Auth.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'wallet_transactions_are_immutable' using errcode = 'P0001';
end;
$$;

create trigger wallet_transactions_immutable
  before update or delete on public.wallet_transactions
  for each row execute procedure public.prevent_wallet_transaction_mutation();

create table public.game_catalog (
  game_key text primary key check (game_key ~ '^[a-z0-9_-]+$'),
  display_name text not null,
  page_path text,
  migration_stage text not null default 'practice' check (migration_stage in (
    'practice', 'candidate', 'verified', 'disabled'
  )),
  verification_level text not null default 'none' check (verification_level in (
    'none', 'replay', 'server'
  )),
  economy_enabled boolean not null default false,
  play_cost_units integer check (play_cost_units is null or play_cost_units >= 0),
  win_payout_units integer check (win_payout_units is null or win_payout_units >= 0),
  updated_at timestamptz not null default now()
);

insert into public.game_catalog
  (game_key, display_name, page_path, migration_stage, verification_level, economy_enabled)
values
  ('challenge_math', 'Calcul éclair', null, 'verified', 'server', true),
  ('challenge_sequence', 'Suite néon', null, 'verified', 'server', true),
  ('challenge_intruder', 'Intrus logique', null, 'verified', 'server', true),
  ('2048', '2048', '2048.html', 'candidate', 'replay', false),
  ('bataille-navale', 'Bataille Navale', 'bataillenavale.html', 'candidate', 'server', false),
  ('calcul-mental', 'Calcul Mental', 'calculation.html', 'candidate', 'server', false),
  ('casse-briques', 'Casse-Briques', 'cassebloc.html', 'practice', 'replay', false),
  ('pixel-forge', 'Pixel Forge', 'clickerbit.html', 'practice', 'none', false),
  ('crossy-turfu', 'Crossy Turfu', 'crossyturfu.html', 'practice', 'replay', false),
  ('cyberfind', 'CyberFind', 'cyberfind.html', 'candidate', 'server', false),
  ('cyber-flux', 'Cyber Flux', 'cyberflux.html', 'practice', 'replay', false),
  ('cyber-morpion', 'Cyber-Morpion', 'cybermorpion.html', 'practice', 'none', false),
  ('demineur', 'Démineur', 'demineur.html', 'candidate', 'server', false),
  ('enigme', 'Énigme Cosmique', 'enigme.html', 'candidate', 'server', false),
  ('geominds', 'GeoMinds', 'geominds.html', 'candidate', 'server', false),
  ('hifumi', 'HiFuMi', 'HiFuMi.html', 'practice', 'none', false),
  ('labyrinthe', 'Labyrinthe', 'labyrinthe.html', 'candidate', 'replay', false),
  ('tape-taupe', 'Tape-Taupe', 'marmotte.html', 'practice', 'none', false),
  ('memory', 'Memory', 'memory.html', 'candidate', 'server', false),
  ('neon-overdrive', 'Neon Overdrive', 'neon-overdrive.html', 'practice', 'replay', false),
  ('neon-runner', 'Neon Runner', 'neonrunner.html', 'practice', 'replay', false),
  ('neontron', 'Neontron', 'neontron.html', 'practice', 'none', false),
  ('open-world', 'Open World', 'openworld.html', 'practice', 'none', false),
  ('pong', 'Pong', 'pong.html', 'practice', 'none', false),
  ('puissance4', 'Puissance 4 Advance', 'puissance4.html', 'practice', 'none', false),
  ('chrono-reflexe', 'Chrono Réflexe', 'reflex.html', 'practice', 'none', false),
  ('simon', 'Simon Néon', 'simon.html', 'candidate', 'server', false),
  ('snake', 'Snake Néon', 'snake.html', 'practice', 'replay', false),
  ('spider-solitaire', 'Spider Solitaire', 'SpiderSolitaire.html', 'candidate', 'replay', false),
  ('sudoku', 'Sudoku', 'sudoku.html', 'candidate', 'server', false),
  ('synthwave-runner', 'Synthwave Runner', 'synthwave-runner.html', 'practice', 'replay', false),
  ('pixel-taquin', 'Pixel Taquin', 'taquin.html', 'candidate', 'server', false),
  ('tetris', 'Tetris', 'tetris.html', 'practice', 'replay', false)
on conflict (game_key) do update set
  display_name = excluded.display_name,
  page_path = excluded.page_path,
  updated_at = now();

create table public.game_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null references public.game_catalog(game_key),
  status text not null default 'started' check (status in (
    'started', 'won', 'lost', 'expired', 'cancelled', 'invalid'
  )),
  config_version integer not null,
  wager_units integer not null check (wager_units >= 0),
  potential_payout_units integer not null check (potential_payout_units >= 0),
  challenge_public jsonb not null default '{}'::jsonb,
  challenge_secret_hash text not null,
  client_result jsonb,
  idempotency_key text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  settled_at timestamptz,
  unique (user_id, idempotency_key)
);

create index game_sessions_user_started_idx
  on public.game_sessions (user_id, started_at desc);
create index game_sessions_open_idx
  on public.game_sessions (user_id, status, expires_at);

create table public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_reward_id text not null,
  placement text,
  amount_units integer not null check (amount_units > 0),
  status text not null default 'credited' check (status in ('credited', 'rejected', 'reversed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_reward_id)
);

create index reward_claims_user_created_idx
  on public.reward_claims (user_id, created_at desc);

alter table public.economy_config enable row level security;
alter table public.profiles enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.game_catalog enable row level security;
alter table public.game_sessions enable row level security;
alter table public.reward_claims enable row level security;

create policy economy_config_read on public.economy_config
  for select to anon, authenticated using (true);
create policy game_catalog_read on public.game_catalog
  for select to anon, authenticated using (true);
create policy profiles_read_own on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy wallets_read_own on public.wallet_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy transactions_read_own on public.wallet_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy rewards_read_own on public.reward_claims
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.wallet_accounts, public.wallet_transactions,
  public.game_sessions, public.reward_claims from anon, authenticated;
grant select on public.wallet_accounts, public.wallet_transactions,
  public.reward_claims to authenticated;
grant select on public.economy_config, public.game_catalog to anon, authenticated;
grant select, update (display_name) on public.profiles to authenticated;

create or replace function public.handle_new_arcade_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_units integer;
begin
  select starter_grant_units into grant_units
  from public.economy_config where singleton = true;

  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 32), ''))
  on conflict (user_id) do nothing;

  insert into public.wallet_accounts
    (user_id, balance_units, lifetime_earned_units)
  values (new.id, grant_units, grant_units)
  on conflict (user_id) do nothing;

  if grant_units > 0 then
    insert into public.wallet_transactions
      (user_id, transaction_type, amount_units, balance_after_units,
       reference_type, reference_id, idempotency_key)
    values
      (new.id, 'starter_grant', grant_units, grant_units,
       'account', new.id::text, 'starter:' || new.id::text)
    on conflict (user_id, idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_arcade on auth.users;
create trigger on_auth_user_created_arcade
  after insert on auth.users
  for each row execute procedure public.handle_new_arcade_user();

do $$
declare
  existing_user record;
  grant_units integer;
begin
  select starter_grant_units into grant_units
  from public.economy_config where singleton = true;

  for existing_user in select id, raw_user_meta_data from auth.users loop
    insert into public.profiles (user_id, display_name)
    values (
      existing_user.id,
      nullif(left(coalesce(existing_user.raw_user_meta_data ->> 'display_name', ''), 32), '')
    ) on conflict (user_id) do nothing;

    insert into public.wallet_accounts
      (user_id, balance_units, lifetime_earned_units)
    values (existing_user.id, grant_units, grant_units)
    on conflict (user_id) do nothing;

    if grant_units > 0 then
      insert into public.wallet_transactions
        (user_id, transaction_type, amount_units, balance_after_units,
         reference_type, reference_id, idempotency_key)
      values
        (existing_user.id, 'starter_grant', grant_units, grant_units,
         'account', existing_user.id::text, 'starter:' || existing_user.id::text)
      on conflict (user_id, idempotency_key) do nothing;
    end if;
  end loop;
end $$;

create or replace function public.arcade_start_session(
  p_session_id uuid,
  p_user_id uuid,
  p_game_key text,
  p_idempotency_key text,
  p_challenge_public jsonb,
  p_secret_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.economy_config%rowtype;
  game public.game_catalog%rowtype;
  wallet public.wallet_accounts%rowtype;
  existing_session public.game_sessions%rowtype;
  cost_units integer;
  payout_units integer;
  new_balance bigint;
begin
  select * into cfg from public.economy_config where singleton = true;
  if not found or not cfg.enabled then
    raise exception 'economy_disabled' using errcode = 'P0001';
  end if;

  select * into game from public.game_catalog where game_key = p_game_key;
  if not found or not game.economy_enabled or game.verification_level <> 'server' then
    raise exception 'game_not_economy_enabled' using errcode = 'P0001';
  end if;

  select * into existing_session from public.game_sessions
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'session_id', existing_session.id,
      'challenge', existing_session.challenge_public,
      'expires_at', existing_session.expires_at,
      'balance_units', (select balance_units from public.wallet_accounts where user_id = p_user_id),
      'replayed', true
    );
  end if;

  cost_units := coalesce(game.play_cost_units, cfg.default_play_cost_units);
  payout_units := coalesce(game.win_payout_units, cfg.default_win_payout_units);

  select * into wallet from public.wallet_accounts
  where user_id = p_user_id for update;
  if not found then
    raise exception 'wallet_not_found' using errcode = 'P0001';
  end if;
  if wallet.balance_units < cost_units then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  if (select count(*) from public.game_sessions
      where user_id = p_user_id and started_at > now() - interval '1 minute')
      >= cfg.max_paid_starts_per_minute then
    raise exception 'start_rate_limit' using errcode = 'P0001';
  end if;

  if (select count(*) from public.game_sessions
      where user_id = p_user_id and started_at >= date_trunc('day', now()))
      >= cfg.max_paid_starts_per_day then
    raise exception 'daily_start_limit' using errcode = 'P0001';
  end if;

  new_balance := wallet.balance_units - cost_units;
  update public.wallet_accounts set
    balance_units = new_balance,
    lifetime_spent_units = lifetime_spent_units + cost_units,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.game_sessions
    (id, user_id, game_key, config_version, wager_units,
     potential_payout_units, challenge_public, challenge_secret_hash,
     idempotency_key, expires_at)
  values
    (p_session_id, p_user_id, p_game_key, cfg.version, cost_units,
     payout_units, p_challenge_public, p_secret_hash,
     p_idempotency_key, p_expires_at);

  if cost_units > 0 then
    insert into public.wallet_transactions
      (user_id, transaction_type, amount_units, balance_after_units,
       reference_type, reference_id, idempotency_key,
       metadata)
    values
      (p_user_id, 'game_entry', -cost_units, new_balance,
       'game_session', p_session_id::text, 'entry:' || p_session_id::text,
       jsonb_build_object('game_key', p_game_key, 'config_version', cfg.version));
  end if;

  return jsonb_build_object(
    'session_id', p_session_id,
    'challenge', p_challenge_public,
    'expires_at', p_expires_at,
    'balance_units', new_balance,
    'wager_units', cost_units,
    'potential_payout_units', payout_units,
    'replayed', false
  );
end;
$$;

create or replace function public.arcade_settle_session(
  p_user_id uuid,
  p_session_id uuid,
  p_won boolean,
  p_invalid boolean,
  p_client_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.economy_config%rowtype;
  session_row public.game_sessions%rowtype;
  wallet public.wallet_accounts%rowtype;
  bonus_units bigint := 0;
  bonus_used bigint := 0;
  payout_units bigint := 0;
  new_balance bigint;
begin
  select * into cfg from public.economy_config where singleton = true;
  select * into session_row from public.game_sessions
  where id = p_session_id and user_id = p_user_id for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if session_row.status <> 'started' then
    return jsonb_build_object(
      'session_id', session_row.id,
      'status', session_row.status,
      'balance_units', (select balance_units from public.wallet_accounts where user_id = p_user_id),
      'already_settled', true
    );
  end if;

  if session_row.expires_at < now() then
    update public.game_sessions set status = 'expired', settled_at = now(),
      client_result = p_client_result where id = p_session_id;
    return jsonb_build_object(
      'session_id', p_session_id, 'status', 'expired',
      'balance_units', (select balance_units from public.wallet_accounts where user_id = p_user_id),
      'payout_units', 0
    );
  end if;

  if p_invalid then
    update public.game_sessions set status = 'invalid', settled_at = now(),
      client_result = p_client_result where id = p_session_id;
    return jsonb_build_object(
      'session_id', p_session_id, 'status', 'invalid',
      'balance_units', (select balance_units from public.wallet_accounts where user_id = p_user_id),
      'payout_units', 0
    );
  end if;

  if not p_won then
    update public.game_sessions set status = 'lost', settled_at = now(),
      client_result = p_client_result where id = p_session_id;
    return jsonb_build_object(
      'session_id', p_session_id, 'status', 'lost',
      'balance_units', (select balance_units from public.wallet_accounts where user_id = p_user_id),
      'payout_units', 0
    );
  end if;

  select * into wallet from public.wallet_accounts
  where user_id = p_user_id for update;

  bonus_units := greatest(session_row.potential_payout_units - session_row.wager_units, 0);
  select coalesce(sum((metadata ->> 'bonus_units')::bigint), 0)
  into bonus_used
  from public.wallet_transactions
  where user_id = p_user_id
    and transaction_type = 'game_win'
    and created_at >= date_trunc('day', now());

  bonus_units := least(bonus_units, greatest(cfg.daily_win_bonus_cap_units - bonus_used, 0));
  payout_units := session_row.wager_units + bonus_units;

  new_balance := wallet.balance_units + payout_units;

  update public.wallet_accounts set
    balance_units = new_balance,
    lifetime_earned_units = lifetime_earned_units + payout_units,
    updated_at = now()
  where user_id = p_user_id;

  update public.game_sessions set status = 'won', settled_at = now(),
    client_result = p_client_result where id = p_session_id;

  insert into public.wallet_transactions
    (user_id, transaction_type, amount_units, balance_after_units,
     reference_type, reference_id, idempotency_key, metadata)
  values
    (p_user_id, 'game_win', payout_units, new_balance,
     'game_session', p_session_id::text, 'win:' || p_session_id::text,
     jsonb_build_object(
       'game_key', session_row.game_key,
       'wager_return_units', session_row.wager_units,
       'bonus_units', bonus_units,
       'config_version', session_row.config_version
     ));

  return jsonb_build_object(
    'session_id', p_session_id, 'status', 'won',
    'balance_units', new_balance, 'payout_units', payout_units,
    'bonus_units', bonus_units
  );
end;
$$;

create or replace function public.arcade_credit_rewarded_ad(
  p_user_id uuid,
  p_provider text,
  p_provider_reward_id text,
  p_placement text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.economy_config%rowtype;
  wallet public.wallet_accounts%rowtype;
  existing_claim public.reward_claims%rowtype;
  claims_today integer;
  new_balance bigint;
begin
  select * into cfg from public.economy_config where singleton = true;

  select * into existing_claim from public.reward_claims
  where provider = p_provider and provider_reward_id = p_provider_reward_id;
  if found then
    return jsonb_build_object(
      'credited', false, 'duplicate', true,
      'balance_units', (select balance_units from public.wallet_accounts where user_id = p_user_id)
    );
  end if;

  select * into wallet from public.wallet_accounts
  where user_id = p_user_id for update;
  if not found then
    raise exception 'wallet_not_found' using errcode = 'P0001';
  end if;

  select * into existing_claim from public.reward_claims
  where provider = p_provider and provider_reward_id = p_provider_reward_id;
  if found then
    return jsonb_build_object(
      'credited', false, 'duplicate', true,
      'balance_units', wallet.balance_units
    );
  end if;

  select count(*) into claims_today from public.reward_claims
  where user_id = p_user_id and status = 'credited'
    and created_at >= date_trunc('day', now());
  if claims_today >= cfg.rewarded_ads_daily_limit then
    raise exception 'rewarded_ad_daily_limit' using errcode = 'P0001';
  end if;

  new_balance := wallet.balance_units + cfg.rewarded_ad_units;
  update public.wallet_accounts set
    balance_units = new_balance,
    lifetime_earned_units = lifetime_earned_units + cfg.rewarded_ad_units,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.reward_claims
    (user_id, provider, provider_reward_id, placement, amount_units, metadata)
  values
    (p_user_id, p_provider, p_provider_reward_id, p_placement,
     cfg.rewarded_ad_units, p_metadata);

  insert into public.wallet_transactions
    (user_id, transaction_type, amount_units, balance_after_units,
     reference_type, reference_id, idempotency_key, metadata)
  values
    (p_user_id, 'rewarded_ad', cfg.rewarded_ad_units, new_balance,
     'rewarded_ad', p_provider_reward_id,
     'ad:' || p_provider || ':' || p_provider_reward_id,
     jsonb_build_object('provider', p_provider, 'placement', p_placement));

  return jsonb_build_object(
    'credited', true, 'duplicate', false,
    'amount_units', cfg.rewarded_ad_units,
    'balance_units', new_balance,
    'remaining_today', greatest(cfg.rewarded_ads_daily_limit - claims_today - 1, 0)
  );
end;
$$;

revoke all on function public.arcade_start_session(uuid, uuid, text, text, jsonb, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.arcade_settle_session(uuid, uuid, boolean, boolean, jsonb)
  from public, anon, authenticated;
revoke all on function public.arcade_credit_rewarded_ad(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.arcade_start_session(uuid, uuid, text, text, jsonb, text, timestamptz)
  to service_role;
grant execute on function public.arcade_settle_session(uuid, uuid, boolean, boolean, jsonb)
  to service_role;
grant execute on function public.arcade_credit_rewarded_ad(uuid, text, text, text, jsonb)
  to service_role;
