(function arcadeLocalStore(global) {
  "use strict";

  const STORAGE_KEY = "arcade.fictionalCoins.v2";
  const LEGACY_STORAGE_KEY = "arcade.fictionalCoins.v1";
  const TERMINAL_STATES = new Set(["won", "lost", "abandoned"]);
  const config = global.ARCADE_CONFIG || {};
  const economy = config.localEconomy || {};
  const unitsPerCoin = Number(config.coins?.unitsPerCoin || 100);
  const maxHistory = Number(economy.maxHistoryEntries || 60);
  const maxSessions = Number(economy.maxSessionEntries || 40);
  const shopItems = new Map((config.shop?.items || []).map((item) => [item.id, item]));
  const dailyChallengeKeys = new Set(economy.dailyChallengeKeys || []);
  let memoryFallback = null;

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function randomId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function coinsToUnits(coins) {
    return Math.round(Number(coins || 0) * unitsPerCoin);
  }

  function emptyState() {
    return { version: 2, activeProfileId: null, profiles: {} };
  }

  function normalizeProfileShop(profile) {
    if (!profile) return profile;
    const entries = Array.isArray(profile.inventory) ? profile.inventory : [];
    const seen = new Set();
    profile.inventory = entries
      .map((entry) => typeof entry === "string"
        ? { itemId: entry, purchasedAt: profile.createdAt || new Date().toISOString() }
        : entry)
      .filter((entry) => entry?.itemId && !seen.has(entry.itemId) && seen.add(entry.itemId));
    profile.equipped = profile.equipped && typeof profile.equipped === "object"
      ? profile.equipped
      : {};
    profile.dailyChallengeBonusClaims = profile.dailyChallengeBonusClaims && typeof profile.dailyChallengeBonusClaims === "object"
      ? profile.dailyChallengeBonusClaims
      : {};
    return profile;
  }

  function migrateLegacy(legacy) {
    const migrated = emptyState();
    migrated.activeProfileId = legacy?.activeProfileId || null;
    Object.entries(legacy?.profiles || {}).forEach(([profileId, oldProfile]) => {
      const profile = {
        ...oldProfile,
        sessions: [],
        activeSessionId: null,
        inventory: [],
        equipped: {},
      };
      if (oldProfile.pendingGame) {
        const oldGame = oldProfile.pendingGame;
        const session = {
          id: oldGame.id || randomId(),
          gameKey: oldGame.gameKey,
          title: oldGame.title,
          url: oldGame.url,
          state: "started",
          economyMode: "paid",
          wagerUnits: Number(oldGame.costUnits || coinsToUnits(economy.playCostCoins ?? 1)),
          payoutUnits: coinsToUnits(economy.winPayoutCoins ?? 1.25),
          createdAt: oldGame.startedAt || new Date().toISOString(),
          startedAt: oldGame.startedAt || new Date().toISOString(),
          resolvedAt: null,
          metadata: { migratedFromV1: true },
        };
        profile.sessions.push(session);
        profile.activeSessionId = session.id;
      }
      delete profile.pendingGame;
      migrated.profiles[profileId] = normalizeProfileShop(profile);
    });
    return migrated;
  }

  function parseStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }

  function readState() {
    try {
      const current = parseStored(STORAGE_KEY);
      if (current?.version === 2 && typeof current.profiles === "object") {
        Object.values(current.profiles).forEach(normalizeProfileShop);
        return current;
      }
      const legacy = parseStored(LEGACY_STORAGE_KEY);
      if (legacy?.version === 1 && typeof legacy.profiles === "object") {
        const migrated = migrateLegacy(legacy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return emptyState();
    } catch (_) {
      return memoryFallback || emptyState();
    }
  }

  function writeState(state) {
    memoryFallback = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Le profil reste utilisable pour la session si le stockage est indisponible.
    }
    global.dispatchEvent?.(new CustomEvent("arcade-local-store-change"));
  }

  function normalizePseudo(pseudo) {
    return String(pseudo || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  }

  function profileIdFor(pseudo) {
    return normalizePseudo(pseudo).toLocaleLowerCase("fr-BE");
  }

  function validatePseudo(pseudo) {
    const normalized = normalizePseudo(pseudo);
    return normalized.length >= 2 && normalized.length <= 20 && /^[\p{L}\p{N}_ -]+$/u.test(normalized);
  }

  function isAdminPseudo(pseudo) {
    const expected = (economy.adminPseudos || []).map((item) =>
      normalizePseudo(item).toLocaleUpperCase("fr-BE"),
    );
    return expected.includes(normalizePseudo(pseudo).toLocaleUpperCase("fr-BE"));
  }

  function transaction(type, amountUnits, balanceAfterUnits, details = {}) {
    return {
      id: randomId(),
      type,
      amountUnits,
      balanceAfterUnits,
      label: details.label || "",
      gameKey: details.gameKey || null,
      referenceId: details.referenceId || null,
      createdAt: new Date().toISOString(),
    };
  }

  function appendTransaction(profile, entry) {
    profile.history = [entry, ...(profile.history || [])].slice(0, maxHistory);
    profile.updatedAt = new Date().toISOString();
  }

  function findSession(profile, sessionId) {
    return (profile.sessions || []).find((session) => session.id === sessionId) || null;
  }

  function gamePolicy(gameKey) {
    return economy.gamePolicies?.[gameKey] || {};
  }

  function login(pseudo) {
    const cleanPseudo = normalizePseudo(pseudo);
    if (!validatePseudo(cleanPseudo)) throw new Error("invalid_pseudo");
    const state = readState();
    const profileId = profileIdFor(cleanPseudo);
    let profile = state.profiles[profileId];

    if (!profile) {
      const starterUnits = coinsToUnits(economy.starterCoins ?? 5);
      profile = {
        id: profileId,
        pseudo: cleanPseudo,
        balanceUnits: starterUnits,
        isAdmin: isAdminPseudo(cleanPseudo),
        sessions: [],
        activeSessionId: null,
        history: [],
        inventory: [],
        equipped: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      appendTransaction(
        profile,
        transaction("starter_grant", starterUnits, starterUnits, {
          label: "Coins de départ",
          referenceId: `starter:${profileId}`,
        }),
      );
      state.profiles[profileId] = profile;
    } else {
      profile.isAdmin = isAdminPseudo(profile.pseudo);
      profile.sessions ||= [];
      profile.activeSessionId ||= null;
      normalizeProfileShop(profile);
    }

    state.activeProfileId = profileId;
    writeState(state);
    return clone(profile);
  }

  function logout() {
    const state = readState();
    state.activeProfileId = null;
    writeState(state);
  }

  function getProfile(profileId) {
    const profile = readState().profiles[profileId];
    return profile ? clone(profile) : null;
  }

  function getActiveProfile() {
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    return profile ? clone(profile) : null;
  }

  function listProfiles() {
    return Object.values(readState().profiles)
      .map((profile) => clone(profile))
      .sort((left, right) => left.pseudo.localeCompare(right.pseudo, "fr"));
  }

  function createSession({ gameKey, title, url, metadata = {} }) {
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    if (!profile) throw new Error("profile_required");
    profile.sessions ||= [];
    const policy = gamePolicy(gameKey);
    const dailyKey = policy.dailyLimit ? String(metadata.dailyKey || "") : "";
    const alreadyCompletedToday = dailyKey && profile.sessions.some((session) => (
      session.gameKey === gameKey
      && session.metadata?.dailyKey === dailyKey
      && ["won", "lost"].includes(session.state)
    ));
    if (alreadyCompletedToday) throw new Error("daily_challenge_completed");

    const active = profile.activeSessionId ? findSession(profile, profile.activeSessionId) : null;
    if (active && !TERMINAL_STATES.has(active.state)) throw new Error("active_session_exists");

    const economyMode = ["practice", "free"].includes(policy.economyMode)
      ? policy.economyMode
      : "paid";
    const wagerUnits = economyMode === "paid"
      ? coinsToUnits(policy.playCostCoins ?? economy.playCostCoins ?? 1)
      : 0;
    if (profile.balanceUnits < wagerUnits) throw new Error("insufficient_balance");

    const session = {
      id: randomId(),
      gameKey,
      title,
      url,
      state: "created",
      economyMode,
      wagerUnits,
      payoutUnits: economyMode === "practice"
        ? 0
        : coinsToUnits(policy.winPayoutCoins ?? (policy.dailyLimit ? economy.dailyChallengePayoutCoins : economy.winPayoutCoins) ?? 1.25),
      createdAt: new Date().toISOString(),
      startedAt: null,
      resolvedAt: null,
      metadata: { ...metadata },
    };
    profile.sessions = [session, ...profile.sessions].slice(0, maxSessions);
    profile.activeSessionId = session.id;
    writeState(state);
    return clone(session);
  }

  function getSession(sessionId) {
    const profile = getActiveProfile();
    if (!profile) return null;
    const session = findSession(profile, sessionId);
    return session ? clone(session) : null;
  }

  function getActiveSession() {
    const profile = getActiveProfile();
    if (!profile?.activeSessionId) return null;
    const session = findSession(profile, profile.activeSessionId);
    return session ? clone(session) : null;
  }

  function startSession(sessionId, metadata = {}) {
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    if (!profile) throw new Error("profile_required");
    const session = findSession(profile, sessionId);
    if (!session) throw new Error("session_not_found");
    if (session.state === "started") return clone(session);
    if (TERMINAL_STATES.has(session.state)) throw new Error("session_closed");
    if (session.state !== "created") throw new Error("invalid_session_state");
    const policy = gamePolicy(session.gameKey);
    if (Array.isArray(policy.practiceModes) && policy.practiceModes.includes(metadata.mode)) {
      session.economyMode = "practice";
      session.wagerUnits = 0;
      session.payoutUnits = 0;
    }
    if (profile.balanceUnits < session.wagerUnits) throw new Error("insufficient_balance");

    profile.balanceUnits -= session.wagerUnits;
    session.state = "started";
    session.startedAt = new Date().toISOString();
    session.metadata = { ...session.metadata, ...metadata };
    if (session.wagerUnits > 0) {
      appendTransaction(
        profile,
        transaction("game_entry", -session.wagerUnits, profile.balanceUnits, {
          label: session.title,
          gameKey: session.gameKey,
          referenceId: session.id,
        }),
      );
    }
    writeState(state);
    return clone(session);
  }

  function finishSession(sessionId, outcome, metadata = {}) {
    if (!TERMINAL_STATES.has(outcome)) throw new Error("invalid_outcome");
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    if (!profile) throw new Error("profile_required");
    const session = findSession(profile, sessionId);
    if (!session) throw new Error("session_not_found");
    if (TERMINAL_STATES.has(session.state)) return clone(session);

    if (session.state === "created" && outcome === "won") throw new Error("session_not_started");
    const wasStarted = session.state === "started";
    session.state = outcome;
    session.resolvedAt = new Date().toISOString();
    session.metadata = { ...session.metadata, ...metadata, wasStarted };

    if (wasStarted && outcome === "won" && session.payoutUnits > 0) {
      profile.balanceUnits += session.payoutUnits;
      appendTransaction(
        profile,
        transaction("game_win", session.payoutUnits, profile.balanceUnits, {
          label: session.title,
          gameKey: session.gameKey,
          referenceId: session.id,
        }),
      );
    } else {
      const type = outcome === "abandoned"
        ? wasStarted ? "game_abandoned" : "game_cancelled"
        : "game_loss";
      appendTransaction(
        profile,
        transaction(type, 0, profile.balanceUnits, {
          label: session.title,
          gameKey: session.gameKey,
          referenceId: session.id,
        }),
      );
    }

    if (profile.activeSessionId === session.id) profile.activeSessionId = null;
    writeState(state);
    return clone(session);
  }

  function claimDailyChallengeBonus(dailyKey) {
    const key = String(dailyKey || "");
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    if (!profile) throw new Error("profile_required");
    normalizeProfileShop(profile);
    if (!key || profile.dailyChallengeBonusClaims[key]) return { awarded: false, payoutUnits: 0 };
    const allChallengesWon = dailyChallengeKeys.size > 0 && [...dailyChallengeKeys].every((gameKey) => (
      (profile.sessions || []).some((session) => (
        session.gameKey === gameKey
        && session.metadata?.dailyKey === key
        && session.state === "won"
      ))
    ));
    if (!allChallengesWon) return { awarded: false, payoutUnits: 0 };
    const payoutUnits = coinsToUnits(economy.dailyCompletionBonusCoins ?? 5);
    profile.balanceUnits += payoutUnits;
    profile.dailyChallengeBonusClaims[key] = new Date().toISOString();
    appendTransaction(
      profile,
      transaction("daily_challenge_bonus", payoutUnits, profile.balanceUnits, {
        label: "Défi quotidien complété",
        gameKey: "daily-challenge-bonus",
        referenceId: "daily-bonus:" + key,
      }),
    );
    writeState(state);
    return { awarded: true, payoutUnits };
  }

  function recoverActiveSession(reason = "returned_to_grid") {
    const session = getActiveSession();
    if (!session || TERMINAL_STATES.has(session.state)) return null;
    return finishSession(session.id, "abandoned", { reason });
  }

  function purchaseShopItem(itemId) {
    const state = readState();
    const profile = normalizeProfileShop(state.profiles[state.activeProfileId]);
    if (!profile) throw new Error("profile_required");
    const item = shopItems.get(String(itemId || ""));
    if (!item || item.active === false) throw new Error("shop_item_not_found");
    if (profile.inventory.some((entry) => entry.itemId === item.id)) throw new Error("shop_item_owned");

    const priceUnits = coinsToUnits(item.priceCoins);
    if (!Number.isFinite(priceUnits) || priceUnits < 0) throw new Error("invalid_shop_price");
    if (profile.balanceUnits < priceUnits) throw new Error("insufficient_balance");

    profile.balanceUnits -= priceUnits;
    profile.inventory.push({ itemId: item.id, purchasedAt: new Date().toISOString() });
    if (item.slot) profile.equipped[item.slot] = item.id;
    appendTransaction(
      profile,
      transaction("shop_purchase", -priceUnits, profile.balanceUnits, {
        label: item.name,
        referenceId: item.id,
      }),
    );
    writeState(state);
    return clone(profile);
  }

  function equipShopItem(itemId) {
    const state = readState();
    const profile = normalizeProfileShop(state.profiles[state.activeProfileId]);
    if (!profile) throw new Error("profile_required");
    const item = shopItems.get(String(itemId || ""));
    if (!item || item.active === false) throw new Error("shop_item_not_found");
    if (!profile.inventory.some((entry) => entry.itemId === item.id)) throw new Error("shop_item_not_owned");
    if (!item.slot) throw new Error("shop_item_not_equippable");

    profile.equipped[item.slot] = item.id;
    profile.updatedAt = new Date().toISOString();
    writeState(state);
    return clone(profile);
  }

  function adminAdjust(targetProfileId, coins, direction) {
    const state = readState();
    const admin = state.profiles[state.activeProfileId];
    const target = state.profiles[targetProfileId];
    if (!admin?.isAdmin) throw new Error("admin_required");
    if (!target) throw new Error("profile_not_found");
    const requestedUnits = coinsToUnits(Math.abs(Number(coins)));
    if (!Number.isFinite(requestedUnits) || requestedUnits <= 0) throw new Error("invalid_adjustment");
    const signedUnits = direction === "remove" ? -requestedUnits : requestedUnits;
    if (target.balanceUnits + signedUnits < 0) throw new Error("negative_balance");

    target.balanceUnits += signedUnits;
    appendTransaction(
      target,
      transaction("admin_adjustment", signedUnits, target.balanceUnits, {
        label: `Ajustement par ${admin.pseudo}`,
        referenceId: randomId(),
      }),
    );
    writeState(state);
    return clone(target);
  }

  function requireLocalAdmin(state = readState()) {
    const admin = state.profiles[state.activeProfileId];
    if (!admin?.isAdmin || !isAdminPseudo(admin.pseudo)) throw new Error("admin_required");
    return admin;
  }

  function normalizeAdminVisualPreferences(value = {}) {
    const visual = global.ARCADE_ADMIN_CONFIG || {};
    const defaults = visual.defaults || { themeId: "executive", fontId: "professional", effectsId: "balanced" };
    const themeIds = new Set((visual.themes || []).map((item) => item.id));
    const fontIds = new Set((visual.fonts || []).map((item) => item.id));
    const effectsIds = new Set((visual.effects || []).map((item) => item.id));
    return {
      themeId: themeIds.has(value.themeId) ? value.themeId : defaults.themeId,
      fontId: fontIds.has(value.fontId) ? value.fontId : defaults.fontId,
      effectsId: effectsIds.has(value.effectsId) ? value.effectsId : defaults.effectsId,
    };
  }

  function adminGetVisualPreferences() {
    const state = readState();
    const admin = requireLocalAdmin(state);
    return normalizeAdminVisualPreferences(admin.adminVisualPreferences);
  }

  function adminSaveVisualPreferences(preferences = {}) {
    const state = readState();
    const admin = requireLocalAdmin(state);
    admin.adminVisualPreferences = normalizeAdminVisualPreferences(preferences);
    admin.updatedAt = new Date().toISOString();
    writeState(state);
    return clone(admin.adminVisualPreferences);
  }

  function adminSaveProfile(input = {}) {
    const state = readState();
    const admin = requireLocalAdmin(state);
    const previousId = String(input.id || "");
    const pseudo = normalizePseudo(input.pseudo);
    if (!validatePseudo(pseudo)) throw new Error("invalid_pseudo");

    const profileId = profileIdFor(pseudo);
    const existing = previousId ? state.profiles[previousId] : null;
    if (previousId && !existing) throw new Error("profile_not_found");
    if (state.profiles[profileId] && profileId !== previousId) throw new Error("profile_exists");
    if (previousId === state.activeProfileId && profileId !== previousId) throw new Error("admin_self_protected");

    const requestedCoins = Number(input.balanceCoins);
    if (!Number.isFinite(requestedCoins) || requestedCoins < 0) throw new Error("negative_balance");
    const nextBalance = coinsToUnits(requestedCoins);
    const now = new Date().toISOString();
    const profile = existing || {
      id: profileId,
      pseudo,
      balanceUnits: 0,
      isAdmin: false,
      sessions: [],
      activeSessionId: null,
      history: [],
      inventory: [],
      equipped: {},
      dailyChallengeBonusClaims: {},
      createdAt: now,
      updatedAt: now,
    };
    const difference = nextBalance - Number(profile.balanceUnits || 0);

    profile.id = profileId;
    profile.pseudo = pseudo;
    profile.isAdmin = isAdminPseudo(pseudo);
    profile.balanceUnits = nextBalance;
    profile.sessions = Array.isArray(profile.sessions) ? profile.sessions : [];
    profile.history = Array.isArray(profile.history) ? profile.history : [];
    normalizeProfileShop(profile);
    profile.updatedAt = now;

    if (difference !== 0 || !existing) {
      appendTransaction(
        profile,
        transaction("admin_adjustment", difference, nextBalance, {
          label: existing ? `Modification par ${admin.pseudo}` : `Création par ${admin.pseudo}`,
          referenceId: randomId(),
        }),
      );
    }

    if (previousId && previousId !== profileId) delete state.profiles[previousId];
    state.profiles[profileId] = profile;
    writeState(state);
    return clone(profile);
  }

  function normalizeGamePreferences(value = {}) {
    const settings = global.ARCADE_GAME_CONFIG?.preferences || {};
    const defaults = settings.defaults || {
      sound: true,
      music: true,
      vibration: true,
      animations: true,
      visualIntensity: "balanced",
    };
    const intensities = new Set((settings.visualIntensities || []).map((item) => item.id));
    return {
      sound: typeof value.sound === "boolean" ? value.sound : defaults.sound,
      music: typeof value.music === "boolean" ? value.music : defaults.music,
      vibration: typeof value.vibration === "boolean" ? value.vibration : defaults.vibration,
      animations: typeof value.animations === "boolean" ? value.animations : defaults.animations,
      visualIntensity: intensities.has(value.visualIntensity) ? value.visualIntensity : defaults.visualIntensity,
    };
  }

  function getGamePreferences() {
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    if (!profile) throw new Error("profile_required");
    return normalizeGamePreferences(profile.gamePreferences);
  }

  function saveGamePreferences(preferences = {}) {
    const state = readState();
    const profile = state.profiles[state.activeProfileId];
    if (!profile) throw new Error("profile_required");
    profile.gamePreferences = normalizeGamePreferences({
      ...profile.gamePreferences,
      ...preferences,
    });
    profile.updatedAt = new Date().toISOString();
    writeState(state);
    return clone(profile.gamePreferences);
  }

  function adminDeleteProfile(profileId) {
    const state = readState();
    requireLocalAdmin(state);
    const id = String(profileId || "");
    if (!state.profiles[id]) throw new Error("profile_not_found");
    if (id === state.activeProfileId || state.profiles[id].isAdmin) throw new Error("admin_self_protected");
    const deleted = clone(state.profiles[id]);
    delete state.profiles[id];
    writeState(state);
    return deleted;
  }

  function normalizeImportedState(payload) {
    const source = payload?.data?.localStore || payload?.localStore || payload;
    if (source?.version !== 2 || !source.profiles || typeof source.profiles !== "object") {
      throw new Error("invalid_import");
    }
    const normalized = emptyState();
    Object.values(source.profiles).forEach((candidate) => {
      const pseudo = normalizePseudo(candidate?.pseudo);
      if (!validatePseudo(pseudo)) throw new Error("invalid_import");
      const id = profileIdFor(pseudo);
      if (normalized.profiles[id]) throw new Error("invalid_import");
      const balanceUnits = Math.round(Number(candidate.balanceUnits));
      if (!Number.isFinite(balanceUnits) || balanceUnits < 0) throw new Error("invalid_import");
      const profile = {
        ...clone(candidate),
        id,
        pseudo,
        balanceUnits,
        isAdmin: isAdminPseudo(pseudo),
        sessions: Array.isArray(candidate.sessions) ? clone(candidate.sessions).slice(0, maxSessions) : [],
        history: Array.isArray(candidate.history) ? clone(candidate.history).slice(0, maxHistory) : [],
        activeSessionId: null,
        createdAt: candidate.createdAt || new Date().toISOString(),
        updatedAt: candidate.updatedAt || new Date().toISOString(),
      };
      normalized.profiles[id] = normalizeProfileShop(profile);
    });
    return normalized;
  }

  function adminExportState() {
    const state = readState();
    requireLocalAdmin(state);
    return clone(state);
  }

  function adminImportState(payload, mode = "merge") {
    const current = readState();
    const admin = requireLocalAdmin(current);
    const imported = normalizeImportedState(payload);
    const next = mode === "replace"
      ? imported
      : {
        version: 2,
        activeProfileId: current.activeProfileId,
        profiles: { ...current.profiles, ...imported.profiles },
      };
    if (!next.profiles[admin.id]?.isAdmin) throw new Error("admin_profile_required");
    next.activeProfileId = admin.id;
    writeState(next);
    return clone(next);
  }

  global.ArcadeLocalStore = Object.freeze({
    storageKey: STORAGE_KEY,
    unitsPerCoin,
    login,
    logout,
    getProfile,
    getActiveProfile,
    listProfiles,
    createSession,
    getSession,
    getActiveSession,
    startSession,
    finishSession,
    claimDailyChallengeBonus,
    recoverActiveSession,
    purchaseShopItem,
    equipShopItem,
    getGamePreferences,
    saveGamePreferences,
    adminAdjust,
    adminGetVisualPreferences,
    adminSaveVisualPreferences,
    adminSaveProfile,
    adminDeleteProfile,
    adminExportState,
    adminImportState,
  });
})(window);
