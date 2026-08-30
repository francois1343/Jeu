document.addEventListener("DOMContentLoaded", () => {
  const sentenceElement = document.getElementById("sentence");
  const statusElement = document.getElementById("forge-status");
  const generateButton = document.getElementById("generate-sentence");
  const copyButton = document.getElementById("copy-sentence");
  const historyElement = document.getElementById("sentence-history");
  const historyEmpty = document.getElementById("history-empty");
  const clearHistoryButton = document.getElementById("clear-history");
  const HISTORY_KEY_PREFIX = "francis-arcade-phrase-forge-history-v1";
  let ingredients = { sujets: [], verbes: [], complements: [] };
  let currentSentence = "";

  function choisir(tableau) {
    return tableau[Math.floor(Math.random() * tableau.length)];
  }

  function lireCsv(csvText) {
    const lines = csvText.trim().split(/\r?\n/).slice(1);
    const result = { sujets: [], verbes: [], complements: [] };

    lines.forEach((line) => {
      const [sujet, verbe, ...reste] = line.split(",");
      const complement = reste.join(",").trim();
      if (sujet?.trim() && verbe?.trim() && complement) {
        result.sujets.push(sujet.trim());
        result.verbes.push(verbe.trim());
        result.complements.push(complement);
      }
    });
    return result;
  }

  function cleHistorique() {
    const pseudo = window.ArcadeLocalStore?.getActiveProfile?.()?.pseudo || "invité";
    return `${HISTORY_KEY_PREFIX}:${encodeURIComponent(String(pseudo).trim().toLowerCase())}`;
  }

  function lireHistorique() {
    try {
      const saved = JSON.parse(localStorage.getItem(cleHistorique()) || "[]");
      return (Array.isArray(saved) ? saved : [])
        .filter((entry) => typeof entry?.text === "string" && entry.text.trim())
        .map((entry) => ({ text: entry.text.slice(0, 260), createdAt: Number(entry.createdAt) || Date.now() }))
        .slice(0, 30);
    } catch {
      return [];
    }
  }

  function afficherHistorique() {
    const entries = lireHistorique();
    historyElement.innerHTML = "";
    entries.forEach((entry) => {
      const item = document.createElement("li");
      const phrase = document.createElement("span");
      const date = document.createElement("time");
      phrase.textContent = entry.text;
      date.dateTime = new Date(entry.createdAt).toISOString();
      date.textContent = new Date(entry.createdAt).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
      item.append(phrase, date);
      historyElement.appendChild(item);
    });
    historyEmpty.hidden = entries.length > 0;
    clearHistoryButton.disabled = entries.length === 0;
  }

  function sauvegarderPhrase(phrase) {
    const history = lireHistorique();
    if (history[0]?.text !== phrase) history.unshift({ text: phrase, createdAt: Date.now() });
    try {
      localStorage.setItem(cleHistorique(), JSON.stringify(history.slice(0, 30)));
    } catch {
      // L'idée reste affichée même si le navigateur refuse le stockage.
    }
    afficherHistorique();
  }

  function effacerHistorique() {
    try {
      localStorage.removeItem(cleHistorique());
    } catch {
      // Rien à effacer si le stockage n'est pas disponible.
    }
    afficherHistorique();
    statusElement.textContent = "Le grimoire est vide et prêt pour de nouvelles aventures.";
  }

  function afficherPhrase() {
    if (!ingredients.sujets.length) return;
    window.ArcadeGameSession?.start({ mode: "creative" });

    currentSentence = `${choisir(ingredients.sujets)} ${choisir(ingredients.verbes)} ${choisir(ingredients.complements)}.`;
    sauvegarderPhrase(currentSentence);
    sentenceElement.classList.remove("is-visible");
    requestAnimationFrame(() => {
      sentenceElement.textContent = currentSentence;
      sentenceElement.classList.add("is-visible");
    });
    statusElement.textContent = "Idée reçue ! À vous de la transformer en aventure.";
    copyButton.disabled = false;
  }

  async function copierPhrase() {
    if (!currentSentence) return;
    try {
      await navigator.clipboard.writeText(currentSentence);
      statusElement.textContent = "Phrase copiée dans votre grimoire numérique.";
    } catch {
      statusElement.textContent = "Sélectionnez la phrase pour la copier manuellement.";
    }
  }

  generateButton.addEventListener("click", afficherPhrase);
  copyButton.addEventListener("click", copierPhrase);
  clearHistoryButton.addEventListener("click", effacerHistorique);
  copyButton.disabled = true;
  afficherHistorique();

  fetch("jeu-des-phrases.csv")
    .then((response) => {
      if (!response.ok) throw new Error(`Erreur réseau : ${response.status}`);
      return response.text();
    })
    .then((csvText) => {
      ingredients = lireCsv(csvText);
      if (!ingredients.sujets.length) throw new Error("csv_vide");
      afficherPhrase();
    })
    .catch((error) => {
      console.error("Erreur lors du chargement du grimoire :", error);
      sentenceElement.textContent = "Le grimoire est momentanément fermé.";
      statusElement.textContent = "Réessayez après avoir vérifié le fichier d'idées.";
    });
});
