      // ===== GÃ‰NÃ‰RATION DES PARTICULES =====
      function createParticles() {
        const container = document.getElementById("particles");
        const colors = ["#00ffff", "#ff00ff", "#00ff88", "#ffff00", "#4d7cff"];

        for (let i = 0; i < 20; i++) {
          const particle = document.createElement("div");
          particle.className = "particle";
          particle.style.left = Math.random() * 100 + "%";
          particle.style.animationDelay = Math.random() * 15 + "s";
          particle.style.animationDuration = 10 + Math.random() * 10 + "s";
          particle.style.background =
            colors[Math.floor(Math.random() * colors.length)];
          container.appendChild(particle);
        }
      }
      createParticles();

      // ===== PILE OU FACE =====
      function playCoin(event) {
        event.stopPropagation();
        const display = document.getElementById("coinDisplay");
        display.classList.add("flipping");

        // Son de flip (optionnel)
        playSound(800, 0.1);

        setTimeout(() => {
          const result = Math.random() < 0.5 ? "P" : "F";
          display.textContent = result;
          display.classList.remove("flipping");

          // Son de rÃ©sultat
          playSound(result === "P" ? 600 : 400, 0.15);
        }, 600);
      }

      // ===== DÃ‰ PERSONNALISABLE =====
      function rollDice(event) {
        event.stopPropagation();
        const faces = parseInt(document.getElementById("diceFaces").value) || 6;
        const display = document.getElementById("diceDisplay");

        display.classList.add("rolling");
        playSound(500, 0.1);

        // Animation de chiffres alÃ©atoires
        let rolls = 0;
        const maxRolls = 10;
        const interval = setInterval(() => {
          display.textContent = Math.floor(Math.random() * faces) + 1;
          rolls++;

          if (rolls >= maxRolls) {
            clearInterval(interval);
            const result = Math.floor(Math.random() * faces) + 1;
            display.textContent = result;
            display.classList.remove("rolling");
            playSound(700, 0.15);
          }
        }, 50);
      }

      // ===== LANCEMENT DES JEUX =====
      function launchGame(url, event) {
        event.stopPropagation();
        playSound(900, 0.1);

        // Animation de transition
        document.body.style.opacity = "0";
        document.body.style.transition = "opacity 0.3s ease";

        setTimeout(() => {
          window.location.href = url;
        }, 300);
      }

      // ===== FOCUS SUR CARTE =====
      function focusCard(card) {
        // Effet visuel subtil au clic
        card.style.transform = "scale(0.98)";
        setTimeout(() => {
          card.style.transform = "";
        }, 150);
      }

      // ===== SYSTÃˆME AUDIO SIMPLE =====
      let audioContext = null;

      function playSound(frequency, duration) {
        try {
          if (!audioContext) {
            audioContext = new (
              window.AudioContext || window.webkitAudioContext
            )();
          }

          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.frequency.value = frequency;
          oscillator.type = "sine";

          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + duration,
          );

          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
          // Audio non supportÃ©, on continue silencieusement
        }
      }

      // ===== INITIALISATION =====
      document.addEventListener("DOMContentLoaded", () => {
        // Activation du contexte audio au premier clic
        document.body.addEventListener(
          "click",
          () => {
            if (!audioContext) {
              audioContext = new (
                window.AudioContext || window.webkitAudioContext
              )();
            }
          },
          { once: true },
        );
      });

      // ===== EMPÃŠCHER LE SCROLL HORIZONTAL =====
      document.body.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches.length > 1) {
            e.preventDefault();
          }
        },
        { passive: false },
      );

