-- Paid catalogue sessions: 1 Coin stake, 2 Coins gross payout on a win.
-- Results are currently client-reported for catalogue games; wallet amounts remain server-owned.

update public.economy_config set
  version = version + 1,
  default_play_cost_units = 100,
  default_win_payout_units = 200,
  updated_at = now()
where singleton = true;

with catalogue(game_key) as (
  select unnest(array[
    '421-duel', '2048', 'bataille', 'bubble-shooter', 'calculation',
    'casse-blocs', 'crossyturfu', 'cyber-bounty-hunter', 'cyber-core-sorter',
    'cyber-symbol-poker', 'cyberfind', 'cyberflux', 'cybermorpion', 'de',
    'demineur', 'enigme', 'farkle-boheme', 'geominds', 'hifumi', 'labyrinthe',
    'marmotte', 'memory', 'neon', 'neon-card-match', 'neon-dice-arena', 'neon-overdrive',
    'neontron', 'openworld', 'phrase-forge', 'pixel-forge', 'pixel-taquin',
    'poker', 'pong', 'puissance4', 'reflex', 'reflex-lab', 'simon', 'snake',
    'spider-solitaire', 'sudoku', 'synthwave-edition', 'synthwave-runner',
    'taquin', 'tetris'
  ]::text[])
)
insert into public.game_catalog (
  game_key, display_name, migration_stage, verification_level,
  economy_enabled, play_cost_units, win_payout_units
)
select
  game_key,
  initcap(replace(game_key, '-', ' ')),
  'candidate',
  'none',
  true,
  100,
  200
from catalogue
on conflict (game_key) do update set
  economy_enabled = true,
  play_cost_units = 100,
  win_payout_units = 200,
  updated_at = now();

alter table public.game_sessions
  drop constraint if exists game_sessions_status_check;
alter table public.game_sessions
  add constraint game_sessions_status_check check (status in (
    'started', 'won', 'lost', 'abandoned', 'expired', 'cancelled', 'invalid'
  ));

create or replace function public.arcade_start_client_game(
  p_game_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  cfg public.economy_config%rowtype;
  game public.game_catalog%rowtype;
  wallet public.wallet_accounts%rowtype;
  existing_session public.game_sessions%rowtype;
  session_id uuid := gen_random_uuid();
  cost_units integer;
  payout_units integer;
  new_balance bigint;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_game_key is null or p_game_key !~ '^[a-z0-9_-]{1,64}$' then
    raise exception 'invalid_game_key' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9:_-]{12,100}$' then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 43001));

  select * into existing_session
  from public.game_sessions
  where user_id = caller_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'session_id', existing_session.id,
      'game_key', existing_session.game_key,
      'status', existing_session.status,
      'wager_units', existing_session.wager_units,
      'potential_payout_units', existing_session.potential_payout_units,
      'balance_units', (select balance_units from public.wallet_accounts where user_id = caller_id),
      'started_at', existing_session.started_at,
      'expires_at', existing_session.expires_at,
      'replayed', true
    );
  end if;

  select * into cfg from public.economy_config where singleton = true;
  if not found or not cfg.enabled then
    raise exception 'economy_disabled' using errcode = 'P0001';
  end if;

  select * into game from public.game_catalog where game_key = p_game_key;
  if not found or not game.economy_enabled or game.migration_stage = 'disabled' then
    raise exception 'game_not_economy_enabled' using errcode = 'P0001';
  end if;

  if (select count(*) from public.game_sessions
      where user_id = caller_id and started_at > now() - interval '1 minute')
      >= cfg.max_paid_starts_per_minute then
    raise exception 'start_rate_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.game_sessions
      where user_id = caller_id and started_at >= date_trunc('day', now()))
      >= cfg.max_paid_starts_per_day then
    raise exception 'daily_start_limit' using errcode = 'P0001';
  end if;

  cost_units := coalesce(game.play_cost_units, cfg.default_play_cost_units);
  payout_units := coalesce(game.win_payout_units, cfg.default_win_payout_units);
  select * into wallet from public.wallet_accounts
  where user_id = caller_id for update;
  if not found then
    raise exception 'wallet_not_found' using errcode = 'P0001';
  end if;
  if wallet.balance_units < cost_units then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  new_balance := wallet.balance_units - cost_units;
  update public.wallet_accounts set
    balance_units = new_balance,
    lifetime_spent_units = lifetime_spent_units + cost_units,
    updated_at = now()
  where user_id = caller_id;

  insert into public.game_sessions (
    id, user_id, game_key, config_version, wager_units,
    potential_payout_units, challenge_public, challenge_secret_hash,
    idempotency_key, expires_at
  ) values (
    session_id, caller_id, p_game_key, cfg.version, cost_units,
    payout_units, jsonb_build_object('validation', 'client_result'),
    'client-result-v1', p_idempotency_key, now() + interval '12 hours'
  );

  if cost_units > 0 then
    insert into public.wallet_transactions (
      user_id, transaction_type, amount_units, balance_after_units,
      reference_type, reference_id, idempotency_key, metadata
    ) values (
      caller_id, 'game_entry', -cost_units, new_balance,
      'game_session', session_id::text, 'entry:' || session_id::text,
      jsonb_build_object('game_key', p_game_key, 'config_version', cfg.version,
        'validation', 'client_result')
    );
  end if;

  return jsonb_build_object(
    'session_id', session_id,
    'game_key', p_game_key,
    'status', 'started',
    'wager_units', cost_units,
    'potential_payout_units', payout_units,
    'balance_units', new_balance,
    'started_at', now(),
    'expires_at', now() + interval '12 hours',
    'replayed', false
  );
