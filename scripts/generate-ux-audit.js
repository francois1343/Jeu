"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "data", "ux-audit.json");
const port = Number(process.env.ARCADE_AUDIT_PORT || 4174);
const debugPort = Number(process.env.ARCADE_AUDIT_DEBUG_PORT || 9382);
const baseUrl = process.env.ARCADE_BASE_URL || `http://127.0.0.1:${port}`;
const viewports = [
  { name: "desktop", width: 1366, height: 768, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "mobile-small", width: 320, height: 568, mobile: true },
  { name: "tablet", width: 768, height: 900, mobile: true },
];

function walkHtml(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkHtml(fullPath) : entry.isFile() && entry.name.endsWith(".html") ? [fullPath] : [];
  });
}

const gamePages = walkHtml(path.join(root, "games"));
const pages = [path.join(root, "index.html"), ...gamePages, path.join(root, "admin", "index.html")]
  .map((file) => ({
    file,
    route: path.relative(root, file).split(path.sep).map(encodeURIComponent).join("/"),
    label: path.relative(root, file).replaceAll(path.sep, "/"),
  }));

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
if (!chromePath) throw new Error("Chrome ou Edge est requis pour l'audit UX.");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retry(operation, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { return await operation(); }
    catch (error) { lastError = error; await delay(100); }
  }
  throw lastError || new Error("Délai dépassé");
}

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  close() { this.socket.close(); }
}

function measurementExpression() {
  return `(() => {
    const modal = [...document.querySelectorAll('dialog[open]')].findLast((dialog) => dialog.matches(':modal'));
    const boundsCache = new WeakMap();
    const visibleBounds = (element) => {
      if (boundsCache.has(element)) return boundsCache.get(element);
      const rect = element.getBoundingClientRect();
      let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
      let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
      const bounds = { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      boundsCache.set(element, bounds);
      return bounds;
    };
    const rendered = (element) => {
      for (let parent = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= .02) return false;
      }
      const bounds = visibleBounds(element);
      return bounds.width > 1 && bounds.height > 1;
    };
    const overlay = [...document.querySelectorAll('.overlay:not(.hidden),.modal.modal-active,.reward-modal.show')]
      .filter((element) => rendered(element) && getComputedStyle(element).pointerEvents !== 'none')
      .sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0)).at(-1);
    const visible = (element) => {
      if (!rendered(element)) return false;
      if (element.closest('[inert]')) return false;
      if (modal) return modal === element || modal.contains(element);
      if (overlay && !overlay.contains(element) && overlay !== element
        && !element.closest('#arcadeHomeButton,#arcadeSessionHud,#arcadeGameShellButton')) return false;
      return true;
    };
    const name = (element) => (element.getAttribute('aria-label') || element.textContent || element.id || element.className || element.tagName)
      .replace(/\\s+/g, ' ').trim().slice(0, 54);
    const controls = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')]
      .filter((element) => visible(element) && !element.disabled && getComputedStyle(element).pointerEvents !== 'none' && element.getAttribute('aria-hidden') !== 'true');
    const smallTargets = controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: name(element), width: Math.round(rect.width), height: Math.round(rect.height) };
    }).filter((item) => item.width < 44 || item.height < 44);
    const overlaps = [];
    for (let i = 0; i < controls.length; i += 1) for (let j = i + 1; j < controls.length; j += 1) {
      const left = controls[i], right = controls[j];
      if (left.contains(right) || right.contains(left)) continue;
      const a = visibleBounds(left), b = visibleBounds(right);
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const ratio = width * height / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
      if (ratio > .18) overlaps.push({ left: name(left), right: name(right), left_id: left.id, right_id: right.id, ratio: Number(ratio.toFixed(2)) });
    }
    const fixedCuts = [...document.querySelectorAll('body *')].filter(visible).map((element) => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      if (!['fixed','sticky'].includes(style.position)) return null;
      if (!controls.some((control) => element === control || element.contains(control))) return null;
      if (rect.left < -2 || rect.right > innerWidth + 2 || rect.top < -2 || rect.bottom > innerHeight + 2) {
        return { name: name(element), position: style.position };
      }
      return null;
    }).filter(Boolean);
    const tinyText = [...document.querySelectorAll('button,a,p,li,label,small,input,select')].filter((element) => {
      if (!visible(element) || !(element.textContent || element.value || '').trim()) return false;
      return parseFloat(getComputedStyle(element).fontSize) < 12;
    }).map((element) => name(element)).slice(0, 20);
    const root = document.documentElement; const body = document.body;
    return {
      title: document.title,
      horizontal_overflow_px: Math.max(0, Math.round(Math.max(root.scrollWidth, body.scrollWidth) - innerWidth)),
      vertical_scroll_px: Math.max(0, Math.round(Math.max(root.scrollHeight, body.scrollHeight) - innerHeight)),
      controls: controls.length,
      small_targets: smallTargets.slice(0, 20),
      small_target_count: smallTargets.length,
      overlaps: overlaps.slice(0, 12),
      overlap_count: overlaps.length,
      fixed_cuts: fixedCuts.slice(0, 12),
      fixed_cut_count: fixedCuts.length,
      tiny_text: tinyText,
      tiny_text_count: tinyText.length
    };
  })()`;
}

