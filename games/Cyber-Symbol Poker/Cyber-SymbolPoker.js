class AudioEngine {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  playSynth(freq, type, duration, vol) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playDeal() {
    this.playSynth(150, "triangle", 0.1, 0.2);
  }
  playHold() {
    this.playSynth(800, "sine", 0.1, 0.1);
  }
  playWin() {
    [440, 554, 659, 880].forEach((f, i) =>
      setTimeout(() => this.playSynth(f, "square", 0.2, 0.1), i * 100),
    );
  }
  playLose() {
    this.playSynth(100, "sawtooth", 0.5, 0.2);
  }
}

class CyberPoker {
  constructor() {
    this.symbols = ["💾", "🔋", "🖧", "⚡", "👁️", "💀"];
    this.state = "BETTING"; // BETTING, DEALT, RESOLVING
    this.credits = 100;
    this.bet = 5;
    this.playerCards = [];
    this.dealerCards = [];
    this.playerHolds = [false, false, false, false, false];
    this.audio = new AudioEngine();

    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    document
      .getElementById("btn-plus")
      .addEventListener("click", () => this.adjustBet(5));
    document
      .getElementById("btn-minus")
      .addEventListener("click", () => this.adjustBet(-5));
    document.getElementById("btn-action").addEventListener("click", () => {
      this.audio.init();
      if (this.state === "BETTING") this.dealInitial();
      else if (this.state === "DEALT") this.drawPhase();
      else if (this.state === "RESOLVING") this.resetRound();
    });
  }

  adjustBet(amount) {
    if (this.state !== "BETTING") return;
    this.bet = Math.max(5, Math.min(this.credits, this.bet + amount));
    document.getElementById("current-bet").textContent = this.bet;
    this.audio.playHold();
  }

  getRandomCard() {
    return Math.floor(Math.random() * this.symbols.length);
  }

