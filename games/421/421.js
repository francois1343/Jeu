"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const target = 3;
  const state = {
    player: [1, 1, 1], ai: [1, 1, 1], kept: [false, false, false], rolls: 0,
    playerScore: 0, aiScore: 0, locked: false, paused: false, finished: false, epoch: 0,
  };
  const $ = (id) => document.getElementById(id);
  const playerDice = $("player-dice"), aiDice = $("ai-dice"), roll = $("roll"), bank = $("bank"), status = $("status");

  function schedule(callback, delay) {
    const token = state.epoch;
    window.setTimeout(function runWhenActive() {
      if (token !== state.epoch || state.finished) return;
      if (state.paused) { window.setTimeout(runWhenActive, 100); return; }
      callback();
    }, delay);
  }

  const cube = (value, index, interactive) => `
    <button class="die${state.kept[index] ? " kept" : ""}" type="button" ${interactive ? "" : "disabled"}
      data-index="${index}" aria-pressed="${state.kept[index] ? "true" : "false"}"
      aria-label="Dé ${index + 1} : ${value}${state.kept[index] ? ", conservé" : ""}">
      <span class="die-tile"><strong class="die-number">${value}</strong></span>
    </button>`;

  function render() {
    const canChoose = state.rolls > 0 && !state.locked && !state.paused && !state.finished;
    playerDice.innerHTML = state.player.map((value, index) => cube(value, index, canChoose)).join("");
    aiDice.innerHTML = state.ai.map((value) => cube(value, -1, false)).join("");
    $("player-score").textContent = state.playerScore;
    $("ai-score").textContent = state.aiScore;
    $("roll-count").textContent = `${Math.min(state.rolls + 1, 3)} / 3`;
    roll.disabled = state.paused || state.finished || state.locked || state.rolls >= 3;
    bank.disabled = state.paused || state.finished || state.locked || state.rolls === 0;
  }

  function evaluate(dice) {
    const sorted = [...dice].sort((a, b) => b - a);
    const text = sorted.join("-");
    if (text === "4-2-1") return { value: 1000, label: "421" };
    if (new Set(sorted).size === 1) return { value: 800 + sorted[0], label: `Brelan de ${sorted[0]}` };
    if (sorted[0] === sorted[1] || sorted[1] === sorted[2]) {
      const pair = sorted[0] === sorted[1] ? sorted[0] : sorted[1];
      return { value: 500 + pair * 10 + sorted.find((value) => value !== pair), label: `Double ${pair}` };
    }
    if (text === "3-2-1") return { value: 400, label: "Suite 1-2-3" };
    return { value: sorted[0] * 36 + sorted[1] * 6 + sorted[2], label: `Main ${text}` };
  }

  function throwPlayer() {
    if (state.paused || state.finished || state.locked || state.rolls >= 3) return;
    state.rolls += 1;
    state.player = state.player.map((value, index) => state.kept[index] ? value : 1 + Math.floor(Math.random() * 6));
    $("player-result").textContent = "MAIN EN COURS";
    status.textContent = state.rolls === 3 ? "Dernier lancer : validez votre main." : "Conservez des dés ou relancez les autres.";
    render();
    playerDice.querySelectorAll(".die:not(.kept)").forEach((die) => die.classList.add("rolling"));
    schedule(() => playerDice.querySelectorAll(".rolling").forEach((die) => die.classList.remove("rolling")), 260);
  }

  function aiTurn() {
    let best = [1, 1, 1], bestEval = evaluate(best);
    for (let turn = 0; turn < 3; turn += 1) {
      const candidate = Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * 6));
      const candidateEval = evaluate(candidate);
      if (candidateEval.value > bestEval.value) { best = candidate; bestEval = candidateEval; }
    }
    state.ai = best;
    return bestEval;
  }

  function resolveRound() {
    if (state.paused || state.finished || state.locked || state.rolls === 0) return;
    state.locked = true;
    const playerEval = evaluate(state.player);
    $("player-result").textContent = playerEval.label.toUpperCase();
    status.textContent = "L’IA joue…";
    render();
    schedule(() => {
      const aiEval = aiTurn();
      $("ai-result").textContent = aiEval.label.toUpperCase();
      if (playerEval.value > aiEval.value) { state.playerScore += 1; status.textContent = "Manche remportée !"; }
      else if (playerEval.value < aiEval.value) { state.aiScore += 1; status.textContent = "L’IA remporte cette manche."; }
      else status.textContent = "Égalité : aucune manche marquée.";
      const winner = state.playerScore >= target ? "player" : state.aiScore >= target ? "ai" : null;
      if (winner) {
        state.finished = true;
        $("round-label").textContent = winner === "player" ? "VICTOIRE DU DUEL" : "L’IA GAGNE LE DUEL";
        status.textContent = winner === "player" ? "Bravo, vous remportez le 421 !" : "Défaite. Choisissez Rejouer pour un nouveau duel.";
        const result = { score: state.playerScore, opponentScore: state.aiScore, mode: "421" };
        if (winner === "player") window.ArcadeGameSession?.win?.(result);
        else window.ArcadeGameSession?.lose?.(result);
        render();
        return;
      }
      $("round-label").textContent = `MANCHE ${state.playerScore + state.aiScore + 1} · À VOUS`;
      schedule(resetRound, 1300);
    }, 650);
  }

  function resetRound() {
    state.player = [1, 1, 1]; state.ai = [1, 1, 1]; state.kept = [false, false, false];
    state.rolls = 0; state.locked = false;
    $("player-result").textContent = "CHOISISSEZ VOS DÉS";
    $("ai-result").textContent = "EN ATTENTE";
    status.textContent = "Lancez les trois dés pour commencer la manche.";
    render();
  }

  function resetMatch() {
    state.epoch += 1; state.playerScore = 0; state.aiScore = 0; state.finished = false; state.paused = false;
    $("round-label").textContent = "MANCHE 1 · À VOUS";
    resetRound();
  }

  function requestNewGame() {
    const sessionState = window.ArcadeGameSession?.state;
    if (["won", "lost", "abandoned"].includes(sessionState)) { window.ArcadeGameSession.replay(); return; }
    if (sessionState === "started") {
      if (!window.confirm("Abandonner ce duel et recommencer ?")) return;
      window.ArcadeGameSession.abandon("421_manual_restart");
      window.ArcadeGameSession.replay();
      return;
    }
    resetMatch();
  }

  function configureShell() {
    if (!window.ArcadeGameShell) return;
    window.ArcadeGameShell.configure({
      pause() { state.paused = true; status.textContent = "Partie suspendue."; render(); },
      resume() { state.paused = false; status.textContent = state.rolls ? "Reprenez votre main." : "Lancez les trois dés."; render(); },
    });
  }

  playerDice.addEventListener("click", (event) => {
    const die = event.target.closest(".die");
    if (!die || state.paused || state.rolls === 0 || state.locked || state.finished) return;
    const index = Number(die.dataset.index);
    state.kept[index] = !state.kept[index];
    render();
  });
  roll.addEventListener("click", () => { if (state.rolls === 0) window.ArcadeGameSession?.start?.({ mode: "421" }); throwPlayer(); });
  bank.addEventListener("click", resolveRound);
  $("new-game").addEventListener("click", requestNewGame);
  window.addEventListener("arcade:shell-ready", configureShell);
  configureShell();
  render();
});
