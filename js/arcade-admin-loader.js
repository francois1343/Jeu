(function arcadeAdminLoader(global) {
  "use strict";

  const scripts = [
    "js/core/arcade-admin-config.js",
    "js/core/arcade-audit-store.js",
    "js/core/arcade-admin-data.js",
    "js/arcade-admin.js",
  ];
  let loading = null;

  function loadStyle() {
    if (document.querySelector('link[data-arcade-admin-style]')) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "css/arcade-admin.css";
      link.dataset.arcadeAdminStyle = "true";
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`admin_resource_unavailable:${source}`));
      document.body.appendChild(script);
    });
  }

  function openConsole() {
    const button = document.getElementById("openAdminButton");
    if (button) button.click();
    else document.getElementById("adminDialog")?.showModal?.();
  }

  function load(options = {}) {
    if (!loading) {
      loading = scripts.reduce((chain, source) => chain.then(() => loadScript(source)), loadStyle());
    }
    if (options.open) loading.then(openConsole).catch(() => {
      global.alert?.("La console ADMIN n’est pas disponible pour le moment.");
    });
    return loading;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("#openAdminButton");
    if (!button || global.ArcadeAdminData) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    load({ open: true });
  }, true);

  global.addEventListener("arcade:admin-request", () => load({ open: true }));
  global.ArcadeAdminLoader = Object.freeze({ load });
})(window);
