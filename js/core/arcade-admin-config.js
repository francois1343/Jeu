(function arcadeAdminConfig(global) {
  "use strict";

  const themes = [
    {
      id: "executive",
      name: "Executive Blue",
      description: "Bleu ardoise, précis et sobre.",
      preview: ["#101827", "#24364f", "#69b7e6"],
      variables: {
        "--admin-surface": "#101827",
        "--admin-surface-raised": "#172235",
        "--admin-surface-soft": "#1c2a3f",
        "--admin-border": "#30425b",
        "--admin-border-strong": "#4b6687",
        "--admin-accent": "#69b7e6",
        "--admin-accent-rgb": "105, 183, 230",
        "--admin-accent-secondary": "#8fd8cf",
        "--admin-text": "#f3f7fc",
        "--admin-muted": "#afbdcf",
        "--admin-subtle": "#8291a6",
        "--admin-success": "#75d6a5",
        "--admin-warning": "#dfc16f",
        "--admin-danger": "#ed8c94",
      },
    },
    {
      id: "violet-office",
      name: "Violet Office",
      description: "L’ADN Francis Arcade, plus maîtrisé.",
      preview: ["#151326", "#30284d", "#a895df"],
      variables: {
        "--admin-surface": "#151326",
        "--admin-surface-raised": "#211d36",
        "--admin-surface-soft": "#2a2442",
        "--admin-border": "#443a62",
        "--admin-border-strong": "#65558d",
        "--admin-accent": "#a895df",
        "--admin-accent-rgb": "168, 149, 223",
        "--admin-accent-secondary": "#77cbd3",
        "--admin-text": "#f7f4ff",
        "--admin-muted": "#c2b9d4",
        "--admin-subtle": "#9187aa",
        "--admin-success": "#7bd2a3",
        "--admin-warning": "#ddbe73",
        "--admin-danger": "#e98eaa",
      },
    },
    {
      id: "graphite",
      name: "Graphite",
      description: "Neutre, contrasté et concentré.",
      preview: ["#15181d", "#2b3038", "#9bc2c8"],
      variables: {
        "--admin-surface": "#15181d",
        "--admin-surface-raised": "#20242b",
        "--admin-surface-soft": "#292e36",
        "--admin-border": "#3d454f",
        "--admin-border-strong": "#586571",
        "--admin-accent": "#9bc2c8",
        "--admin-accent-rgb": "155, 194, 200",
        "--admin-accent-secondary": "#b6a3d7",
        "--admin-text": "#f4f6f8",
        "--admin-muted": "#b7bec7",
        "--admin-subtle": "#89939e",
        "--admin-success": "#86c9a5",
        "--admin-warning": "#d5bb7a",
        "--admin-danger": "#dc9398",
      },
    },
  ];

  const fonts = [
    {
      id: "professional",
      name: "Professionnelle",
      description: "Interface système nette et familière.",
      body: '"Segoe UI", Inter, system-ui, sans-serif',
      heading: '"Segoe UI", Inter, system-ui, sans-serif',
    },
    {
      id: "technical",
      name: "Technique",
      description: "Rajdhani lisible avec titres structurés.",
      body: '"Rajdhani", "Segoe UI", sans-serif',
      heading: '"Rajdhani", "Segoe UI", sans-serif',
    },
    {
      id: "arcade-accent",
      name: "Arcade discret",
      description: "Texte lisible et titres Orbitron réservés aux accents.",
      body: '"Rajdhani", "Segoe UI", sans-serif',
      heading: '"Orbitron", "Segoe UI", sans-serif',
    },
    {
      id: "data-mono",
      name: "Data Mono",
      description: "Une lecture plus technique des tableaux.",
      body: '"Segoe UI", system-ui, sans-serif',
      heading: 'Consolas, "Cascadia Mono", monospace',
    },
  ];

  const effects = [
    {
      id: "minimal",
      name: "Minimal",
      description: "Animations et halos presque supprimés.",
      variables: {
        "--admin-dialog-shadow": "0 22px 60px rgba(0, 0, 0, .48)",
        "--admin-accent-shadow": "none",
        "--admin-backdrop-blur": "2px",
        "--admin-hover-lift": "0px",
        "--admin-transition-duration": "0ms",
      },
    },
    {
      id: "balanced",
      name: "Équilibré",
      description: "Transitions douces et touches lumineuses modérées.",
      variables: {
        "--admin-dialog-shadow": "0 28px 80px rgba(0, 0, 0, .56), 0 0 24px rgba(var(--admin-accent-rgb), .08)",
        "--admin-accent-shadow": "0 8px 24px rgba(var(--admin-accent-rgb), .13)",
        "--admin-backdrop-blur": "6px",
        "--admin-hover-lift": "-1px",
        "--admin-transition-duration": "160ms",
      },
    },
    {
      id: "signature",
      name: "Signature Francis",
      description: "Un peu plus de présence néon, sans revenir au mode arcade complet.",
      variables: {
        "--admin-dialog-shadow": "0 30px 90px rgba(0, 0, 0, .6), 0 0 38px rgba(var(--admin-accent-rgb), .16)",
        "--admin-accent-shadow": "0 10px 30px rgba(var(--admin-accent-rgb), .22)",
        "--admin-backdrop-blur": "9px",
        "--admin-hover-lift": "-2px",
        "--admin-transition-duration": "220ms",
      },
    },
  ];

  global.ARCADE_ADMIN_CONFIG = Object.freeze({
    version: 1,
    defaults: Object.freeze({ themeId: "executive", fontId: "professional", effectsId: "balanced" }),
    themes: Object.freeze(themes.map(Object.freeze)),
    fonts: Object.freeze(fonts.map(Object.freeze)),
    effects: Object.freeze(effects.map(Object.freeze)),
  });
})(window);
