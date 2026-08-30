(function arcadeShop(global) {
  "use strict";

  const config = global.ARCADE_CONFIG || {};
  const store = global.ArcadeLocalStore;
  const catalog = (config.shop?.items || []).filter((item) => item.active !== false);
  const itemsById = new Map(catalog.map((item) => [item.id, item]));
  const unitsPerCoin = Number(config.coins?.unitsPerCoin || 100);
  const categoryLabels = Object.freeze({
    all: "Tout",
    theme: "Thèmes",
    avatar: "Avatars",
    frame: "Cadres",
    effect: "Effets",
    sound: "Sons",
    badge: "Badges",
  });
  const rarityLabels = Object.freeze({ common: "Classique", uncommon: "Peu commun", rare: "Rare" });
  let activeCategory = "all";

  function element(id) {
    return document.getElementById(id);
  }

  function formatCoins(units) {
    const coins = Number(units || 0) / unitsPerCoin;
    return new Intl.NumberFormat("fr-BE", {
      minimumFractionDigits: Number.isInteger(coins) ? 0 : 2,
      maximumFractionDigits: config.coins?.decimals ?? 2,
    }).format(coins);
  }

  function priceUnits(item) {
    return Math.round(Number(item.priceCoins || 0) * unitsPerCoin);
  }

  function setStatus(message, state = "") {
    const status = element("shopStatus");
    if (!status) return;
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function readableError(error) {
    const messages = {
      profile_required: "Choisissez d’abord un pseudo pour utiliser la boutique.",
      insufficient_balance: "Votre solde est insuffisant pour cet objet.",
      shop_item_owned: "Cet objet est déjà dans votre collection.",
      shop_item_not_owned: "Achetez cet objet avant de l’équiper.",
      shop_item_not_found: "Cet objet n’est plus disponible.",
      shop_item_not_equippable: "Cet objet ne peut pas être équipé.",
    };
    return messages[error?.message] || "L’opération n’a pas pu être effectuée.";
  }

  function equippedItems(profile) {
    return Object.values(profile?.equipped || {})
      .map((itemId) => itemsById.get(itemId))
      .filter(Boolean);
  }

  function applyEquipped() {
    const profile = store?.getActiveProfile?.() || null;
    const root = document.documentElement;
    const equipment = profile?.equipped || {};
    const theme = itemsById.get(equipment.theme);
    const avatar = itemsById.get(equipment.avatar);
    const frame = itemsById.get(equipment.frame);
    const effect = itemsById.get(equipment.effect);
    const sound = itemsById.get(equipment.sound);
    const badge = itemsById.get(equipment.badge);

    if (theme) root.dataset.arcadeTheme = theme.appearance;
    else delete root.dataset.arcadeTheme;
    if (effect) root.dataset.arcadeEffect = effect.appearance;
    else delete root.dataset.arcadeEffect;
    if (sound) root.dataset.arcadeSound = sound.appearance;
    else delete root.dataset.arcadeSound;

    const accountAvatar = element("accountAvatar");
    if (accountAvatar) accountAvatar.textContent = avatar?.icon || "👤";
    const accountStrip = document.querySelector(".account-strip");
    if (accountStrip) {
      if (frame) accountStrip.dataset.arcadeFrame = frame.appearance;
      else delete accountStrip.dataset.arcadeFrame;
    }
    const accountBadge = element("accountBadge");
    if (accountBadge) {
      accountBadge.textContent = badge?.icon || "";
      accountBadge.title = badge?.name || "";
      accountBadge.hidden = !badge;
    }
  }

  function renderLoadout(profile) {
    const loadout = element("shopLoadout");
    if (!loadout) return;
    loadout.replaceChildren();
    const equipped = equippedItems(profile);
    if (!equipped.length) {
      const empty = document.createElement("span");
      empty.className = "shop-loadout-empty";
      empty.textContent = "Aucun cosmétique équipé";
      loadout.appendChild(empty);
      return;
    }
    equipped.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "shop-loadout-chip";
      chip.textContent = `${item.icon} ${item.name}`;
      loadout.appendChild(chip);
    });
  }

  function createShopCard(item, profile) {
    const owned = new Set((profile?.inventory || []).map((entry) => entry.itemId));
    const isOwned = owned.has(item.id);
    const isEquipped = profile?.equipped?.[item.slot] === item.id;
    const cost = priceUnits(item);
    const canAfford = Number(profile?.balanceUnits || 0) >= cost;
    const card = document.createElement("article");
    card.className = `shop-card rarity-${item.rarity || "common"}`;
    card.dataset.itemId = item.id;

    const visual = document.createElement("div");
    visual.className = "shop-card-visual";
    visual.textContent = item.icon || "◆";
    const rarity = document.createElement("span");
    rarity.className = "shop-rarity";
    rarity.textContent = rarityLabels[item.rarity] || item.rarity || "Classique";
    const title = document.createElement("h3");
    title.textContent = item.name;
    const description = document.createElement("p");
    description.textContent = item.description;
    const footer = document.createElement("div");
    footer.className = "shop-card-footer";
    const price = document.createElement("strong");
    price.className = "shop-price";
    price.textContent = `${formatCoins(cost)} 🪙`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shop-item-action";

    if (!profile) {
      button.textContent = "Profil requis";
      button.disabled = true;
    } else if (isEquipped) {
      button.textContent = "Équipé ✓";
      button.disabled = true;
      card.classList.add("is-equipped");
    } else if (isOwned) {
      button.textContent = "Équiper";
      card.classList.add("is-owned");
    } else if (!canAfford) {
      button.textContent = "Solde insuffisant";
      button.disabled = true;
    } else {
      button.textContent = "Acheter";
    }

    button.addEventListener("click", () => {
      button.disabled = true;
      try {
        if (isOwned) {
          store.equipShopItem(item.id);
          setStatus(`${item.name} est maintenant équipé.`, "success");
        } else {
          store.purchaseShopItem(item.id);
          setStatus(`${item.name} rejoint votre collection et a été équipé.`, "success");
        }
        global.ArcadePlatform?.refreshAccount?.();
        applyEquipped();
        render();
      } catch (error) {
        setStatus(readableError(error), "error");
        render();
      }
    });

    footer.append(price, button);
    card.append(visual, rarity, title, description, footer);
    return card;
  }

  function render() {
    const grid = element("shopGrid");
    if (!grid) return;
    const profile = store?.getActiveProfile?.() || null;
    element("shopCoinBalance").textContent = profile ? formatCoins(profile.balanceUnits) : "—";
    renderLoadout(profile);
    grid.replaceChildren();
    catalog
      .filter((item) => activeCategory === "all" || item.category === activeCategory)
      .forEach((item) => grid.appendChild(createShopCard(item, profile)));
  }

  function selectCategory(category) {
    activeCategory = categoryLabels[category] ? category : "all";
    document.querySelectorAll("[data-shop-category]").forEach((button) => {
      const selected = button.dataset.shopCategory === activeCategory;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    render();
  }

  function init() {
    applyEquipped();
    render();
    element("openShopButton")?.addEventListener("click", () => {
      setStatus("");
      render();
    });
    document.querySelectorAll("[data-shop-category]").forEach((button) => {
      button.addEventListener("click", () => selectCategory(button.dataset.shopCategory || "all"));
    });
    global.addEventListener("arcade-local-store-change", () => {
      applyEquipped();
      if (element("shopDialog")?.open) render();
    });
  }

  global.ArcadeShop = Object.freeze({
    getCatalog: () => catalog.map((item) => ({ ...item })),
    applyEquipped,
    render,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