function score(result) {
  return Math.max(0, 100
    - (result.horizontal_overflow_px > 2 ? 30 : 0)
    - Math.min(30, result.overlap_count * 6)
    - Math.min(25, result.small_target_count * 2)
    - Math.min(20, result.fixed_cut_count * 5)
    - Math.min(10, result.tiny_text_count));
}

function percentage(value, total) {
  return total ? Math.round((value / total) * 100) : 100;
}

async function main() {
  const ownServer = !process.env.ARCADE_BASE_URL;
  const server = ownServer ? spawn("python", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: root, stdio: "ignore", windowsHide: true,
  }) : null;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "francis-arcade-ux-"));
  const browser = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--mute-audio", `${baseUrl}/index.html`,
  ], { stdio: "ignore", windowsHide: true });

  try {
    await retry(async () => {
      const response = await fetch(`${baseUrl}/index.html`);
      if (!response.ok) throw new Error(`Serveur HTTP ${response.status}`);
      return true;
    });
    const target = await retry(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((candidate) => candidate.type === "page");
      if (!page) throw new Error("Onglet d'audit absent");
      return page;
    });
    const cdp = new DevTools(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "try { localStorage.setItem('arcade.qa.localMode', '1'); } catch (_) {}",
    });

    const results = [];
    for (const viewport of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
      });
      for (const page of pages) {
        try {
          const destination = `${baseUrl}/${page.route}`;
          await cdp.send("Page.navigate", { url: destination });
          await retry(async () => {
            if (!await cdp.evaluate(`location.href === ${JSON.stringify(destination)} && document.readyState === 'complete'`)) throw new Error("page_incomplete");
            return true;
          }, 8000);
          await cdp.evaluate("document.fonts.ready.then(() => true)");
          if (gamePages.includes(page.file)) {
            await retry(async () => {
              if (!await cdp.evaluate("Boolean(window.ArcadeGameShell)")) throw new Error("shell_incomplete");
              return true;
            }, 5000);
            await cdp.evaluate("(() => { const dialog = document.getElementById('arcadeGameShellDialog'); if (dialog?.open) document.getElementById('arcadeShellTutorialSkip')?.click(); return true; })()");
          }
          await delay(page.label.includes("openworld") ? 1100 : 100);
          const metrics = await cdp.evaluate(measurementExpression());
          results.push({ page: page.label, viewport: viewport.name, ...metrics, score: score(metrics) });
        } catch (error) {
          results.push({ page: page.label, viewport: viewport.name, error: error.message, score: 0 });
        }
      }
      console.log(`Audit UX : ${viewport.name}, ${pages.length} pages contrôlées.`);
    }
    cdp.close();

    const gameLabels = new Set(gamePages.map((file) => path.relative(root, file).replaceAll(path.sep, "/")));
    const gameResults = results.filter((item) => gameLabels.has(item.page));
    const grouped = new Map();
    gameResults.forEach((item) => grouped.set(item.page, [...(grouped.get(item.page) || []), item]));
    const responsivePass = [...grouped.values()].filter((items) => items.length === viewports.length && items.every((item) => !item.error && item.horizontal_overflow_px <= 2 && item.fixed_cut_count === 0)).length;
    const overlapPass = [...grouped.values()].filter((items) => items.length === viewports.length && items.every((item) => !item.error && item.overlap_count === 0)).length;
    const totalControls = gameResults.reduce((sum, item) => sum + (item.controls || 0), 0);
    const smallTargets = gameResults.reduce((sum, item) => sum + (item.small_target_count || 0), 0);
    const shellPages = gamePages.filter((file) => /arcade-game-(?:bridge|shell)\.js/.test(fs.readFileSync(file, "utf8"))).length;
    const averageScore = Math.round(gameResults.reduce((sum, item) => sum + item.score, 0) / Math.max(1, gameResults.length));
    const commercialReadiness = Math.round(averageScore * .45 + percentage(shellPages, gamePages.length) * .2 + 35 * .35);
    const worst = gameResults.slice().sort((a, b) => a.score - b.score).slice(0, 8).map((item) => `${item.page} (${item.viewport}, ${item.score}/100)`);

    const report = {
      generated_at: new Date().toISOString(),
      methodology: "Mesure navigateur des interfaces visibles en 1366×768, 390×844, 320×568 et 768×900, après fermeture du tutoriel et avec réduction des animations. Les ancêtres masqués, zones non interactives, fenêtres fermées, décors et parties hors des cadres défilants sont exclus des collisions de commandes. Seuil tactile : 44 px.",
      viewports,
      summary: {
        pages_audited: gamePages.length,
        viewport_checks: gameResults.length,
        pages_without_overflow: responsivePass,
        responsive_pass_percent: percentage(responsivePass, gamePages.length),
        pages_without_overlaps: overlapPass,
        overlap_free_percent: percentage(overlapPass, gamePages.length),
        touch_target_pass_percent: percentage(Math.max(0, totalControls - smallTargets), totalControls),
        shared_shell_percent: percentage(shellPages, gamePages.length),
        average_ux_score: averageScore,
        commercial_readiness_percent: commercialReadiness,
        worst_checks: worst,
      },
      findings: [
        { severity: "critique", title: "Pop-ups de partie trop bloquantes", detail: "Le blocage technique commun est maintenant compact, mais les écrans avant/après partie propres à plusieurs jeux occupent encore tout le viewport. Les convertir progressivement en carte ou bottom-sheet.", scope: "PARCOURS DE JEU" },
        { severity: responsivePass === gamePages.length ? "confort" : "high", title: "Couverture responsive", detail: `${responsivePass}/${gamePages.length} jeux sans débordement horizontal ni commande fixe coupée aux quatre formats testés.`, scope: "MOBILE + TABLETTE + PC" },
        { severity: "high", title: "Cibles tactiles sous 44 px", detail: `${smallTargets} contrôle(s) mesuré(s) sous le seuil recommandé sur ${totalControls} contrôles visibles.`, scope: "ACCESSIBILITÉ" },
        { severity: overlapPass === gamePages.length ? "confort" : "high", title: "Superpositions des commandes", detail: `${overlapPass}/${gamePages.length} interfaces d'accueil sans collision de commandes aux quatre formats testés. Les parties, pauses et menus de 12 jeux sont aussi couverts par la recette responsive interactive.`, scope: "NAVIGATION + COMMANDES" },
        { severity: "medium", title: "Zone de jeu pas toujours au-dessus de la ligne de flottaison", detail: "Plusieurs introductions et tableaux prennent trop de hauteur sur un PC 768 px. Réduire les entêtes et rendre les panneaux secondaires repliables.", scope: "DESKTOP" },
        { severity: "confort", title: "Migration React/Vue prématurée", detail: "Le principal risque est la cohérence produit, pas la bibliothèque. Consolider d'abord le shell, les composants CSS et les services; migrer seulement si l'état partagé devient un frein mesuré.", scope: "ARCHITECTURE" },
      ],
      roadmap: [
        { status: "EN COURS", title: "Stabiliser le shell responsive", detail: "Navigation unique, pop-ups compacts, cibles 44 px et recette automatique sur les 43 jeux.", progress: Math.round((percentage(responsivePass, gamePages.length) + percentage(overlapPass, gamePages.length) + percentage(Math.max(0, totalControls - smallTargets), totalControls)) / 3) },
        { status: "À CERTIFIER", title: "Finir six jeux pilotes", detail: "Snake, Puissance 4, Dice District, 421, Dés de Bohême et Calcul mental comme référence UX.", progress: 48 },
        { status: "EN CONSTRUCTION", title: "Autorité serveur et multijoueur", detail: "Coins, résultats, tours, invitations, reconnexion et abandon gérés côté serveur.", progress: 38 },
        { status: "APRÈS BÊTA", title: "Préparer la commercialisation", detail: "Mesure de rétention, consentement analytics, support, modération, paiements et exploitation.", progress: 18 },
      ],
      results,
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Audit UX terminé : ${gamePages.length} jeux, ${gameResults.length} contrôles de viewport, score moyen ${averageScore}/100.`);
    console.log(`Rapport : ${path.relative(root, outputPath)}`);
  } finally {
    browser.kill();
    if (server) server.kill();
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

module.exports = { DevTools, retry, measurementExpression, viewports };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
