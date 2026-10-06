-- Les expériences sans enjeu restent accessibles sans portefeuille serveur.
update public.game_catalog
set
  economy_enabled = false,
  play_cost_units = 0,
  win_payout_units = 0,
  updated_at = now()
where game_key in ('pile-face', 'phrase-forge');

notify pgrst, 'reload schema';
