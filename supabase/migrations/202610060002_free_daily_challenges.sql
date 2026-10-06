-- Les défis quotidiens sont gratuits et leur plafond ne compte que leurs propres gains.
update public.economy_config
set
  version = version + 1,
  daily_win_bonus_cap_units = 600,
  updated_at = now()
where singleton = true;

update public.game_catalog
set
  economy_enabled = true,
  play_cost_units = 0,
  win_payout_units = 200,
  updated_at = now()
where game_key in ('challenge_math', 'challenge_sequence', 'challenge_intruder');

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
    and metadata ->> 'game_key' in ('challenge_math', 'challenge_sequence', 'challenge_intruder')
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

  if payout_units > 0 then
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
  end if;

  return jsonb_build_object(
    'session_id', p_session_id, 'status', 'won',
    'balance_units', new_balance, 'payout_units', payout_units,
    'bonus_units', bonus_units
  );
end;
$$;

revoke all on function public.arcade_settle_session(uuid, uuid, boolean, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.arcade_settle_session(uuid, uuid, boolean, boolean, jsonb)
  to service_role;

notify pgrst, 'reload schema';
