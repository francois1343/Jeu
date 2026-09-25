insert into public.game_catalog (
  game_key, display_name, migration_stage, verification_level,
  economy_enabled, play_cost_units, win_payout_units
) values (
  'pile-face', 'Pile ou Face', 'candidate', 'none', true, 100, 200
)
on conflict (game_key) do update set
  economy_enabled = true,
  play_cost_units = 100,
  win_payout_units = 200,
  updated_at = now();

notify pgrst, 'reload schema';
