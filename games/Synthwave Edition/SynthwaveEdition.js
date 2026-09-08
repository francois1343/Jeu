document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. CONFIGURATION ET VARIABLES GLOBALES
    // ==========================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI Elements
    const mainMenu = document.getElementById('main-menu');
    const scoreboard = document.getElementById('scoreboard');
    const gameOverScreen = document.getElementById('game-over');
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');
    const btnMenu = document.getElementById('btn-menu');
    const pauseMenu = document.getElementById('pause-menu');
    const settingsMenu = document.getElementById('settings-menu');
    const soundSetting = document.getElementById('setting-sound');
    const shakeSetting = document.getElementById('setting-shake');
    
    // Game State
    let gameState = 'MENU'; // MENU, PLAYING, PAUSED, GAMEOVER
    let mode = '1P'; // 1P ou 2P
    let aiDifficulty = 'medium'; // easy, medium, hard
    let targetScore = 3;
    let score = { p1: 0, p2: 0 };
    
    // Physics & Engine
    let screenShake = 0;
    let particles = [];
    
    // Audio Context (initialisé au premier clic utilisateur)
    let audioCtx = null;

    // Dimensions virtuelles du terrain de jeu (Ratio 1:1.6)
    const GAME_WIDTH = 500;
    const GAME_HEIGHT = 800;
    let scale = 1;
    let settingsReturnState = 'MENU';

    const themes = {
        neon: { cyan: '#00f3ff', magenta: '#ff00ff', background: '#0a0a16', grid: 'rgba(0, 243, 255, 0.16)' },
        sunset: { cyan: '#ffd166', magenta: '#ff5c8a', background: '#211024', grid: 'rgba(255, 209, 102, 0.16)' },
        matrix: { cyan: '#75ff92', magenta: '#28c76f', background: '#07140c', grid: 'rgba(117, 255, 146, 0.16)' },
        ice: { cyan: '#7dd3fc', magenta: '#c4b5fd', background: '#0b1020', grid: 'rgba(125, 211, 252, 0.16)' }
    };
    const settings = { theme: 'neon', sound: true, shake: true };

    // ==========================================
    // 2. MOTEUR AUDIO (WEB AUDIO API)
    // ==========================================
    function initAudio() {
        if (!settings.sound) return;

        if (audioCtx) {
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            audioCtx = new AudioContextClass();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
        } catch (_) {
            audioCtx = null;
        }
    }

    function playSound(type) {
        if (!settings.sound || !audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
        
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const now = audioCtx.currentTime;

        if (type === 'hit') {
            // Son d'impact sec (palet / frappeur)
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gainNode.gain.setValueAtTime(0.5, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'bounce') {
            // Rebond sur les murs
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'goal') {
            // Sirène de but (style rétro)
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.2);
            osc.frequency.linearRampToValueAtTime(300, now + 0.4);
            gainNode.gain.setValueAtTime(0.5, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
        } catch (_) {
            // L'audio ne doit jamais interrompre une partie.
        }
    }

    // ==========================================
    // 3. CLASSES DU JEU (ENTITÉS)
    // ==========================================
    class Puck {
        constructor(x, y, radius) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.vx = 0;
            this.vy = 0;
            this.friction = 0.99; // Friction minimale de l'air hockey
            this.maxSpeed = 25;
            this.color = '#fff';
            this.trail = [];
        }

        update() {
            // Applique la vélocité
            this.x += this.vx;
            this.y += this.vy;
            
            // Applique la friction
            this.vx *= this.friction;
            this.vy *= this.friction;

            // Limite de vitesse
            let speed = Math.hypot(this.vx, this.vy);
            if (speed > this.maxSpeed) {
                this.vx = (this.vx / speed) * this.maxSpeed;
                this.vy = (this.vy / speed) * this.maxSpeed;
            }

            // Enregistrement de la traînée (Trail)
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > 15) this.trail.shift();

            // Collisions avec les murs gauche/droite
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vx *= -1;
                playSound('bounce');
            } else if (this.x + this.radius > GAME_WIDTH) {
                this.x = GAME_WIDTH - this.radius;
                this.vx *= -1;
                playSound('bounce');
            }

            // Vérification des Buts (Haut / Bas)
            const goalWidth = 150;
            const goalLeft = (GAME_WIDTH - goalWidth) / 2;
            const goalRight = goalLeft + goalWidth;

            if (this.y - this.radius < 0) {
                if (this.x > goalLeft && this.x < goalRight) {
                    handleGoal('p1'); // But pour le Joueur 1 (en bas)
                } else {
                    this.y = this.radius;
                    this.vy *= -1;
                    playSound('bounce');
                }
            } else if (this.y + this.radius > GAME_HEIGHT) {
                if (this.x > goalLeft && this.x < goalRight) {
                    handleGoal('p2'); // But pour le Joueur 2 (en haut)
                } else {
                    this.y = GAME_HEIGHT - this.radius;
                    this.vy *= -1;
                    playSound('bounce');
                }
            }
        }

        draw(ctx) {
            // Dessin de la traînée (Juice)
            if (Math.hypot(this.vx, this.vy) > 5) {
                ctx.beginPath();
                for (let i = 0; i < this.trail.length; i++) {
                    const point = this.trail[i];
                    ctx.lineTo(point.x, point.y);
                }
                ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
                ctx.lineWidth = this.radius;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            // Dessin du palet
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.shadowBlur = 0; // Reset
        }
    }

    class Mallet {
        constructor(x, y, radius, color, isTop) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.color = color;
            this.isTop = isTop;
            this.vx = 0;
            this.vy = 0;
            this.targetX = x;
            this.targetY = y;
        }

        update() {
            // Calcul de la vélocité basée sur le mouvement vers la cible (Touch/Mouse/AI)
            this.vx = (this.targetX - this.x) * 0.3;
            this.vy = (this.targetY - this.y) * 0.3;
            
            this.x += this.vx;
            this.y += this.vy;

            // Contraintes (Ne peut pas dépasser sa moitié de terrain ni les murs)
            this.x = Math.max(this.radius, Math.min(GAME_WIDTH - this.radius, this.x));
            
            if (this.isTop) {
                this.y = Math.max(this.radius, Math.min(GAME_HEIGHT / 2 - this.radius, this.y));
            } else {
                this.y = Math.max(GAME_HEIGHT / 2 + this.radius, Math.min(GAME_HEIGHT - this.radius, this.y));
            }
        }

        draw(ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#111';
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 5;
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.stroke();
            
            // Cercle intérieur (Détail visuel)
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // ==========================================
    // 4. INSTANCES ET LOGIQUE PHYSIQUE
    // ==========================================
    const puck = new Puck(GAME_WIDTH / 2, GAME_HEIGHT / 2, 15);
    const p1 = new Mallet(GAME_WIDTH / 2, GAME_HEIGHT - 100, 30, '#ff00ff', false); // Magenta (Bas)
    const p2 = new Mallet(GAME_WIDTH / 2, 100, 30, '#00f3ff', true); // Cyan (Haut)

    function checkCollision(mallet, puck) {
        let dx = puck.x - mallet.x;
        let dy = puck.y - mallet.y;
        let distance = Math.hypot(dx, dy);
        
        if (distance < puck.radius + mallet.radius) {
            playSound('hit');
            
            // Haptic Feedback (Vibration API)
            if (navigator.vibrate) {
                navigator.vibrate(15);
            }

            // Résolution de collision
            let angle = Math.atan2(dy, dx);
            let overlap = (puck.radius + mallet.radius) - distance;
            
            // Repousse le palet en dehors du frappeur
            puck.x += Math.cos(angle) * overlap;
            puck.y += Math.sin(angle) * overlap;

            // Transfert de force & rebond
            let force = Math.max(10, Math.hypot(mallet.vx, mallet.vy) * 1.2);
            puck.vx = Math.cos(angle) * force;
            puck.vy = Math.sin(angle) * force;

            createParticles(puck.x, puck.y, mallet.color, 5);
        }
    }

    // ==========================================
    // 5. SYSTÈME DE PARTICULES & JUIcE
    // ==========================================
    function createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1,
                color: color
            });
        }
    }

    function updateAndDrawParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
            
            if (p.life <= 0) {
                particles.splice(i, 1);
            } else {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    // ==========================================
    // 6. LOGIQUE DE JEU (BUTS & IA)
    // ==========================================
    function handleGoal(scorer) {
        if (gameState !== 'PLAYING') return;

        playSound('goal');
        if (settings.shake) screenShake = 20;
        
        if (scorer === 'p1') {
            score.p1++;
            document.getElementById('score-p1').innerText = score.p1;
            createParticles(GAME_WIDTH/2, 0, '#ff00ff', 30);
            resetPuck('p1');
        } else {
            score.p2++;
            document.getElementById('score-p2').innerText = score.p2;
            createParticles(GAME_WIDTH/2, GAME_HEIGHT, '#00f3ff', 30);
            resetPuck('p2');
        }

        if (score.p1 >= targetScore || score.p2 >= targetScore) {
            endGame(scorer);
        }
    }

    function resetPuck(scorer) {
        puck.x = GAME_WIDTH / 2;
        puck.y = GAME_HEIGHT / 2;
        puck.vx = 0;
        puck.vy = 0;
        puck.trail = [];
        // Donne un léger avantage à celui qui vient d'encaisser le but
        puck.vy = scorer === 'p1' ? 3 : -3;
    }

    function updateAI() {
        if (mode !== '1P') return;
        
        // Logique IA simple
        let speedMult = aiDifficulty === 'hard' ? 0.2 : (aiDifficulty === 'medium' ? 0.1 : 0.05);
        let destX = puck.x;
        
        // L'IA ne réagit que si le palet vient vers elle ou est dans sa zone
        if (puck.vy < 0 || puck.y < GAME_HEIGHT / 2) {
            p2.targetX += (destX - p2.targetX) * speedMult;
            // Essaye de se placer derrière le palet pour le frapper
            let destY = puck.y < GAME_HEIGHT / 3 ? puck.y - 20 : 100;
            p2.targetY += (destY - p2.targetY) * speedMult;
        } else {
            // Retour à la position par défaut
            p2.targetX += (GAME_WIDTH / 2 - p2.targetX) * 0.05;
            p2.targetY += (100 - p2.targetY) * 0.05;
        }
    }

    // ==========================================
    // 7. GESTION DES CONTRÔLES (TOUCH & MOUSE)
    // ==========================================
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        // Gère les événements Mouse ou Touch (prend le premier touch si multi)
        let clientX = e.clientX;
        let clientY = e.clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale
        };
    }

    // Gestion Mutli-touch pour le mode 2 Joueurs Local
    canvas.addEventListener('touchstart', handleTouches, { passive: false });
    canvas.addEventListener('touchmove', handleTouches, { passive: false });
    
    function handleTouches(e) {
        if (gameState !== 'PLAYING') return;
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        
        for (let i = 0; i < e.touches.length; i++) {
            let touchX = (e.touches[i].clientX - rect.left) / scale;
            let touchY = (e.touches[i].clientY - rect.top) / scale;
            
            // Attribue le touch au frappeur correspondant (Haut ou Bas)
            if (touchY > GAME_HEIGHT / 2) {
                p1.targetX = touchX;
                p1.targetY = touchY;
            } else if (mode === '2P' && touchY < GAME_HEIGHT / 2) {
                p2.targetX = touchX;
                p2.targetY = touchY;
            }
        }
    }

    // Contrôle à la souris pour le joueur du bas.
    canvas.addEventListener('mousemove', (event) => {
        if (gameState !== 'PLAYING') return;

        const pointer = getPointerPos(event);
        p1.targetX = pointer.x;
        p1.targetY = pointer.y;
    });

    // ==========================================
    // 8. INTERFACE, RENDU ET BOUCLE PRINCIPALE
    // ==========================================
    function resizeCanvas() {
        scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
        canvas.width = GAME_WIDTH;
        canvas.height = GAME_HEIGHT;
        canvas.style.width = `${GAME_WIDTH * scale}px`;
        canvas.style.height = `${GAME_HEIGHT * scale}px`;
    }

    function drawArena() {
        const theme = themes[settings.theme];
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1;
        for (let x = 0; x <= GAME_WIDTH; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, GAME_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y <= GAME_HEIGHT; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(GAME_WIDTH, y);
            ctx.stroke();
        }

        ctx.strokeStyle = theme.cyan;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = theme.cyan;
        ctx.beginPath();
        ctx.moveTo(0, GAME_HEIGHT / 2);
        ctx.lineTo(GAME_WIDTH, GAME_HEIGHT / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(GAME_WIDTH / 2, GAME_HEIGHT / 2, 75, 0, Math.PI * 2);
        ctx.stroke();

        const goalWidth = 150;
        const goalLeft = (GAME_WIDTH - goalWidth) / 2;
        ctx.strokeStyle = theme.magenta;
        ctx.beginPath();
        ctx.moveTo(goalLeft, 0);
        ctx.lineTo(goalLeft + goalWidth, 0);
        ctx.moveTo(goalLeft, GAME_HEIGHT);
        ctx.lineTo(goalLeft + goalWidth, GAME_HEIGHT);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    function update() {
        if (gameState !== 'PLAYING') return;

        updateAI();
        p1.update();
        p2.update();
        puck.update();
        checkCollision(p1, puck);
        checkCollision(p2, puck);
    }

    function draw() {
        ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.save();
        if (screenShake > 0) {
            ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
            screenShake *= 0.88;
            if (screenShake < 0.5) screenShake = 0;
        }

        drawArena();
        puck.draw(ctx);
        p1.draw(ctx);
        p2.draw(ctx);
        updateAndDrawParticles();
        ctx.restore();
    }

    function resetGame() {
        score = { p1: 0, p2: 0 };
        particles = [];
        document.getElementById('score-p1').textContent = '0';
        document.getElementById('score-p2').textContent = '0';
        p1.x = p1.targetX = GAME_WIDTH / 2;
        p1.y = p1.targetY = GAME_HEIGHT - 100;
        p2.x = p2.targetX = GAME_WIDTH / 2;
        p2.y = p2.targetY = 100;
        resetPuck('p2');
    }

    function startGame() {
        initAudio();
        resetGame();
        gameState = 'PLAYING';
        mainMenu.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        pauseMenu.classList.add('hidden');
        settingsMenu.classList.add('hidden');
        scoreboard.classList.remove('hidden');
    }

    function pauseGame() {
        if (gameState !== 'PLAYING') return;

        gameState = 'PAUSED';
        pauseMenu.classList.remove('hidden');
    }

    function resumeGame() {
        if (gameState !== 'PAUSED') return;

        gameState = 'PLAYING';
        pauseMenu.classList.add('hidden');
        initAudio();
    }

    function saveSettings() {
        try {
            localStorage.setItem('synthwave-air-hockey-settings', JSON.stringify(settings));
        } catch (_) {
            // Le jeu reste utilisable si le stockage local est indisponible.
        }
    }

    function applyTheme(themeName) {
        if (!themes[themeName]) return;

        settings.theme = themeName;
        document.documentElement.dataset.theme = themeName;
        p1.color = themes[themeName].magenta;
        p2.color = themes[themeName].cyan;
        document.querySelectorAll('.theme-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.theme === themeName);
        });
        saveSettings();
    }

    function loadSettings() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem('synthwave-air-hockey-settings'));
            if (savedSettings && themes[savedSettings.theme]) settings.theme = savedSettings.theme;
            if (savedSettings && typeof savedSettings.sound === 'boolean') settings.sound = savedSettings.sound;
            if (savedSettings && typeof savedSettings.shake === 'boolean') settings.shake = savedSettings.shake;
        } catch (_) {
            // Les réglages par défaut sont conservés si une ancienne valeur est invalide.
        }

        soundSetting.checked = settings.sound;
        shakeSetting.checked = settings.shake;
        applyTheme(settings.theme);
    }

    function openSettings() {
        settingsReturnState = gameState;
        if (gameState === 'PLAYING') pauseGame();

        mainMenu.classList.add('hidden');
        pauseMenu.classList.add('hidden');
        settingsMenu.classList.remove('hidden');
    }

    function closeSettings() {
        settingsMenu.classList.add('hidden');
        if (settingsReturnState === 'MENU') {
            mainMenu.classList.remove('hidden');
        } else {
            pauseMenu.classList.remove('hidden');
        }
    }

    function endGame(winner) {
        gameState = 'GAMEOVER';
        scoreboard.classList.add('hidden');
        document.getElementById('winner-text').textContent = mode === '1P'
            ? (winner === 'p1' ? 'VICTOIRE !' : 'L’IA GAGNE !')
            : `JOUEUR ${winner === 'p1' ? '1' : '2'} GAGNE !`;
        gameOverScreen.classList.remove('hidden');
    }

    function showMenu() {
        gameState = 'MENU';
        screenShake = 0;
        scoreboard.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        pauseMenu.classList.add('hidden');
        settingsMenu.classList.add('hidden');
        mainMenu.classList.remove('hidden');
    }

    document.getElementById('mode-1p').addEventListener('click', () => {
        mode = '1P';
        document.getElementById('mode-1p').classList.add('active');
        document.getElementById('mode-2p').classList.remove('active');
        document.getElementById('difficulty-section').classList.remove('hidden');
    });

    document.getElementById('mode-2p').addEventListener('click', () => {
        mode = '2P';
        document.getElementById('mode-2p').classList.add('active');
        document.getElementById('mode-1p').classList.remove('active');
        document.getElementById('difficulty-section').classList.add('hidden');
    });

    document.querySelectorAll('.diff-btn').forEach((button) => {
        button.addEventListener('click', () => {
            aiDifficulty = button.dataset.level;
            document.querySelectorAll('.diff-btn').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
        });
    });

    document.querySelectorAll('.score-btn').forEach((button) => {
        button.addEventListener('click', () => {
            targetScore = Number(button.dataset.score);
            document.querySelectorAll('.score-btn').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
        });
    });

    document.querySelectorAll('.theme-btn').forEach((button) => {
        button.addEventListener('click', () => applyTheme(button.dataset.theme));
    });

    soundSetting.addEventListener('change', () => {
        settings.sound = soundSetting.checked;
        if (settings.sound) initAudio();
        saveSettings();
    });

    shakeSetting.addEventListener('change', () => {
        settings.shake = shakeSetting.checked;
        if (!settings.shake) screenShake = 0;
        saveSettings();
    });

    btnStart.addEventListener('click', startGame);
    btnRestart.addEventListener('click', startGame);
    btnMenu.addEventListener('click', showMenu);
    document.getElementById('btn-pause').addEventListener('click', pauseGame);
    document.getElementById('btn-resume').addEventListener('click', resumeGame);
    document.getElementById('btn-quit-game').addEventListener('click', showMenu);
    document.getElementById('btn-settings-menu').addEventListener('click', openSettings);
    document.getElementById('btn-settings-game').addEventListener('click', openSettings);
    document.getElementById('btn-settings-pause').addEventListener('click', openSettings);
    document.getElementById('btn-settings-close').addEventListener('click', closeSettings);
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', (event) => {
        if (event.repeat || (event.key !== 'Escape' && event.key.toLowerCase() !== 'p')) return;

        if (!settingsMenu.classList.contains('hidden')) {
            event.preventDefault();
            closeSettings();
        } else if (gameState === 'PLAYING') {
            event.preventDefault();
            pauseGame();
        } else if (gameState === 'PAUSED') {
            event.preventDefault();
            resumeGame();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseGame();
    });

    function gameLoop() {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }

    loadSettings();
    resizeCanvas();
    gameLoop();
});