  createCardElement(isPlayer, index) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
            <div class="card-inner">
                <div class="card-back"></div>
                <div class="card-front"></div>
            </div>
        `;
    if (isPlayer) {
      card.addEventListener("click", () => this.toggleHold(index, card));
    }
    return card;
  }

  async dealInitial() {
    if (this.credits < this.bet) return;
    this.credits -= this.bet;
    this.state = "DEALT";
    this.playerHolds.fill(false);
    this.updateUI();

    const pContainer = document.getElementById("player-cards");
    const dContainer = document.getElementById("dealer-cards");
    pContainer.innerHTML = "";
    dContainer.innerHTML = "";

    this.playerCards = [];
    this.dealerCards = [];

    for (let i = 0; i < 5; i++) {
      this.playerCards.push(this.getRandomCard());
      this.dealerCards.push(this.getRandomCard());

      const pCard = this.createCardElement(true, i);
      const dCard = this.createCardElement(false, i);

      pCard.querySelector(".card-front").textContent =
        this.symbols[this.playerCards[i]];
      dCard.querySelector(".card-front").textContent =
        this.symbols[this.dealerCards[i]];

      pContainer.appendChild(pCard);
      dContainer.appendChild(dCard);

      await this.sleep(100);
      pCard.classList.add("flipped");
      this.audio.playDeal();
    }

    document.getElementById("message").textContent =
      "SÉLECTIONNEZ LES CARTES À GARDER";
    document.getElementById("btn-action").textContent = "TIRER";
  }

  toggleHold(index, cardElement) {
    if (this.state !== "DEALT") return;
    this.playerHolds[index] = !this.playerHolds[index];
    cardElement.classList.toggle("held", this.playerHolds[index]);
    this.audio.playHold();
  }

  async drawPhase() {
    this.state = "RESOLVING";
    document.getElementById("btn-action").disabled = true;

    // Tirage Joueur
    const pCardsEl = document.getElementById("player-cards").children;
    for (let i = 0; i < 5; i++) {
      if (!this.playerHolds[i]) {
        pCardsEl[i].classList.remove("flipped");
        await this.sleep(150);
        this.playerCards[i] = this.getRandomCard();
        pCardsEl[i].querySelector(".card-front").textContent =
          this.symbols[this.playerCards[i]];
        pCardsEl[i].classList.add("flipped");
        this.audio.playDeal();
      }
      pCardsEl[i].classList.remove("held");
    }

    await this.sleep(500);

    // IA du Croupier : Évaluation et Tirage
    const dealerHolds = this.getDealerLogic(this.dealerCards);
    const dCardsEl = document.getElementById("dealer-cards").children;

    for (let i = 0; i < 5; i++) {
      if (!dealerHolds.includes(i)) {
        this.dealerCards[i] = this.getRandomCard();
        dCardsEl[i].querySelector(".card-front").textContent =
          this.symbols[this.dealerCards[i]];
      }
      dCardsEl[i].classList.add("flipped");
      await this.sleep(150);
      this.audio.playDeal();
    }

    this.resolveGame();
  }

  evaluateHand(hand) {
    const counts = {};
    hand.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    let pairs = 0,
      threes = 0,
      fours = 0,
      fives = 0;
    let pairVals = [],
      maxSym = Math.max(...hand);

    for (const [val, count] of Object.entries(counts)) {
      const v = parseInt(val);
      if (count === 2) {
        pairs++;
        pairVals.push(v);
      }
      if (count === 3) threes++;
      if (count === 4) fours++;
      if (count === 5) fives++;
    }

    pairVals.sort((a, b) => b - a);

    if (fives) return { rank: 6, val: maxSym, name: "5 IDENTIQUES", mult: 16 };
    if (fours) return { rank: 5, val: maxSym, name: "CARRÉ", mult: 8 };
    if (threes && pairs)
      return { rank: 4, val: maxSym, name: "FULL HOUSE", mult: 6 };
    if (threes) return { rank: 3, val: maxSym, name: "BRELAN", mult: 4 };
    if (pairs === 2)
      return { rank: 2, val: pairVals[0], name: "DOUBLE PAIRE", mult: 3 };
    if (pairs === 1)
      return { rank: 1, val: pairVals[0], name: "PAIRE", mult: 2 };
    return { rank: 0, val: maxSym, name: "CARTE HAUTE", mult: 0 };
  }

  getDealerLogic(hand) {
    // IA Basique : Garde la combinaison la plus fréquente, sinon la carte la plus forte
    const counts = {};
    hand.forEach((v, i) => {
      if (!counts[v]) counts[v] = [];
      counts[v].push(i);
    });
    let bestHold = [],
      maxCount = 0;

    for (const indices of Object.values(counts)) {
      if (indices.length > maxCount) {
        maxCount = indices.length;
        bestHold = indices;
      }
    }
    if (maxCount === 1) return [hand.indexOf(Math.max(...hand))];
    return bestHold;
  }

  resolveGame() {
    const pHand = this.evaluateHand(this.playerCards);
    const dHand = this.evaluateHand(this.dealerCards);
    const msgEl = document.getElementById("message");

    let playerWins = false;
    if (pHand.rank > dHand.rank) playerWins = true;
    else if (pHand.rank === dHand.rank && pHand.val > dHand.val)
      playerWins = true;

    if (playerWins && pHand.rank > 0) {
      const winAmount = this.bet * pHand.mult;
      this.credits += winAmount;
      msgEl.textContent = `VICTOIRE ! ${pHand.name} (+${winAmount})`;
      msgEl.className = "neon-gold";
      this.audio.playWin();

      // Highlight table
      document
        .querySelectorAll("#multipliers li")
        .forEach((li) => li.classList.remove("active"));
      const row = document.querySelector(`li[data-rank="${pHand.rank}"]`);
      if (row) row.classList.add("active");
    } else {
      msgEl.textContent = playerWins
        ? "ÉGALITÉ (Remboursé)"
        : `DÉFAITE (${dHand.name} l'emporte)`;
      msgEl.className = "neon-red";
      if (playerWins)
        this.credits += this.bet; // Remboursement sur égalité 'Carte Haute'
      else this.audio.playLose();
    }

    document.getElementById("btn-action").textContent = "NOUVELLE MANCHE";
    document.getElementById("btn-action").disabled = false;
    this.updateUI();
  }

  resetRound() {
    this.state = "BETTING";
    document.getElementById("message").textContent = "Placez votre mise";
    document.getElementById("message").className = "neon-white";
    document.getElementById("btn-action").textContent = "DISTRIBUER";
    document
      .querySelectorAll("#multipliers li")
      .forEach((li) => li.classList.remove("active"));

    if (this.bet > this.credits) this.bet = Math.max(5, this.credits);

    const pContainer = document.getElementById("player-cards");
    const dContainer = document.getElementById("dealer-cards");
    Array.from(pContainer.children).forEach((c) =>
      c.classList.remove("flipped"),
    );
    Array.from(dContainer.children).forEach((c) =>
      c.classList.remove("flipped"),
    );

    this.updateUI();
  }

  updateUI() {
    document.getElementById("credits").textContent = this.credits;
    document.getElementById("current-bet").textContent = this.bet;
    const betBtns = [
      document.getElementById("btn-minus"),
      document.getElementById("btn-plus"),
    ];
    betBtns.forEach((b) => (b.disabled = this.state !== "BETTING"));
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

document.addEventListener("DOMContentLoaded", () => new CyberPoker());
