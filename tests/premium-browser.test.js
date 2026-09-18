"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
  await waitFor("Boolean(window.ArcadeLocalStore)", "Le store Arcade n'est pas chargé");
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

  for (const pilot of pilots) {
    await navigate(`${baseUrl}/index.html`);
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

    await cdp.evaluate("document.querySelector('#arcadeShellTutorialStart').click(); true");
    await waitFor("!document.querySelector('#arcadeGameShellDialog')?.open", `${pilot.title} ne ferme pas son tutoriel`);
    await cdp.evaluate(`document.querySelector(${JSON.stringify(pilot.start)}).click(); true`);
    try {
      await waitFor("window.ArcadeGameSession.state === 'started'", `${pilot.title} ne démarre pas sa session`);
    } catch (error) {
      const debug = await cdp.evaluate("({ state:window.ArcadeGameSession?.state, gameHidden:document.querySelector('#game-screen')?.className, menuHidden:document.querySelector('#menu-screen')?.className })");
      throw new Error(`${error.message} · ${JSON.stringify(debug)} · ${runtimeErrors.join(' | ')}`);
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
        offenders: [...document.querySelectorAll('body *')].filter((element) => {
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && (rect.left < -2 || rect.right > innerWidth + 2);
        }).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), rect: (() => { const r = element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width)]; })() })),
        shellButton: (() => { const r = document.querySelector('#arcadeGameShellButton').getBoundingClientRect(); return { width:r.width, height:r.height, visible:r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight }; })()
      })`);
      assert(layout.horizontalOverflow <= 2, `${pilot.title} déborde horizontalement à ${viewport[0]}×${viewport[1]} : ${JSON.stringify(layout.offenders)}`);
      assert(layout.shellButton.visible, `${pilot.title} masque le menu commun à ${viewport[0]}×${viewport[1]}`);
      assert(layout.shellButton.height >= 38, `${pilot.title} expose une cible menu trop petite à ${viewport[0]}×${viewport[1]}`);
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
    await waitFor(`location.href.includes('arcadeSession=') && !location.href.includes(${JSON.stringify(session.id)}) && window.ArcadeGameSession?.state === 'created'`, `${pilot.title} ne recrée pas une session au rejeu`, 10000);
  }

  assert.deepEqual(runtimeErrors, [], `Erreurs JavaScript navigateur :\n${runtimeErrors.join("\n")}`);
  cdp.close();
  console.log("Recette navigateur des six pilotes (320, 390 et desktop) : OK");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    browser.kill();
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* Nettoyage best effort. */ }
  });
