(function arcadeGameConfig(global) {
  "use strict";

  global.ARCADE_GAME_CONFIG = Object.freeze({
    version: 1,
    states: Object.freeze(["created", "started", "won", "lost", "abandoned"]),
    transitions: Object.freeze({
      created: Object.freeze(["started", "abandoned"]),
      started: Object.freeze(["won", "lost", "abandoned"]),
      won: Object.freeze([]),
      lost: Object.freeze([]),
      abandoned: Object.freeze([]),
    }),
    preferences: Object.freeze({
      defaults: Object.freeze({
        sound: true,
        music: true,
        vibration: true,
        animations: true,
        visualIntensity: "balanced",
      }),
      visualIntensities: Object.freeze([
        Object.freeze({ id: "calm", label: "Discrète" }),
        Object.freeze({ id: "balanced", label: "Équilibrée" }),
        Object.freeze({ id: "vivid", label: "Vive" }),
      ]),
    }),
    shell: Object.freeze({
      homeUrl: "../../index.html",
      leaderboardLimit: 10,
      games: Object.freeze({
        "2048": Object.freeze({
          rulesTitle: "Règles · 2048",
          rules: "Déplacez les tuiles avec les flèches ou un geste tactile. Deux valeurs identiques fusionnent. Atteignez 2048 sans bloquer la grille.",
          pauseSupported: false,
        }),
      }),
    }),
  });
})(window);
