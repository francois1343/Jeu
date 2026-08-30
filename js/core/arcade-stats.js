(function arcadeStats(global) {
  "use strict";

  const categoryMap = global.ARCADE_CONFIG?.localEconomy?.gameCategories || global.ARCADE_CONFIG?.gameCategories || {};

  function emptyBucket(key, title) {
    return {
      key,
      title,
      plays: 0,
      wins: 0,
      losses: 0,
      abandons: 0,
      resolved: 0,
      scoreTotal: 0,
      scoreCount: 0,
      durationTotalMs: 0,
      durationCount: 0,
    };
  }

  function addSession(bucket, session) {
    if (!session?.startedAt) return;
    bucket.plays += 1;
    if (session.state === "won") bucket.wins += 1;
    if (session.state === "lost") bucket.losses += 1;
    if (session.state === "abandoned") bucket.abandons += 1;
    if (session.state === "won" || session.state === "lost") bucket.resolved += 1;

    const score = Number(session.metadata?.score);
    if (Number.isFinite(score)) {
      bucket.scoreTotal += score;
      bucket.scoreCount += 1;
    }

    const startedAt = Date.parse(session.startedAt);
    const resolvedAt = Date.parse(session.resolvedAt);
    if (Number.isFinite(startedAt) && Number.isFinite(resolvedAt) && resolvedAt >= startedAt) {
      bucket.durationTotalMs += resolvedAt - startedAt;
      bucket.durationCount += 1;
    }
  }

  function finalize(bucket) {
    const successRate = bucket.resolved ? bucket.wins / bucket.resolved : null;
    return {
      key: bucket.key,
      title: bucket.title,
      plays: bucket.plays,
      wins: bucket.wins,
      losses: bucket.losses,
      abandons: bucket.abandons,
      resolved: bucket.resolved,
      successRate,
      abandonRate: bucket.plays ? bucket.abandons / bucket.plays : null,
      observedDifficulty: successRate === null ? null : 1 - successRate,
      averageScore: bucket.scoreCount ? bucket.scoreTotal / bucket.scoreCount : null,
      averageDurationMs: bucket.durationCount ? bucket.durationTotalMs / bucket.durationCount : null,
    };
  }

  function collect() {
    const games = new Map();
    const categories = new Map();
    const profiles = global.ArcadeLocalStore?.listProfiles?.() || [];

    profiles.forEach((profile) => {
      (profile.sessions || []).forEach((session) => {
        if (!session?.startedAt) return;
        const gameKey = session.gameKey || "unknown";
        if (!games.has(gameKey)) games.set(gameKey, emptyBucket(gameKey, session.title || gameKey));
        addSession(games.get(gameKey), session);

        const sessionCategories = categoryMap[gameKey]?.length ? categoryMap[gameKey] : ["other"];
        sessionCategories.forEach((category) => {
          if (!categories.has(category)) categories.set(category, emptyBucket(category, category));
          addSession(categories.get(category), session);
        });
      });
    });

    return {
      games: [...games.values()].map(finalize),
      categories: [...categories.values()].map(finalize),
    };
  }

  function byMetric(items, metric, direction = "desc") {
    const sign = direction === "asc" ? 1 : -1;
    return [...items].sort((left, right) => {
      const leftValue = left[metric] ?? -1;
      const rightValue = right[metric] ?? -1;
      if (leftValue === rightValue) return left.title.localeCompare(right.title, "fr");
      return (leftValue - rightValue) * sign;
    });
  }

  function overview() {
    const result = collect();
    return {
      ...result,
      totalPlays: result.games.reduce((total, item) => total + item.plays, 0),
      mostPlayedGames: byMetric(result.games, "plays").slice(0, 10),
      hardestGames: byMetric(result.games.filter((item) => item.observedDifficulty !== null), "observedDifficulty").slice(0, 10),
      mostAbandonedGames: byMetric(result.games, "abandons").slice(0, 10),
      mostPopularCategories: byMetric(result.categories, "plays").slice(0, 10),
    };
  }

  global.ArcadeStats = Object.freeze({
    getGameStats: () => collect().games,
    getCategoryStats: () => collect().categories,
    getOverview: overview,
    sortBy: byMetric,
  });
})(window);