end;
$$;

create or replace function public.arcade_get_client_game(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  session_row public.game_sessions%rowtype;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  select * into session_row from public.game_sessions
  where id = p_session_id and user_id = caller_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'session_id', session_row.id,
    'game_key', session_row.game_key,
    'status', session_row.status,
    'wager_units', session_row.wager_units,
    'potential_payout_units', session_row.potential_payout_units,
    'balance_units', (select balance_units from public.wallet_accounts where user_id = caller_id),
    'started_at', session_row.started_at,
    'expires_at', session_row.expires_at,
    'settled_at', session_row.settled_at
  );
end;
$$;

create or replace function public.arcade_settle_client_game(
  p_session_id uuid,
  p_outcome text,
  p_client_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  session_row public.game_sessions%rowtype;
  wallet public.wallet_accounts%rowtype;
  new_balance bigint;
  payout_units integer := 0;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_outcome not in ('won', 'lost', 'abandoned') then
    raise exception 'invalid_outcome' using errcode = 'P0001';
  end if;
  if pg_column_size(coalesce(p_client_result, '{}'::jsonb)) > 8192 then
    raise exception 'client_result_too_large' using errcode = 'P0001';
  end if;

  select * into session_row from public.game_sessions
  where id = p_session_id and user_id = caller_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if session_row.challenge_secret_hash <> 'client-result-v1' then
    raise exception 'invalid_session_type' using errcode = 'P0001';
  end if;
  if session_row.status <> 'started' then
    return jsonb_build_object(
      'session_id', session_row.id,
      'status', session_row.status,
      'balance_units', (select balance_units from public.wallet_accounts where user_id = caller_id),
      'payout_units', 0,
      'already_settled', true
    );
  end if;
  if session_row.expires_at < now() then
    update public.game_sessions set status = 'expired', settled_at = now(),
      client_result = coalesce(p_client_result, '{}'::jsonb) where id = session_row.id;
    return jsonb_build_object(
      'session_id', session_row.id, 'status', 'expired',
      'balance_units', (select balance_units from public.wallet_accounts where user_id = caller_id),
      'payout_units', 0
    );
  end if;
  if p_outcome = 'won' and clock_timestamp() < session_row.started_at + interval '500 milliseconds' then
    update public.game_sessions set status = 'invalid', settled_at = now(),
      client_result = coalesce(p_client_result, '{}'::jsonb) || jsonb_build_object('reason', 'too_fast')
    where id = session_row.id;
    return jsonb_build_object(
      'session_id', session_row.id, 'status', 'invalid',
      'balance_units', (select balance_units from public.wallet_accounts where user_id = caller_id),
      'payout_units', 0
    );
  end if;

  if p_outcome = 'won' then
    select * into wallet from public.wallet_accounts
    where user_id = caller_id for update;
    payout_units := session_row.potential_payout_units;
    new_balance := wallet.balance_units + payout_units;
    update public.wallet_accounts set
      balance_units = new_balance,
      lifetime_earned_units = lifetime_earned_units + payout_units,
      updated_at = now()
    where user_id = caller_id;
    insert into public.wallet_transactions (
      user_id, transaction_type, amount_units, balance_after_units,
      reference_type, reference_id, idempotency_key, metadata
    ) values (
      caller_id, 'game_win', payout_units, new_balance,
      'game_session', session_row.id::text, 'win:' || session_row.id::text,
      jsonb_build_object('game_key', session_row.game_key,
        'wager_return_units', session_row.wager_units,
        'opponent_stake_units', greatest(payout_units - session_row.wager_units, 0),
        'config_version', session_row.config_version,
        'validation', 'client_result')
    );
  else
    select balance_units into new_balance from public.wallet_accounts where user_id = caller_id;
  end if;

  update public.game_sessions set
    status = p_outcome,
    settled_at = now(),
    client_result = coalesce(p_client_result, '{}'::jsonb)
  where id = session_row.id;

  return jsonb_build_object(
    'session_id', session_row.id,
    'status', p_outcome,
    'balance_units', new_balance,
    'payout_units', payout_units,
    'already_settled', false
  );
end;
$$;

revoke execute on function public.arcade_start_client_game(text, text) from public, anon;
revoke execute on function public.arcade_get_client_game(uuid) from public, anon;
revoke execute on function public.arcade_settle_client_game(uuid, text, jsonb) from public, anon;
grant execute on function public.arcade_start_client_game(text, text) to authenticated;
grant execute on function public.arcade_get_client_game(uuid) to authenticated;
grant execute on function public.arcade_settle_client_game(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
