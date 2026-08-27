// Système de progression avec localStorage
const gameStats = {
  save: (game, data) => {
    const stats = JSON.parse(localStorage.getItem("gameStats") || "{}");
    stats[game] = { ...stats[game], ...data };
    localStorage.setItem("gameStats", JSON.stringify(stats));
  },
  get: (game) => {
    const stats = JSON.parse(localStorage.getItem("gameStats") || "{}");
    return stats[game] || {};
  },
};
