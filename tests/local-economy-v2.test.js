"use strict";

global.window = global;
global.CustomEvent = class CustomEvent {};
global.addEventListener = () => {};
global.dispatchEvent = () => {};

const values = new Map();
global.localStorage = {
  getItem: (key) => (values.has(key) ? values.get(key) : null),
  setItem: (key, value) => values.set(key, value),
};
global.ARCADE_CONFIG = {
  coins: { unitsPerCoin: 100 },
  localEconomy: {
    starterCoins: 5,
    playCostCoins: 1,
    winPayoutCoins: 1.25,
    maxHistoryEntries: 60,
    maxSessionEntries: 40,
    adminPseudos: ["ADMIN"],
    gamePolicies: {
      openworld: { economyMode: "practice" },
      tetris: { practiceModes: ["zen"] },
    },
  },
};

require("../arcade-local-store.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let alice = ArcadeLocalStore.login("Alice");
assert(alice.balanceUnits === 500, "Le bonus initial doit être de 5 Coins");

const cancelled = ArcadeLocalStore.createSession({
  gameKey: "snake",
  title: "Snake",
  url: "snake.html",
});
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 500, "Créer une session ne doit pas débiter");
ArcadeLocalStore.finishSession(cancelled.id, "abandoned", { reason: "left_before_start" });
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 500, "Quitter avant le démarrage doit être gratuit");

const won = ArcadeLocalStore.createSession({ gameKey: "snake", title: "Snake", url: "snake.html" });
ArcadeLocalStore.startSession(won.id);
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 400, "Le démarrage réel doit débiter 1 Coin");
ArcadeLocalStore.finishSession(won.id, "won", { score: 12 });
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 525, "Une victoire doit produire un gain net de 0,25 Coin");
ArcadeLocalStore.finishSession(won.id, "won", { duplicate: true });
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 525, "Un résultat dupliqué ne doit pas repayer");

const abandoned = ArcadeLocalStore.createSession({ gameKey: "pong", title: "Pong", url: "pong.html" });
ArcadeLocalStore.startSession(abandoned.id);
ArcadeLocalStore.finishSession(abandoned.id, "abandoned", { reason: "reload" });
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 425, "Un abandon après démarrage doit perdre la mise");

const lost = ArcadeLocalStore.createSession({ gameKey: "tetris", title: "Tetris", url: "tetris.html" });
ArcadeLocalStore.startSession(lost.id);
ArcadeLocalStore.finishSession(lost.id, "lost");
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 325, "Une défaite doit perdre la mise");

const practice = ArcadeLocalStore.createSession({ gameKey: "openworld", title: "Open World", url: "openworld.html" });
ArcadeLocalStore.startSession(practice.id);
ArcadeLocalStore.finishSession(practice.id, "abandoned");
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 325, "Un jeu d’entraînement ne doit jamais débiter");

const zen = ArcadeLocalStore.createSession({ gameKey: "tetris", title: "Tetris Zen", url: "tetris.html" });
ArcadeLocalStore.startSession(zen.id, { mode: "zen" });
ArcadeLocalStore.finishSession(zen.id, "abandoned");
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 325, "Un mode sans fin doit pouvoir devenir gratuit au démarrage");

const interrupted = ArcadeLocalStore.createSession({ gameKey: "snake", title: "Snake", url: "snake.html" });
ArcadeLocalStore.startSession(interrupted.id);
const recovered = ArcadeLocalStore.recoverActiveSession("grid_loaded");
assert(recovered.state === "abandoned", "Une session interrompue doit être récupérée comme abandon");
assert(ArcadeLocalStore.getActiveProfile().balanceUnits === 225, "La récupération ne doit pas rembourser une session commencée");

ArcadeLocalStore.login("ADMIN");
ArcadeLocalStore.adminAdjust("alice", 2, "add");
ArcadeLocalStore.adminAdjust("alice", 1, "remove");
alice = ArcadeLocalStore.getProfile("alice");
assert(alice.balanceUnits === 325, "Les ajustements administrateur doivent être appliqués");
assert(alice.history.some((entry) => entry.type === "game_cancelled"), "L’annulation avant démarrage doit être historisée");
assert(alice.history.some((entry) => entry.type === "game_abandoned"), "L’abandon après démarrage doit être historisé");

let negativeBalanceRejected = false;
try {
  ArcadeLocalStore.adminAdjust("alice", 999, "remove");
} catch (error) {
  negativeBalanceRejected = error.message === "negative_balance";
}
assert(negativeBalanceRejected, "Un ajustement ne doit pas rendre le solde négatif");

console.log("Cycle de session économique v2 : OK");
