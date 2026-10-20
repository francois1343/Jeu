-- Aggregated, read-only administration dashboard.
-- The browser cannot call this RPC directly: the admin-dashboard Edge Function checks
-- the signed-in administrator before invoking it with the service role.

create or replace function public.arcade_admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  range_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  result jsonb;
begin
  select jsonb_build_object(
    'generated_at', clock_timestamp(),
    'range_days', range_days,
    'overview', jsonb_build_object(
      'total_accounts', (select count(*) from auth.users),
      'confirmed_accounts', (select count(*) from auth.users where email_confirmed_at is not null),
      'active_24h', (select count(*) from auth.users where last_sign_in_at >= now() - interval '24 hours'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
      'wallets', (select count(*) from public.wallet_accounts),
      'total_balance_units', (select coalesce(sum(balance_units), 0) from public.wallet_accounts),
      'average_balance_units', (select coalesce(round(avg(balance_units)), 0) from public.wallet_accounts),
      'total_sessions', (select count(*) from public.game_sessions),
      'sessions_7d', (select count(*) from public.game_sessions where started_at >= now() - interval '7 days'),
      'wins', (select count(*) from public.game_sessions where status = 'won'),
      'losses', (select count(*) from public.game_sessions where status in ('lost', 'abandoned')),
      'open_matches', (select count(*) from public.matches where status in ('waiting', 'active')),
      'completed_matches', (select count(*) from public.matches where status = 'completed')
    ),
    'quality', jsonb_build_object(
      'catalog_games', (select count(*) from public.game_catalog),
      'server_verified_games', (select count(*) from public.game_catalog where verification_level = 'server'),
      'economy_enabled_games', (select count(*) from public.game_catalog where economy_enabled),
      'candidate_games', (select count(*) from public.game_catalog where migration_stage = 'candidate'),
      'verified_games', (select count(*) from public.game_catalog where migration_stage = 'verified')
    ),
    'session_statuses', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', total) order by total desc)
      from (
        select status, count(*) as total from public.game_sessions group by status
      ) statuses
    ), '[]'::jsonb),
    'match_modes', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'count', total) order by total desc)
      from (
        select mode, count(*) as total from public.matches group by mode
      ) modes
    ), '[]'::jsonb),
    'coin_distribution', (
      select jsonb_build_array(
        jsonb_build_object('label', '0 Coin', 'count', count(*) filter (where balance_units = 0)),
        jsonb_build_object('label', '< 1 Coin', 'count', count(*) filter (where balance_units between 1 and 99)),
        jsonb_build_object('label', '1–5 Coins', 'count', count(*) filter (where balance_units between 100 and 499)),
        jsonb_build_object('label', '5–10 Coins', 'count', count(*) filter (where balance_units between 500 and 999)),
        jsonb_build_object('label', '10+ Coins', 'count', count(*) filter (where balance_units >= 1000))
      ) from public.wallet_accounts
    ),
    'daily_signups', coalesce((
      select jsonb_agg(jsonb_build_object('date', day::date, 'count', total) order by day)
      from (
        select series.day, count(users.id) as total
        from generate_series(
          current_date - (range_days - 1), current_date, interval '1 day'
        ) series(day)
        left join auth.users users on users.created_at::date = series.day::date
        group by series.day
      ) signups
    ), '[]'::jsonb),
    'daily_sessions', coalesce((
      select jsonb_agg(jsonb_build_object('date', day::date, 'count', total) order by day)
      from (
        select series.day, count(sessions.id) as total
        from generate_series(
          current_date - (range_days - 1), current_date, interval '1 day'
        ) series(day)
        left join public.game_sessions sessions on sessions.started_at::date = series.day::date
        group by series.day
      ) activity
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(to_jsonb(player_row) order by player_row.balance_units desc, player_row.created_at desc)
      from (
        select
          users.id as user_id,
          coalesce(profiles.display_name, 'Joueur') as display_name,
          coalesce(wallets.balance_units, 0) as balance_units,
          coalesce(wallets.lifetime_earned_units, 0) as lifetime_earned_units,
          coalesce(wallets.lifetime_spent_units, 0) as lifetime_spent_units,
          users.created_at,
          users.last_sign_in_at,
          count(sessions.id) as sessions,
          count(sessions.id) filter (where sessions.status = 'won') as wins
        from auth.users users
        left join public.profiles profiles on profiles.user_id = users.id
        left join public.wallet_accounts wallets on wallets.user_id = users.id
        left join public.game_sessions sessions on sessions.user_id = users.id
        group by users.id, profiles.display_name, wallets.balance_units,
          wallets.lifetime_earned_units, wallets.lifetime_spent_units,
          users.created_at, users.last_sign_in_at
        order by coalesce(wallets.balance_units, 0) desc, users.created_at desc
        limit 200
      ) player_row
    ), '[]'::jsonb),
    'top_games', coalesce((
      select jsonb_agg(to_jsonb(game_row) order by game_row.sessions desc)
      from (
        select game_key, count(*) as sessions,
          count(*) filter (where status = 'won') as wins,
          count(distinct user_id) as unique_players
        from public.game_sessions
        group by game_key
        order by count(*) desc
        limit 12
      ) game_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.arcade_admin_dashboard(integer) from public, anon, authenticated;
grant execute on function public.arcade_admin_dashboard(integer) to service_role;

notify pgrst, 'reload schema';
