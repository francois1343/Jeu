(function arcadeGameConfig(global) {
  "use strict";

  global.ARCADE_GAME_CONFIG = Object.freeze({
    version: 2,
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
        crossyturfu: Object.freeze({
          rulesTitle: "Règles · Crossy Turfu",
          rules: "Traversez les voies, évitez les obstacles et poussez votre distance sans rester immobile trop longtemps.",
          pauseSupported: true,
          tutorial: Object.freeze([
            Object.freeze({ title: "Objectif", text: "Allez le plus loin possible sans collision." }),
            Object.freeze({ title: "Commandes", text: "Flèches ou ZQSD au clavier ; boutons ou glissement sur mobile." }),
            Object.freeze({ title: "Fin", text: "Une collision termine la course. Battez votre score au prochain essai." }),
          ]),
        }),
        "421-duel": Object.freeze({
          rulesTitle: "Règles · 421 Duel",
          rules: "Lancez jusqu'à trois fois, gardez les dés utiles puis validez votre main. Le premier à trois manches gagne.",
          pauseSupported: true,
          tutorial: Object.freeze([
            Object.freeze({ title: "Objectif", text: "Remportez trois manches avant l'IA." }),
            Object.freeze({ title: "Commandes", text: "Lancez, sélectionnez les dés à garder, puis validez votre main." }),
            Object.freeze({ title: "Priorité", text: "421 bat le brelan, le double, la suite puis les autres mains." }),
          ]),
        }),
        "farkle-boheme": Object.freeze({
          rulesTitle: "Règles · Dés de Bohême",
          rules: "Gardez uniquement des dés qui marquent, puis encaissez ou relancez. Une bredouille annule les points du tour.",
          pauseSupported: true,
          tutorial: Object.freeze([
            Object.freeze({ title: "Objectif", text: "Atteignez le score cible avant votre adversaire." }),
            Object.freeze({ title: "Commandes", text: "Lancez, choisissez une combinaison, puis encaissez ou relancez." }),
            Object.freeze({ title: "Risque", text: "Sans dé marquant, tous les points du tour sont perdus." }),
          ]),
        }),
        poker: Object.freeze({
          rulesTitle: "Règles · River Room Poker",
          rules: "Formez la meilleure main de cinq cartes en combinant vos deux cartes et les cartes communes. Les jetons restent fictifs.",
          pauseSupported: true,
          tutorial: Object.freeze([
            Object.freeze({ title: "Objectif", text: "Remportez les pots avec la meilleure main ou en faisant coucher vos adversaires." }),
            Object.freeze({ title: "Commandes", text: "Utilisez les boutons ou F pour vous coucher, C pour parole/suivre et R pour relancer." }),
            Object.freeze({ title: "Crédits", text: "Toutes les mises utilisent des jetons fictifs sans valeur réelle." }),
          ]),
        }),
        "cyber-core-sorter": Object.freeze({
          rulesTitle: "Règles · Cyber-Core Sorter",
          rules: "Envoyez chaque noyau cyan à gauche et chaque noyau magenta à droite avant l'expiration de sa charge.",
          pauseSupported: true,
          tutorial: Object.freeze([
            Object.freeze({ title: "Objectif", text: "Triez les noyaux avant leur explosion." }),
            Object.freeze({ title: "Commandes", text: "Glissez vers un silo ou utilisez les flèches gauche et droite." }),
            Object.freeze({ title: "Fin", text: "Un mauvais silo ou une charge épuisée termine la partie." }),
          ]),
        }),
        taquin: Object.freeze({
          rulesTitle: "Règles · Pixel Taquin",
          rules: "Déplacez les tuiles voisines de la case vide jusqu'à reconstruire l'image dans le bon ordre.",
          pauseSupported: true,
          tutorial: Object.freeze([
            Object.freeze({ title: "Objectif", text: "Remettez toutes les tuiles dans l'ordre." }),
            Object.freeze({ title: "Commandes", text: "Touchez une tuile voisine, glissez ou utilisez les flèches." }),
            Object.freeze({ title: "Score", text: "Résolvez le puzzle avec peu de coups et le meilleur temps." }),
          ]),
        }),
        "2048": Object.freeze({
          rulesTitle: "Règles · 2048",
          rules: "Déplacez les tuiles avec les flèches ou un geste tactile. Deux valeurs identiques fusionnent. Atteignez 2048 sans bloquer la grille.",
          pauseSupported: false,
        }),
      }),
    }),
  });
})(window);
