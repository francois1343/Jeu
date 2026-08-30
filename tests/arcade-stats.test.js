const assert = require("node:assert/strict");

global.window = global;
global.ARCADE_CONFIG = {
  gameCategories: {
    snake: ["arcade", "reflex"],
    sudoku: ["logic", "puzzle"],
  },
};
global.ArcadeLocalStore = {
  listProfiles: () => [{
    sessions: [
      { gameKey: "snake", title: "Snake", state: "won", startedAt: "2026-01-01T10:00:00.000Z", resolvedAt: "2026-01-01T10:01:00.000Z", metadata: { score: 20 } },
      { gameKey: "snake", title: "Snake", state: "lost", startedAt: "2026-01-01T11:00:00.000Z", resolvedAt: "2026-01-01T11:03:00.000Z", metadata: { score: 5 } },
      { gameKey: "sudoku", title: "Sudoku", state: "abandoned", startedAt: "2026-01-01T12:00:00.000Z", resolvedAt: "2026-01-01T12:02:00.000Z", metadata: {} },
      { gameKey: "not-started", title: "Brouillon", state: "created", metadata: {} },
    ],
  }],
};

require("../js/core/arcade-stats.js");

const games = global.ArcadeStats.getGameStats();
const snake = games.find((game) => game.key === "snake");
assert.equal(snake.plays, 2);
assert.equal(snake.wins, 1);
assert.equal(snake.losses, 1);
assert.equal(snake.successRate, 0.5);
assert.equal(snake.observedDifficulty, 0.5);
assert.equal(snake.averageScore, 12.5);
assert.equal(snake.averageDurationMs, 120000);
assert.equal(games.some((game) => game.key === "not-started"), false);

const overview = global.ArcadeStats.getOverview();
assert.equal(overview.totalPlays, 3);
assert.equal(overview.mostPlayedGames[0].key, "snake");
assert.equal(overview.mostAbandonedGames[0].key, "sudoku");
assert.equal(overview.mostPopularCategories[0].plays, 2);

console.log("arcade stats tests passed");
