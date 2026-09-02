(function arcadeAdminData(global) {
  "use strict";

  const store = global.ArcadeLocalStore;
  const feedbackStore = global.ArcadeFeedbackStore;
  const auditStore = global.ArcadeAuditStore;
  const config = global.ARCADE_CONFIG || {};
  const unitsPerCoin = Number(config.coins?.unitsPerCoin || 100);

  const datasets = Object.freeze([
    { id: "audit", label: "Audit global", mutable: true },
    { id: "profiles", label: "Profils", mutable: true },
    { id: "feedback", label: "Feedback / bugs", mutable: true },
    { id: "sessions", label: "Parties", mutable: false },
    { id: "transactions", label: "Transactions", mutable: false },
    { id: "statistics", label: "Statistiques", mutable: false },
    { id: "leaderboard", label: "Leaderboard local", mutable: false },
    { id: "games", label: "Jeux configurés", mutable: false },
    { id: "shop", label: "Boutique configurée", mutable: false },
  ]);

  function requireAdmin() {
    const profile = store?.getActiveProfile?.();
    if (!profile?.isAdmin || !store?.adminExportState) throw new Error("admin_required");
    store.adminExportState();
    return profile;
  }

  function profiles() {
    return store.listProfiles().map((profile) => ({
      id: profile.id,
      pseudo: profile.pseudo,
      coins: Number(profile.balanceUnits || 0) / unitsPerCoin,
      admin: Boolean(profile.isAdmin),
      parties: (profile.sessions || []).length,
      achats: (profile.inventory || []).length,
      createdAt: profile.createdAt || "",
      updatedAt: profile.updatedAt || "",
    }));
  }

  function audit() {
    return auditStore?.list?.() || [];
  }

  function sessions() {
    return store.listProfiles().flatMap((profile) => (profile.sessions || []).map((session) => ({
      id: session.id,
      profil: profile.pseudo,
      profileId: profile.id,
      jeu: session.title || session.gameKey,
      gameKey: session.gameKey,
      état: session.state,
      mode: session.economyMode,
      mise: Number(session.wagerUnits || 0) / unitsPerCoin,
      gain: Number(session.payoutUnits || 0) / unitsPerCoin,
      score: Number.isFinite(Number(session.metadata?.score)) ? Number(session.metadata.score) : "",
      createdAt: session.createdAt || "",
      resolvedAt: session.resolvedAt || "",
    })));
  }

  function transactions() {
    return store.listProfiles().flatMap((profile) => (profile.history || []).map((entry) => ({
      id: entry.id,
      profil: profile.pseudo,
      profileId: profile.id,
      type: entry.type,
      libellé: entry.label || "",
      jeu: entry.gameKey || "",
      montant: Number(entry.amountUnits || 0) / unitsPerCoin,
      soldeAprès: Number(entry.balanceAfterUnits || 0) / unitsPerCoin,
      createdAt: entry.createdAt || "",
    })));
  }

  function feedback() {
    return feedbackStore.list().map((report) => ({
      id: report.id,
      type: report.type,
      urgence: report.urgency,
      statut: report.status,
      jeu: report.gameTitle,
      gameKey: report.gameKey,
      pseudo: report.reporterPseudo || "",
      description: report.description,
      livraison: report.delivery?.status || "",
      createdAt: report.createdAt || "",
      updatedAt: report.updatedAt || "",
    }));
  }

  function statistics() {
    return (global.ArcadeStats?.getGameStats?.() || []).map((item) => ({
      id: item.key,
      jeu: item.title,
      parties: item.plays,
      victoires: item.wins,
      défaites: item.losses,
      abandons: item.abandons,
      réussite: item.successRate === null ? "" : Math.round(item.successRate * 1000) / 10,
      scoreMoyen: item.averageScore === null ? "" : Math.round(item.averageScore * 100) / 100,
      duréeMoyenneMs: item.averageDurationMs === null ? "" : Math.round(item.averageDurationMs),
    }));
  }

  function leaderboard() {
    return sessions()
      .filter((session) => session.score !== "")
      .sort((left, right) => right.score - left.score)
      .map((session, index) => ({ rang: index + 1, ...session }));
  }

  function games() {
    if (!global.document) return [];
    return [...global.document.querySelectorAll(".game-card[data-game]")].map((card) => {
      const action = card.querySelector(".btn-launch")?.getAttribute("onclick") || "";
      const path = action.match(/launchGame\(['\"]([^'\"]+)/)?.[1] || "Intégré à l’accueil";
      return {
        id: card.dataset.game,
        jeu: card.querySelector(".game-title")?.textContent?.trim() || card.dataset.game,
        catégories: [...card.querySelectorAll(".tag")].map((tag) => tag.textContent.trim()).join(", "),
        chemin: path,
        politique: config.localEconomy?.gamePolicies?.[card.dataset.game]?.economyMode || "paid",
      };
    });
  }

  function shop() {
    return (config.shop?.items || []).map((item) => ({
      id: item.id,
      objet: item.name,
      catégorie: item.category,
      emplacement: item.slot,
      prix: item.priceCoins,
      rareté: item.rarity,
      actif: item.active !== false,
    }));
  }

  function getRows(datasetId) {
    requireAdmin();
    const readers = { audit, profiles, feedback, sessions, transactions, statistics, leaderboard, games, shop };
    if (!readers[datasetId]) throw new Error("unknown_dataset");
    return readers[datasetId]();
  }

  function saveRecord(datasetId, input = {}) {
    requireAdmin();
    if (datasetId === "audit") return auditStore.save(input);
    if (datasetId === "profiles") return store.adminSaveProfile(input);
    if (datasetId === "feedback") {
      if (input.id) return feedbackStore.adminUpdate(input.id, input);
      return feedbackStore.create(input);
    }
    throw new Error("readonly_dataset");
  }

  function deleteRecord(datasetId, recordId) {
    requireAdmin();
    if (datasetId === "audit") return auditStore.remove(recordId);
    if (datasetId === "profiles") return store.adminDeleteProfile(recordId);
    if (datasetId === "feedback") return feedbackStore.adminRemove(recordId);
    throw new Error("readonly_dataset");
  }

  function exportSnapshot() {
    requireAdmin();
    return {
      schema: "francis-arcade-local-admin",
      version: 1,
      exportedAt: new Date().toISOString(),
      source: "local-test",
      data: {
        localStore: store.adminExportState(),
        feedback: feedbackStore.adminExportState(),
        audit: auditStore?.adminExportState?.() || null,
      },
    };
  }

  function importSnapshot(snapshot, mode = "merge") {
    requireAdmin();
    if (snapshot?.project && Array.isArray(snapshot.audit_items)) {
      if (!auditStore) throw new Error("audit_unavailable");
      auditStore.adminImportDocument(snapshot, mode);
      return exportSnapshot();
    }
    if (snapshot?.schema !== "francis-arcade-local-admin" || snapshot?.version !== 1
      || !snapshot.data?.localStore || !snapshot.data?.feedback) throw new Error("invalid_import");
    const previousStore = store.adminExportState();
    const previousFeedback = feedbackStore.adminExportState();
    const previousAudit = auditStore?.adminExportState?.() || null;
    try {
      store.adminImportState(snapshot, mode);
      feedbackStore.adminImportState(snapshot, mode);
      if (snapshot.data.audit && auditStore) auditStore.adminImportDocument(snapshot.data.audit, mode);
    } catch (error) {
      store.adminImportState(previousStore, "replace");
      feedbackStore.adminImportState(previousFeedback, "replace");
      if (previousAudit && auditStore) auditStore.adminImportDocument(previousAudit, "replace");
      throw error;
    }
    return exportSnapshot();
  }

  function importCsv(text, mode = "merge") {
    requireAdmin();
    if (!auditStore?.adminImportCsv) throw new Error("audit_unavailable");
    auditStore.adminImportCsv(text, mode);
    return exportSnapshot();
  }

  global.ArcadeAdminData = Object.freeze({
    datasets,
    requireAdmin,
    getRows,
    saveRecord,
    deleteRecord,
    exportSnapshot,
    importSnapshot,
    importCsv,
  });
})(window);
