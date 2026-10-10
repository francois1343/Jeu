-- Puissance 4 Live is server-authoritative for gameplay and Elo, but has no Coin economy.
-- Refuse any legacy client-result settlement for a Live room and refund a stake that an
-- older cached client may already have opened.

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
  result_payload jsonb := coalesce(p_client_result, '{}'::jsonb);
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  if p_outcome not in ('won', 'lost', 'abandoned') then
    raise exception 'invalid_outcome' using errcode = 'P0001';
  end if;
  if pg_column_size(result_payload) > 8192 then
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

  -- Live results belong to the authoritative connect4_* RPCs and must never mint Coins
  -- through the generic, browser-reported settlement endpoint.
  if session_row.game_key = 'puissance4'
     and (lower(coalesce(result_payload ->> 'mode', '')) = 'live' or result_payload ? 'room') then
    select * into wallet from public.wallet_accounts
    where user_id = caller_id for update;
    if not found then
      raise exception 'wallet_not_found' using errcode = 'P0001';
    end if;

    new_balance := wallet.balance_units + session_row.wager_units;
    if session_row.wager_units > 0 then
      update public.wallet_accounts set
        balance_units = new_balance,
        lifetime_spent_units = greatest(lifetime_spent_units - session_row.wager_units, 0),
        updated_at = now()
      where user_id = caller_id;

      insert into public.wallet_transactions (
        user_id, transaction_type, amount_units, balance_after_units,
        reference_type, reference_id, idempotency_key, metadata
      ) values (
        caller_id, 'refund', session_row.wager_units, new_balance,
        'game_session', session_row.id::text, 'refund:connect4-live:' || session_row.id::text,
        jsonb_build_object(
          'game_key', session_row.game_key,
          'reason', 'connect4_live_has_no_client_coin_settlement',
          'config_version', session_row.config_version
        )
      );
    end if;

    update public.game_sessions set
      status = 'cancelled',
      settled_at = now(),
      client_result = result_payload || jsonb_build_object(
        'reason', 'connect4_live_has_no_client_coin_settlement',
        'reported_outcome', p_outcome
      )
    where id = session_row.id;

    return jsonb_build_object(
      'session_id', session_row.id,
      'status', 'cancelled',
      'balance_units', new_balance,
      'payout_units', 0,
      'refunded_units', session_row.wager_units,
      'already_settled', false
    );
  end if;

  if session_row.expires_at < now() then
    update public.game_sessions set status = 'expired', settled_at = now(),
      client_result = result_payload where id = session_row.id;
    return jsonb_build_object(
      'session_id', session_row.id, 'status', 'expired',
      'balance_units', (select balance_units from public.wallet_accounts where user_id = caller_id),
      'payout_units', 0
    );
  end if;
  if p_outcome = 'won' and clock_timestamp() < session_row.started_at + interval '500 milliseconds' then
    update public.game_sessions set status = 'invalid', settled_at = now(),
      client_result = result_payload || jsonb_build_object('reason', 'too_fast')
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
    client_result = result_payload
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

revoke execute on function public.arcade_settle_client_game(uuid, text, jsonb) from public, anon;
grant execute on function public.arcade_settle_client_game(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
