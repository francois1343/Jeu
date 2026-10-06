"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
assert(chromePath, "Chrome ou Edge est requis pour la recette navigateur Premium");

const baseUrl = process.env.ARCADE_BASE_URL || "http://127.0.0.1:4173";
const debugPort = 9381;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "francis-arcade-premium-"));
const browser = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--mute-audio",
  `${baseUrl}/index.html`,
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".html") ? [fullPath] : [];
  });
}

const configSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js", "core", "arcade-game-config.js"), "utf8"), configSandbox);
const shellConfig = configSandbox.window.ARCADE_GAME_CONFIG.shell;
const catalogPages = htmlFiles(path.join(root, "games")).map((file) => {
  const folder = path.basename(path.dirname(file)).toLocaleLowerCase("fr");
  const route = path.relative(root, file).split(path.sep).map(encodeURIComponent).join("/");
  return { file, key: shellConfig.routeAliases[folder], route };
});

async function retry(operation, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { return await operation(); }
    catch (error) { lastError = error; await delay(80); }
  }
  throw lastError || new Error("Délai dépassé");
}

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.events = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      (this.events.get(message.method) || []).forEach((listener) => listener(message.params));
    });
  }

  on(method, listener) {
    const listeners = this.events.get(method) || [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() { this.socket.close(); }
}

async function main() {
  const target = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    const targets = await response.json();
    const page = targets.find((candidate) => candidate.type === "page");
    if (!page) throw new Error("Aucun onglet Chrome détecté");
    return page;
  });

  const cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "try { if (sessionStorage.getItem('arcade.qa.serverMode') !== '1') localStorage.setItem('arcade.qa.localMode', '1'); } catch (_) {}",
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  const runtimeErrors = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text);
  });

  async function waitFor(expression, message, timeout = 8000) {
    return retry(async () => {
      const value = await cdp.evaluate(expression);
      if (!value) throw new Error(message);
      return value;
    }, timeout);
  }

  async function navigate(url) {
    await cdp.send("Page.navigate", { url });
    await waitFor("document.readyState === 'complete'", `Chargement incomplet : ${url}`);
  }

  await navigate(`${baseUrl}/index.html`);
  await cdp.evaluate("window.ArcadeLocalStore.login('QA Calcul Toolbar'); true");
  const calculationSession = await cdp.evaluate(`window.ArcadeLocalStore.createSession(${JSON.stringify({
    gameKey: "calculation",
    title: "Calcul Mental",
    url: "/games/calculation/index.html",
  })})`);
  await navigate(`${baseUrl}/games/calculation/index.html?arcadeSession=${encodeURIComponent(calculationSession.id)}`);
  await waitFor("Boolean(window.ArcadeGameSession && document.querySelector('#arcadeSessionHud #arcadeGameShellButton'))", "Calcul Mental ne regroupe pas ses commandes communes");
  if (await cdp.evaluate("Boolean(document.querySelector('#arcadeGameShellDialog')?.open)")) {
    await cdp.evaluate("document.querySelector('#arcadeShellTutorialSkip').click(); true");
  }
  for (const viewport of [[320, 568], [1366, 768]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport[0], height: viewport[1], deviceScaleFactor: 1, mobile: viewport[0] < 800,
    });
    await cdp.evaluate("window.dispatchEvent(new Event('resize')); true");
    await delay(80);
    const calculationChrome = await cdp.evaluate(`(() => {
      const home = document.querySelector('#arcadeHomeButton');
      const hud = document.querySelector('#arcadeSessionHud');
      const menu = document.querySelector('#arcadeGameShellButton');
      const homeRect = home.getBoundingClientRect(), hudRect = hud.getBoundingClientRect();
      return {
        hudTop: Math.round(hudRect.top),
        menuTop: Math.round(menu.getBoundingClientRect().top),
        menuParent: menu.parentElement?.id,
        statusColor: getComputedStyle(hud.querySelector('strong')).color,
        overlap: Math.min(homeRect.right,hudRect.right) > Math.max(homeRect.left,hudRect.left)
          && Math.min(homeRect.bottom,hudRect.bottom) > Math.max(homeRect.top,hudRect.top),
        reusedHome: home.classList.contains('arcade-home-link') && !home.classList.contains('legacy-home-link'),
        counts: [document.querySelectorAll('#arcadeHomeButton').length, document.querySelectorAll('#arcadeSessionHud').length, document.querySelectorAll('#arcadeGameShellButton').length],
      };
    })()`);
    assert(calculationChrome.hudTop < 80 && calculationChrome.menuTop < 80, `Calcul Mental conserve une commande en bas à ${viewport[0]}×${viewport[1]}`);
    assert.equal(calculationChrome.menuParent, "arcadeSessionHud", "Calcul Mental doit réunir Menu et Coins dans le même bloc");
    assert.equal(calculationChrome.overlap, false, `La barre de Calcul Mental se superpose à ${viewport[0]}×${viewport[1]}`);
    assert.equal(calculationChrome.reusedHome, true, "Calcul Mental doit réutiliser son retour Accueil historique");
    assert.deepEqual(calculationChrome.counts, [1, 1, 1], "Calcul Mental duplique une commande commune");
    assert.match(calculationChrome.statusColor, /0,\s*212,\s*255/, "Le statut Calcul Mental doit reprendre son cyan");
  }

  await navigate(`${baseUrl}/index.html`);
  await waitFor("Boolean(window.ArcadeLocalStore)", "Le store Arcade n'est pas chargé");
  await waitFor("document.fonts.status === 'loaded'", "Les polices locales ne sont pas chargees");
  const homeTypography = await cdp.evaluate(`(() => {
    const card = document.querySelector('.game-card');
    const featured = document.querySelector('.featured-game');
    const bodyFont = getComputedStyle(document.body).fontFamily;
    return {
      bodyFont,
      cardAlign: getComputedStyle(card).textAlign,
      featuredAlign: getComputedStyle(featured).textAlign,
      orbitronLoaded: [...document.fonts].some((face) => /Orbitron/i.test(face.family) && face.status === 'loaded'),
      rajdhaniLoaded: [...document.fonts].some((face) => /Rajdhani/i.test(face.family) && face.status === 'loaded')
    };
  })()`);
  assert.match(homeTypography.bodyFont, /Rajdhani/i, "La police de lecture locale n'est pas appliquee");
  assert.equal(homeTypography.cardAlign, "center", "Les cartes du catalogue ne sont pas centrees");
  assert.equal(homeTypography.featuredAlign, "center", "Les cartes vedettes ne sont pas centrees");
  assert(homeTypography.orbitronLoaded, "Orbitron locale n'est pas chargee");
  assert(homeTypography.rajdhaniLoaded, "Rajdhani locale n'est pas chargee");

  const freeBadgeLayout = await cdp.evaluate(`(() => {
    const card = document.querySelector('[data-game="pile-face"]');
    const badge = card.querySelector('.free-badge');
    const icon = card.querySelector('.game-icon');
    const cardRect = card.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    return {
      rightGap: Math.round(cardRect.right - badgeRect.right),
      centerDelta: Math.round(Math.abs((badgeRect.top + badgeRect.height / 2) - (iconRect.top + iconRect.height / 2))),
      background: getComputedStyle(badge).backgroundColor,
      color: getComputedStyle(badge).color,
    };
  })()`);
  assert(freeBadgeLayout.rightGap <= 8, `Le badge FREE est trop loin du bord droit : ${freeBadgeLayout.rightGap}px`);
  assert(freeBadgeLayout.centerDelta <= 2, `Le badge FREE n'est pas aligne avec le logo : ${freeBadgeLayout.centerDelta}px`);
  assert.equal(freeBadgeLayout.background, "rgb(0, 214, 111)", "Le badge FREE n'est pas vert");

  await cdp.evaluate("document.querySelector('button[onclick*=\"openCoinGame\"]').click(); true");
  await waitFor("document.querySelector('#coinGameDialog')?.open", "Pile ou Face ne s'ouvre pas");
  const coinLayout = await cdp.evaluate(`(() => {
    const dialog = document.querySelector('#coinGameDialog');
    const shell = dialog.querySelector('.dialog-shell');
    const dialogRect = dialog.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return {
      centerDelta: Math.abs((dialogRect.left + dialogRect.width / 2) - (shellRect.left + shellRect.width / 2)),
      textAlign: getComputedStyle(shell).textAlign,
      overflow: shellRect.right - dialogRect.right
    };
  })()`);
  assert(coinLayout.centerDelta <= 2, `Le panneau Pile ou Face reste decale : ${coinLayout.centerDelta}px`);
  assert.equal(coinLayout.textAlign, "center", "Le contenu Pile ou Face n'est pas centre");
  assert(coinLayout.overflow <= 1, "Le contenu Pile ou Face deborde de son dialogue");
  await cdp.evaluate("document.querySelector('#coinGameDialog').close(); true");

  await cdp.evaluate("document.querySelector('.featured-game[data-game=\"421-duel\"] button').click(); true");
  await waitFor("document.querySelector('#accountDialog')?.open", "Le choix d'un jeu sans profil n'ouvre pas la connexion locale");
  await cdp.evaluate(`(() => {
    const form = document.querySelector('#authForm');
    form.elements.pseudo.value = '@@';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor("document.querySelector('#accountDialog')?.open && !document.querySelector('#profileStatus')?.hidden", "Une erreur de pseudo doit rester visible dans le dialogue");
  assert.equal(await cdp.evaluate("window.ArcadeLocalStore.getActiveProfile()"), null, "Un pseudo invalide ne doit pas créer de profil");
  await cdp.evaluate(`(() => {
    const form = document.querySelector('#authForm');
    form.elements.pseudo.value = 'QA Premium';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor("location.pathname.endsWith('/games/421/index.html') && window.ArcadeGameSession?.state === 'created'", "La création du pseudo ne reprend pas le lancement demandé", 10000);
  assert.equal(await cdp.evaluate("window.ArcadeLocalStore.getActiveProfile()?.pseudo"), "QA Premium", "Le profil saisi doit devenir actif");

  await navigate(`${baseUrl}/index.html`);
  await cdp.evaluate(`(() => {
    const stale = window.ArcadeLocalStore.createSession({
      gameKey: 'crossyturfu',
      title: 'Crossy Turfu',
      url: 'games/crossy-turfu/index.html'
    });
    localStorage.setItem('arcade.test.staleSessionId', stale.id);
    window.ArcadeLocalStore.startSession(stale.id, { source: 'stale_session_recipe' });
    window.ArcadeLocalStore.logout();
    window.ArcadePlatform.refreshAccount();
    return true;
  })()`);
  await cdp.evaluate("document.querySelector('.featured-game[data-game=\"421-duel\"] button').click(); true");
  await waitFor("document.querySelector('#accountDialog')?.open", "Une partie interrompue n'ouvre pas la connexion locale");
  await cdp.evaluate(`(() => {
    const form = document.querySelector('#authForm');
    form.elements.pseudo.value = 'QA Premium';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor("location.pathname.endsWith('/games/421/index.html') && window.ArcadeGameSession?.state === 'created'", "Une ancienne partie active bloque encore la connexion et le lancement", 10000);
  assert.equal(
    await cdp.evaluate("window.ArcadeLocalStore.getSession(localStorage.getItem('arcade.test.staleSessionId'))?.state"),
    "abandoned",
    "L'ancienne partie doit être clôturée avant le nouveau lancement",
  );

  const pilots = [
    { key: "crossyturfu", title: "Crossy Turfu", path: "/games/crossy-turfu/index.html", start: ".menu-btn.btn-primary" },
    { key: "421-duel", title: "421 Duel", path: "/games/421/index.html", start: "#roll" },
    { key: "farkle-boheme", title: "Dés de Bohême", path: "/games/Yahtzee/yahtzee.html", start: "#btn-start" },
    { key: "poker", title: "River Room Poker", path: "/games/Poker/poker.html", start: "#btn-start" },
    { key: "cyber-core-sorter", title: "Cyber-Core Sorter", path: "/games/Cyber-CoreSorter/Cyber-CoreSorter.html", start: "#btn-start" },
    { key: "taquin", title: "Pixel Taquin", path: "/games/taquin/index.html", start: "#btn-start-game" },
  ];

  for (const [pilotIndex, pilot] of pilots.entries()) {
    await navigate(`${baseUrl}/index.html`);
    await cdp.evaluate(`window.ArcadeLocalStore.login(${JSON.stringify(`Recette ${pilotIndex + 1}`)})`);
    const session = await cdp.evaluate(`window.ArcadeLocalStore.createSession(${JSON.stringify({
      gameKey: pilot.key,
      title: pilot.title,
      url: pilot.path,
    })})`);
    assert.equal(session.state, "created", `${pilot.title} doit créer une session prête`);

    const gameUrl = `${baseUrl}${pilot.path}?arcadeSession=${encodeURIComponent(session.id)}`;
    await navigate(gameUrl);
    try {
      await waitFor("Boolean(window.ArcadeGameSession && document.querySelector('#arcadeGameShellButton'))", `${pilot.title} n'initialise pas le shell`);
    } catch (error) {
      const debug = await cdp.evaluate("({ href:location.href, state:window.ArcadeGameSession?.state, shell:Boolean(window.ArcadeGameShell), body:document.body?.dataset?.arcadeShell, scripts:[...document.scripts].map(s=>s.src), title:document.title })");
      throw new Error(`${error.message} · ${JSON.stringify(debug)} · ${runtimeErrors.join(' | ')}`);
    }
    await waitFor("document.querySelector('#arcadeGameShellDialog')?.open", `${pilot.title} n'affiche pas le tutoriel initial`);

    const tutorial = await cdp.evaluate(`({
      cards: document.querySelectorAll('#arcadeShellTutorial li').length,
      text: document.querySelector('#arcadeShellTutorial')?.innerText || '',
      state: window.ArcadeGameSession.state
    })`);
    assert.equal(tutorial.cards, 3, `${pilot.title} doit afficher trois cartes de tutoriel`);
    assert.equal(tutorial.state, "created", `${pilot.title} ne doit pas démarrer derrière le tutoriel`);

    const tutorialDismissButton = pilotIndex % 2 === 0 ? "#arcadeShellTutorialStart" : "#arcadeShellTutorialSkip";
    await cdp.evaluate(`document.querySelector(${JSON.stringify(tutorialDismissButton)}).click(); true`);
    await waitFor("!document.querySelector('#arcadeGameShellDialog')?.open", `${pilot.title} ne ferme pas son tutoriel`);
    assert.equal(
      await cdp.evaluate(`Object.keys(localStorage).some((key) => key.startsWith('arcade.tutorial.seen.') && key.endsWith(${JSON.stringify(`.${pilot.key}`)}))`),
      true,
      `${pilot.title} ne mémorise pas durablement le refus du tutoriel`,
    );
    await cdp.evaluate(`document.querySelector(${JSON.stringify(pilot.start)}).click(); true`);
    try {
      await waitFor("window.ArcadeGameSession.state === 'started'", `${pilot.title} ne démarre pas sa session`);
    } catch (error) {
      const debug = await cdp.evaluate("({ state:window.ArcadeGameSession?.state, gameHidden:document.querySelector('#game-screen')?.className, menuHidden:document.querySelector('#menu-screen')?.className })");
      throw new Error(`${error.message} · ${JSON.stringify(debug)} · ${runtimeErrors.join(' | ')}`);
    }
    if (pilot.key === "421-duel") {
      const dice421 = await cdp.evaluate(`(() => {
        const dice = [...document.querySelectorAll('.die-tile')];
        const menu = document.querySelector('#arcadeGameShellButton');
        return {
          dice: dice.length,
          visibleDice: dice.filter((die) => { const rect = die.getBoundingClientRect(); const style = getComputedStyle(die); return rect.width >= 60 && rect.height >= 60 && style.backgroundImage !== 'none'; }).length,
          pips: document.querySelectorAll('.die-tile .pip').length,
          menuText: menu.textContent.trim(),
          menuTop: Math.round(menu.getBoundingClientRect().top),
          docked: menu.closest('.arcade-district-session-slot') !== null,
        };
      })()`);
      assert.equal(dice421.dice, 6, "Le 421 doit afficher six faces de dés");
      assert.equal(dice421.visibleDice, 6, "Les faces du 421 doivent avoir un fond et une taille visibles");
      assert(dice421.pips >= 6, "Les dés du 421 doivent afficher leurs points");
      assert.equal(dice421.menuText, "Menu du jeu", "Le menu commun doit avoir un libellé explicite");
      assert.equal(dice421.docked, true, "Le menu du 421 doit être ancré en haut de la table");
      assert(dice421.menuTop < 80, "Le menu du 421 ne doit plus flotter en bas de l'écran");
    }

    for (const viewport of [[320, 568], [390, 844], [1366, 768]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport[0], height: viewport[1], deviceScaleFactor: 1, mobile: viewport[0] < 800,
      });
      await delay(80);
      await cdp.evaluate("window.dispatchEvent(new Event('resize')); true");
      await delay(40);
      const layout = await cdp.evaluate(`({
        width: innerWidth,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        verticalOverflow: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight,
        offenders: [...document.querySelectorAll('body *')].filter((element) => {
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && (rect.left < -2 || rect.right > innerWidth + 2);
        }).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), rect: (() => { const r = element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width)]; })() })),
        shellButton: (() => { const r = document.querySelector('#arcadeGameShellButton').getBoundingClientRect(); return { width:r.width, height:r.height, visible:r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight }; })(),
        commonChrome: (() => {
          const hud = document.querySelector('#arcadeSessionHud');
          const home = document.querySelector('#arcadeHomeButton');
          const shell = document.querySelector('#arcadeGameShellButton');
          const rect = (element) => { const r = element.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; };
          const hudRect = rect(hud), homeRect = rect(home);
          return {
            hudTop: Math.round(hudRect.top),
            shellInsideHud: shell.parentElement === hud,
            overlap: Math.min(hudRect.right,homeRect.right) > Math.max(hudRect.left,homeRect.left)
              && Math.min(hudRect.bottom,homeRect.bottom) > Math.max(hudRect.top,homeRect.top),
            homeCount: document.querySelectorAll('#arcadeHomeButton').length,
            hudCount: document.querySelectorAll('#arcadeSessionHud').length,
            menuCount: document.querySelectorAll('#arcadeGameShellButton').length,
          };
        })()
      })`);
      assert(layout.horizontalOverflow <= 2, `${pilot.title} déborde horizontalement à ${viewport[0]}×${viewport[1]} : ${JSON.stringify(layout.offenders)}`);
      assert(layout.commonChrome.hudTop < 80, `${pilot.title} affiche encore le statut de session en bas à ${viewport[0]}×${viewport[1]}`);
      assert(layout.commonChrome.shellInsideHud, `${pilot.title} détache le menu du statut de session`);
      assert.equal(layout.commonChrome.overlap, false, `${pilot.title} superpose le retour et le statut commun à ${viewport[0]}×${viewport[1]}`);
      assert.deepEqual(
        [layout.commonChrome.homeCount, layout.commonChrome.hudCount, layout.commonChrome.menuCount],
        [1, 1, 1],
        `${pilot.title} duplique une commande commune`,
      );
      if (pilot.key === "421-duel" && viewport[0] >= 900 && viewport[1] >= 680) {
        const tableBounds = await cdp.evaluate(`(() => { const r = document.querySelector('.table').getBoundingClientRect(); return { top:r.top, bottom:r.bottom }; })()`);
        assert(layout.verticalOverflow <= 2, `Le 421 impose encore un scroll desktop : ${layout.verticalOverflow}px`);
        assert(tableBounds.top >= 0 && tableBounds.bottom <= viewport[1] + 1, `La table 421 doit rester entièrement visible : ${JSON.stringify(tableBounds)}`);
      }
      if (pilot.key === "farkle-boheme") {
        assert.equal(layout.shellButton.visible, false, `Dés de Bohème doit masquer le bouton Menu du jeu à ${viewport[0]}×${viewport[1]}`);
        const topControls = await cdp.evaluate(`(() => {
          const selectors = ['[data-arcade-home]', '#arcadeSessionHud'];
          const rects = selectors.map((selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { selector, left:r.left, top:r.top, right:r.right, bottom:r.bottom }; });
          const overlaps = [];
          for (let a = 0; a < rects.length; a += 1) for (let b = a + 1; b < rects.length; b += 1) {
            if (Math.min(rects[a].right,rects[b].right) > Math.max(rects[a].left,rects[b].left) && Math.min(rects[a].bottom,rects[b].bottom) > Math.max(rects[a].top,rects[b].top)) overlaps.push([rects[a].selector,rects[b].selector]);
          }
          return { rects, overlaps };
        })()`);
        assert.deepEqual(topControls.overlaps, [], `Navigation de Dés de Bohème superposée à ${viewport[0]}×${viewport[1]} : ${JSON.stringify(topControls.rects)}`);
      } else {
        assert(layout.shellButton.visible, `${pilot.title} masque le menu commun à ${viewport[0]}×${viewport[1]}`);
        assert(layout.shellButton.height >= 38, `${pilot.title} expose une cible menu trop petite à ${viewport[0]}×${viewport[1]}`);
      }
    }

    if (pilot.key === "farkle-boheme") {
      const bohemeUi = await cdp.evaluate(`(() => {
        const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; };
        const overlaps = (a, b) => Math.min(a.right,b.right) > Math.max(a.left,b.left) && Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top);
        const hud = rect('#arcadeSessionHud');
        return {
          quitExists: Boolean(document.querySelector('#btn-quit')), hud,
          hudTop: Math.round(hud.top),
          homeRadius: parseFloat(getComputedStyle(document.querySelector('[data-arcade-home]')).borderRadius),
          goalRadius: parseFloat(getComputedStyle(document.querySelector('.round-info')).borderRadius),
          scoreRadius: parseFloat(getComputedStyle(document.querySelector('.score-help')).borderRadius),
          dockRadius: parseFloat(getComputedStyle(document.querySelector('.control-dock')).borderRadius),
          actionRadius: parseFloat(getComputedStyle(document.querySelector('#btn-roll')).borderRadius),
        };
      })()`);
      assert.equal(bohemeUi.quitExists, false, "Le bouton Quitter redondant doit être retiré de Dés de Bohème");
      assert(bohemeUi.hudTop < 80, "L'état des Coins doit rester accessible en haut");
      assert(bohemeUi.homeRadius >= 10 && bohemeUi.goalRadius >= 10, "La navigation et l'objectif doivent être arrondis");
      assert(bohemeUi.scoreRadius >= 14 && bohemeUi.dockRadius >= 18, "Les panneaux de la taverne doivent être modernisés");
      assert(bohemeUi.actionRadius >= 10, "Les boutons en jeu doivent être légèrement arrondis");
    }

    await cdp.evaluate("document.querySelector('#arcadeGameShellButton').click(); true");
    await waitFor("document.querySelector('#arcadeGameShellDialog')?.open", `${pilot.title} n'ouvre pas le menu commun`);
    const paused = await cdp.evaluate("document.querySelector('#arcadeShellState').textContent === 'En cours'");
    assert(paused, `${pilot.title} perd l'état de session pendant la pause`);
    await cdp.evaluate("document.querySelector('#arcadeShellContinue').click(); true");
    await waitFor("!document.querySelector('#arcadeGameShellDialog')?.open", `${pilot.title} ne reprend pas après fermeture du menu`);

    await cdp.evaluate("window.ArcadeGameSession.lose({ source: 'premium_browser_recipe' }); true");
    await waitFor("window.ArcadeGameSession.state === 'lost' && document.querySelector('#arcadeGameShellDialog')?.open", `${pilot.title} n'affiche pas son résultat commun`);
    const terminal = await cdp.evaluate("document.querySelector('#arcadeShellResult').textContent");
    assert.match(terminal, /terminée|perdue/i, `${pilot.title} n'annonce pas clairement sa fin`);
    await cdp.evaluate("document.querySelector('#arcadeShellReplay').click(); true");
    try {
      await waitFor(`location.href.includes('arcadeSession=') && !location.href.includes(${JSON.stringify(session.id)}) && window.ArcadeGameSession?.state === 'created'`, `${pilot.title} ne recrée pas une session au rejeu`, 10000);
    } catch (error) {
      const debug = await cdp.evaluate("({ href: location.href, state: window.ArcadeGameSession?.state, active: window.ArcadeLocalStore?.getActiveSession?.(), errors: window.__arcadeErrors || [] })");
      throw new Error(`${error.message} · ${JSON.stringify(debug)} · ${runtimeErrors.join(' | ')}`);
    }
  }

  await navigate(`${baseUrl}/index.html`);
  await cdp.evaluate("window.ArcadeLocalStore.login('QA Dice Responsive'); true");
  const diceSession = await cdp.evaluate(`window.ArcadeLocalStore.createSession(${JSON.stringify({
    gameKey: "de",
    title: "Dice District",
    url: "/games/dice-hub/dice-hub.html",
  })})`);
  await navigate(`${baseUrl}/games/dice-hub/dice-hub.html?arcadeSession=${encodeURIComponent(diceSession.id)}`);
  await waitFor("Boolean(window.ArcadeGameSession && document.querySelector('#arcadeGameShellButton'))", "Dice District n'initialise pas son interface commune");
  if (await cdp.evaluate("Boolean(document.querySelector('#arcadeGameShellDialog')?.open)")) {
    await cdp.evaluate("document.querySelector('#arcadeShellTutorialSkip').click(); true");
  }
  const diceHeader = await cdp.evaluate(`(() => {
    const hud = document.querySelector('#arcadeSessionHud');
    const strong = hud.querySelector('strong');
    const hudStyle = getComputedStyle(hud);
    const strongStyle = getComputedStyle(strong);
    return {
      menuHeight: document.querySelector('#arcadeGameShellButton').getBoundingClientRect().height,
      arcadeVisible: document.querySelector('#arcadeHomeButton').getBoundingClientRect().height >= 38,
      hudRadius: parseFloat(hudStyle.borderRadius),
      hudBackground: hudStyle.backgroundImage,
      statusColor: strongStyle.color,
      statusText: strong.textContent.trim(),
    };
  })()`);
  assert.equal(diceHeader.menuHeight, 0, "Dice District doit masquer le bouton Menu du jeu redondant");
  assert.equal(diceHeader.arcadeVisible, true, "Dice District doit conserver son retour Arcade");
  assert(diceHeader.hudRadius >= 10 && diceHeader.hudBackground !== "none", "Le statut des Coins doit reprendre le panneau du District");
  assert.match(diceHeader.statusText, /Coins|Entraînement/, "Le statut de session doit rester explicite");
  for (const viewport of [[320, 568], [390, 844], [768, 900], [1366, 768]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport[0], height: viewport[1], deviceScaleFactor: 1, mobile: viewport[0] < 800,
    });
    await cdp.evaluate("window.dispatchEvent(new Event('resize')); true");
    await delay(80);
    const diceLayout = await cdp.evaluate(`(() => {
      const visible = [...document.querySelectorAll('a,button,input,select')].filter((element) => {
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2
          && rect.bottom > 0 && rect.top < innerHeight;
      });
      const overlaps = [];
      for (let leftIndex = 0; leftIndex < visible.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < visible.length; rightIndex += 1) {
          const left = visible[leftIndex], right = visible[rightIndex];
          if (left.contains(right) || right.contains(left)) continue;
          const a = left.getBoundingClientRect(), b = right.getBoundingClientRect();
          const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const ratio = width * height / Math.min(a.width * a.height, b.width * b.height);
          if (ratio > .18) overlaps.push([
            left.id || left.className || left.tagName,
            right.id || right.className || right.tagName,
            Number(ratio.toFixed(2)),
            [Math.round(a.left), Math.round(a.top), Math.round(a.right), Math.round(a.bottom)],
            [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)],
          ]);
        }
      }
      return {
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        verticalOverflow: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight,
        duplicateHome: Boolean(document.querySelectorAll('#arcadeHomeButton').length > 1),
        shellParent: document.querySelector('#arcadeGameShellButton')?.parentElement?.className || '',
        shellPosition: getComputedStyle(document.querySelector('#arcadeGameShellButton')?.parentElement).position,
        overlaps: overlaps.slice(0, 12),
      };
    })()`);
    assert(diceLayout.horizontalOverflow <= 2, `Dice District déborde à ${viewport[0]}×${viewport[1]}`);
    if (viewport[0] >= 1051 && viewport[1] >= 680) {
      assert(diceLayout.verticalOverflow <= 2, `Dice District impose encore un scroll PC à ${viewport[0]}×${viewport[1]} : ${diceLayout.verticalOverflow}px`);
    }
    assert.equal(diceLayout.duplicateHome, false, "Dice District affiche plusieurs retours Arcade");
    assert.deepEqual(diceLayout.overlaps, [], `Dice District superpose des commandes à ${viewport[0]}×${viewport[1]} : ${JSON.stringify(diceLayout)}`);
  }

  const freeMode = await cdp.evaluate(`(() => {
    const before = window.ArcadeLocalStore.getActiveProfile().balanceUnits;
    document.querySelector('#play-button').click();
    const session = window.ArcadeGameSession.snapshot;
    return {
      badge: document.querySelector('[data-mode="magic"] .free-mode-badge')?.textContent.trim(),
      economyMode: session?.economyMode,
      wagerUnits: session?.wagerUnits,
      balanceBefore: before,
      balanceAfter: window.ArcadeLocalStore.getActiveProfile().balanceUnits,
    };
  })()`);
  assert.equal(freeMode.badge, "FREE", "Lancer libre doit afficher le badge FREE");
  assert.equal(freeMode.economyMode, "practice", "Lancer libre doit démarrer en mode gratuit");
  assert.equal(freeMode.wagerUnits, 0, "Lancer libre ne doit engager aucun Coin");
  assert.equal(freeMode.balanceAfter, freeMode.balanceBefore, "Lancer libre ne doit pas modifier le solde");

  const rollingDice = await cdp.evaluate(`(() => {
    const count = document.querySelector('#dice-count');
    count.value = '3';
    count.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#roll-button').click();
    const dice = [...document.querySelectorAll('#play-die .result-die')];
    return {
      rolling: document.querySelector('#play-die').classList.contains('is-rolling'),
      count: dice.length,
      animationNames: dice.map((die) => getComputedStyle(die).animationName),
      values: dice.map((die) => die.querySelector('.result-die-value')?.textContent),
      centers: dice.map((die) => { const rect = die.getBoundingClientRect(); return Math.round(rect.left + rect.width / 2); }),
    };
  })()`);
  assert.equal(rollingDice.rolling, true, "Le lancer doit déclencher une animation visible");
  assert.equal(rollingDice.count, 3, "Chaque dé lancé doit posséder sa propre face");
  assert(rollingDice.animationNames.every((name) => name === "dice-tumble"), "Chaque dé doit être animé séparément");
  assert.equal(new Set(rollingDice.centers).size, 3, "Les dés ne doivent pas être superposés");
  await delay(1100);
  const settledDice = await cdp.evaluate(`({
    rolling: document.querySelector('#play-die').classList.contains('is-rolling'),
    values: [...document.querySelectorAll('#play-die .result-die-value')].map((node) => node.textContent),
  })`);
  assert.equal(settledDice.rolling, false, "L'animation doit s'arrêter sur le résultat final");
  assert(settledDice.values.every((value) => /^\d+$/.test(value)), "Chaque dé doit afficher un résultat lisible");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1366, height: 768, deviceScaleFactor: 1, mobile: false,
  });
  for (const page of catalogPages) {
    const previousErrorCount = runtimeErrors.length;
    await navigate(`${baseUrl}/${page.route}`);
    await waitFor("Boolean(window.ArcadeGameShell && document.querySelector('#arcadeGameShellButton'))", `Menu commun absent : ${page.route}`);
    const commonMenu = await cdp.evaluate(`({
      key: window.ArcadeGameShell.gameKey,
      title: window.ArcadeGameShell.game?.title,
      tutorial: window.ArcadeGameShell.game?.tutorial?.length,
      buttonHeight: document.querySelector('#arcadeGameShellButton').getBoundingClientRect().height,
      chromeTop: (() => {
        const control = document.querySelector('#arcadeSessionHud') || document.querySelector('#arcadeGameShellButton');
        return Math.round(control.getBoundingClientRect().top);
      })(),
      shellGrouped: (() => {
        const hud = document.querySelector('#arcadeSessionHud');
        const shell = document.querySelector('#arcadeGameShellButton');
        return hud ? shell.parentElement === hud : shell.classList.contains('arcade-game-shell-launcher');
      })(),
      commonCounts: [
        document.querySelectorAll('#arcadeHomeButton').length,
        document.querySelectorAll('#arcadeSessionHud').length,
        document.querySelectorAll('#arcadeGameShellButton').length,
      ]
    })`);
    assert.equal(commonMenu.key, page.key, `Mauvaise configuration détectée pour ${page.route}`);
    assert(commonMenu.title, `Titre commun absent pour ${page.route}`);
    assert.equal(commonMenu.tutorial, 3, `Tutoriel commun incomplet pour ${page.route}`);
    if (["farkle-boheme", "de"].includes(page.key)) assert.equal(commonMenu.buttonHeight, 0, `${page.key} doit masquer son bouton Menu du jeu redondant`);
    else assert(commonMenu.buttonHeight >= 38, `Bouton de menu trop petit pour ${page.route}`);
    assert(commonMenu.chromeTop < 100, `La commande commune reste en bas dans ${page.route}`);
    assert(commonMenu.shellGrouped, `Le menu commun n'est pas regroupé correctement dans ${page.route}`);
    assert.equal(commonMenu.commonCounts[0], 1, `Retour Accueil dupliqué dans ${page.route}`);
    assert(commonMenu.commonCounts[1] <= 1, `Statut commun dupliqué dans ${page.route}`);
    assert.equal(commonMenu.commonCounts[2], 1, `Menu commun dupliqué dans ${page.route}`);
    const externalResources = await cdp.evaluate(`performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name, location.href))
      .filter((url) => /^https?:$/.test(url.protocol) && url.origin !== location.origin)
      .map((url) => url.origin)`);
    assert.deepEqual(externalResources, [], `Ressource distante non maîtrisée sur ${page.route}`);
    if (runtimeErrors.length > previousErrorCount) {
      throw new Error(`${page.route} déclenche une erreur : ${runtimeErrors.slice(previousErrorCount).join(" | ")}`);
    }
  }

  await navigate(`${baseUrl}/games/puissance4/index.html`);
  await waitFor("Boolean(window.THREE && window.THREE.OrbitControls)", "Three.js local n'est pas chargé dans Puissance 4");
  await waitFor("Boolean(window.Puissance4Live && window.Puissance4Game && window.ArcadeSupabase?.connect4)", "Le module Puissance 4 Live ne démarre pas");
  await cdp.evaluate("document.querySelector('[data-opp=live]').click(); true");
  const connect4LiveDesktop = await cdp.evaluate(`(() => ({
    panelVisible: !document.querySelector('#live-multiplayer-group').classList.contains('hidden'),
    authVisible: !document.querySelector('#live-auth-panel').classList.contains('hidden'),
    threeDisabled: document.querySelector('[data-mode="3d"]').disabled,
    localStartHidden: document.querySelector('#btn-start').classList.contains('hidden'),
    overflow: document.documentElement.scrollWidth - innerWidth
  }))()`);
  assert(connect4LiveDesktop.panelVisible && connect4LiveDesktop.authVisible, "Le salon Live déconnecté n'est pas visible");
  assert(connect4LiveDesktop.threeDisabled && connect4LiveDesktop.localStartHidden, "Le Live laisse actifs des contrôles locaux");
  assert(connect4LiveDesktop.overflow <= 2, "Le menu Live déborde sur desktop");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  const connect4LiveMobile = await cdp.evaluate(`({
    overflow: document.documentElement.scrollWidth - innerWidth,
    authWidth: document.querySelector('#live-auth-panel').getBoundingClientRect().width,
    viewport: innerWidth
  })`);
  assert(connect4LiveMobile.overflow <= 2, "Le menu Live déborde sur mobile");
  assert(connect4LiveMobile.authWidth <= connect4LiveMobile.viewport, "Le formulaire Live est trop large sur mobile");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1366, height: 768, deviceScaleFactor: 1, mobile: false,
  });

  for (const legalPage of ["mentions-legales.html", "confidentialite.html", "cgu.html"]) {
    await navigate(`${baseUrl}/legal/${legalPage}`);
    const legalLayout = await cdp.evaluate(`({
      headings: document.querySelectorAll('h1').length,
      hasHomeLink: Boolean(document.querySelector('a[href="../index.html"]')),
      fitsViewport: document.documentElement.scrollWidth <= innerWidth + 1
    })`);
    assert.equal(legalLayout.headings, 1, `Titre légal invalide : ${legalPage}`);
    assert(legalLayout.hasHomeLink, `Retour à l'arcade absent : ${legalPage}`);
    assert(legalLayout.fitsViewport, `Débordement horizontal : ${legalPage}`);
  }

  assert.deepEqual(runtimeErrors, [], `Erreurs JavaScript navigateur :\n${runtimeErrors.join("\n")}`);
  await cdp.evaluate("sessionStorage.setItem('arcade.qa.serverMode', '1'); localStorage.removeItem('arcade.qa.localMode'); true");
  await navigate(`${baseUrl}/index.html`);
  await waitFor("window.ARCADE_CONFIG?.mode === 'supabase' && Boolean(window.ArcadeSupabase) && Boolean(window.ArcadePlatform?.isConfigured())", "Le mode Supabase ne s'initialise pas");
  await cdp.evaluate("document.querySelector('#accountButton').click(); true");
  await waitFor("document.querySelector('#accountDialog')?.open", "Le dialogue de connexion Supabase ne s'ouvre pas");
  await cdp.evaluate("document.querySelector('[data-auth-mode=\"signup\"]').click(); true");
  const serverAuth = await cdp.evaluate(`(() => ({
    mode: window.ARCADE_CONFIG.mode,
    signedOutVisible: !document.querySelector('#signedOutPanel').hidden,
    pseudoVisible: !document.querySelector('#authPseudoField').hidden,
    consentVisible: !document.querySelector('#authConsentField').hidden,
    emailRequired: document.querySelector('#authEmail').required,
    passwordRequired: document.querySelector('#authPassword').required,
    shopDisabled: document.querySelector('#openShopButton').disabled,
    walletLabel: document.querySelector('#platformState').textContent
  }))()`);
  assert.equal(serverAuth.mode, "supabase", "Le site ne bascule pas sur le backend");
  assert(serverAuth.signedOutVisible, "Le formulaire Supabase n'est pas visible");
  assert(serverAuth.pseudoVisible && serverAuth.consentVisible, "L'inscription n'affiche pas les champs requis");
  assert(serverAuth.emailRequired && serverAuth.passwordRequired, "Email et mot de passe ne sont pas obligatoires");
  assert(serverAuth.shopDisabled, "La boutique locale reste active avec les Coins serveur");
  assert.match(serverAuth.walletLabel, /serveur|connexion/i, "L'etat serveur n'est pas annonce");
  await cdp.evaluate(`(() => {
    document.querySelector('[data-auth-mode="signin"]').click();
    const form = document.querySelector('#authForm');
    form.elements.email.value = 'qa-account-does-not-exist@example.invalid';
    form.elements.password.value = 'MotDePasseInutilise-2026';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor("/incorrect|impossible|confirmez/i.test(document.querySelector('#profileStatus')?.textContent || '')", "La connexion Supabase ne renvoie pas d'erreur utilisateur", 10000);
  assert.equal(await cdp.evaluate("Boolean(window.ArcadePlatform.getSession())"), false, "Une connexion invalide cree une session");
  await navigate(`${baseUrl}/games/snake/index.html?arcadeServer=1&arcadeGame=snake`);
  await waitFor("window.ArcadeGameSession?.state === 'created' && Boolean(window.ArcadeSupabase?.startGame)", "Le pont de mise serveur ne démarre pas");
  await cdp.evaluate("window.ArcadeGameSession.start({ source: 'signed_out_recipe' }); true");
  await waitFor("window.ArcadeGameSession?.state === 'abandoned' && Boolean(document.querySelector('#arcadeSessionBlocker'))", "Une partie déconnectée engage encore une mise", 10000);
  assert.deepEqual(runtimeErrors, [], `Erreurs JavaScript serveur :\n${runtimeErrors.join("\n")}`);

  cdp.close();
  console.log(`Recette navigateur : six pilotes responsives et ${catalogPages.length} pages reliées au menu commun`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    browser.kill();
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* Nettoyage best effort. */ }
  });
