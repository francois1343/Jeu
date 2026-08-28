/**
 * PUISSANCE 4 ADVANCE — RETRO EDITION
 * Classic 7×6 and spatial 4×4×4 game engine.
 */

document.addEventListener("DOMContentLoaded", () => {
  const createBoard2D = () =>
    Array.from({ length: 6 }, () => Array(7).fill(0));
  const createBoard3D = () =>
    Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => Array(4).fill(0)),
    );

  function loadStats() {
    try {
      const saved = JSON.parse(localStorage.getItem("p4_neon_stats"));
      if (
        saved &&
        Number.isFinite(saved.red) &&
        Number.isFinite(saved.yellow)
      ) {
        return saved;
      }
    } catch (error) {
      console.warn("Les scores enregistrés n'ont pas pu être lus.", error);
    }
    return { red: 0, yellow: 0 };
  }

  const STATE = {
    mode: "2d",
    opponent: "pvp",
    difficulty: "easy",
    currentPlayer: 1,
    isGameOver: false,
    isAnimating: false,
    history: [],
    board2D: createBoard2D(),
    board3D: createBoard3D(),
    disksLeft: { 1: 32, 2: 32 },
    stats: loadStats(),
  };

  const DOM = {
    menuScreen: document.getElementById("menu-screen"),
    gameScreen: document.getElementById("game-screen"),
    view2D: document.getElementById("view-2d"),
    view3D: document.getElementById("view-3d"),
    board2DGrid: document.getElementById("grid-2d"),
    colTriggers: document.getElementById("columns-trigger-container"),
    canvas3DContainer: document.getElementById("canvas-3d-container"),
    playerBadge: document.getElementById("current-player-badge"),
    playerColorText: document.getElementById("player-color-text"),
    redPlayerCard: document.getElementById("player-card-red"),
    yellowPlayerCard: document.getElementById("player-card-yellow"),
    statRed: document.getElementById("stat-red"),
    statYellow: document.getElementById("stat-yellow"),
    gameScoreRed: document.getElementById("game-score-red"),
    gameScoreYellow: document.getElementById("game-score-yellow"),
    countRed: document.getElementById("count-red"),
    countYellow: document.getElementById("count-yellow"),
    remainingDisksBar: document.getElementById("remaining-disks"),
    modeKicker: document.getElementById("mode-kicker"),
    modeInstruction: document.getElementById("mode-instruction"),
    gameOverModal: document.getElementById("game-over-modal"),
    winnerTitle: document.getElementById("winner-title"),
    winnerSubtext: document.getElementById("winner-subtext"),
    confettiLayer: document.getElementById("confetti-layer"),
    aiGroup: document.getElementById("ai-difficulty-group"),
  };

  const WINNING_LINES_3D = (() => {
    const lines = [];
    const valid = (coordinate) => coordinate >= 0 && coordinate < 4;
    const directions = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, -1, 0],
      [1, 0, 1],
      [1, 0, -1],
      [0, 1, 1],
      [0, 1, -1],
      [1, 1, 1],
      [1, 1, -1],
      [1, -1, 1],
      [1, -1, -1],
    ];

    directions.forEach(([dx, dy, dz]) => {
      for (let x = 0; x < 4; x += 1) {
        for (let y = 0; y < 4; y += 1) {
          for (let z = 0; z < 4; z += 1) {
            const endX = x + 3 * dx;
            const endY = y + 3 * dy;
            const endZ = z + 3 * dz;
            if (!valid(endX) || !valid(endY) || !valid(endZ)) continue;

            lines.push(
              Array.from({ length: 4 }, (_, index) => [
                x + index * dx,
                y + index * dy,
                z + index * dz,
              ]),
            );
          }
        }
      }
    });

    return lines;
  })();

  let aiTimer = null;
  let modalTimer = null;

  const AudioEngine = {
    context: null,
    init() {
      try {
        if (!this.context) {
          this.context = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.context.state === "suspended") this.context.resume();
      } catch (error) {
        this.context = null;
      }
    },
    tone(frequency, duration, type = "square", volume = 0.12, delay = 0) {
      if (!this.context) return;
      const now = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    },
    playSelect() {
      this.tone(420, 0.06, "square", 0.045);
    },
    playDrop() {
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(360, now);
      oscillator.frequency.exponentialRampToValueAtTime(95, now + 0.1);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.11);
      this.tone(105, 0.07, "triangle", 0.08, 0.075);
    },
    playWin() {
      [261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, index) => {
        this.tone(frequency, 0.28, "square", 0.1, index * 0.08);
      });
    },
  };

  function triggerVibration(duration = 24) {
    if (navigator.vibrate) navigator.vibrate(duration);
  }

  function updateStatsUI() {
    DOM.statRed.textContent = STATE.stats.red;
    DOM.statYellow.textContent = STATE.stats.yellow;
    DOM.gameScoreRed.textContent = STATE.stats.red;
    DOM.gameScoreYellow.textContent = STATE.stats.yellow;
  }

  function updateDisksUI() {
    DOM.countRed.textContent = STATE.disksLeft[1];
    DOM.countYellow.textContent = STATE.disksLeft[2];
  }

  function updateCurrentPlayerUI() {
    const isRed = STATE.currentPlayer === 1;
    DOM.playerBadge.className = `player-badge ${isRed ? "red" : "yellow"}`;
    DOM.playerColorText.textContent = isRed ? "ROUGE" : "JAUNE";
    DOM.redPlayerCard.classList.toggle("active", isRed);
    DOM.yellowPlayerCard.classList.toggle("active", !isRed);
  }

  function updateModeCopy() {
    const is3D = STATE.mode === "3d";
    DOM.modeKicker.textContent = is3D ? "MODE ADVANCE 3D" : "MODE CLASSIQUE";
    DOM.modeInstruction.textContent = is3D
      ? "Choisis une tige et construis dans l’espace."
      : "Choisis une colonne et lâche ton jeton.";
  }

  updateStatsUI();
  updateDisksUI();

  // ---------------------------------------------------------------------------
  // Three.js board
  // ---------------------------------------------------------------------------
  let scene;
  let camera;
  let renderer;
  let controls;
  let raycaster;
  let pointer;
  let threeFrameId;
  let threeActive = false;
  let rodMeshes = [];
  let rodHitTargets = [];
  let diskMeshes3D = [];
  let hoveredRod = null;
  let pointerOrigin = null;

  const ROD_SPACING = 1.86;
  const ROD_HEIGHT = 3.1;
  const DISK_RADIUS = 0.72;
  const DISK_HEIGHT = 0.48;
  const BASE_TOP = 0.72;

  function createWoodTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, "#efba72");
    gradient.addColorStop(0.45, "#c97f3f");
    gradient.addColorStop(1, "#9a512e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);

    context.globalAlpha = 0.18;
    for (let y = 12; y < 512; y += 15) {
      context.beginPath();
      context.strokeStyle = y % 30 === 0 ? "#6f321f" : "#fff0bd";
      context.lineWidth = y % 30 === 0 ? 2.2 : 1;
      for (let x = 0; x <= 512; x += 8) {
        const wave = Math.sin(x * 0.026 + y * 0.08) * 5;
        if (x === 0) context.moveTo(x, y + wave);
        else context.lineTo(x, y + wave);
      }
      context.stroke();
    }

    [[115, 120], [392, 330], [270, 58]].forEach(([x, y], index) => {
      context.beginPath();
      context.ellipse(x, y, 28 + index * 4, 8 + index, -0.18, 0, Math.PI * 2);
      context.strokeStyle = "#713721";
      context.lineWidth = 3;
      context.stroke();
    });

    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.4, 1.4);
    texture.anisotropy = renderer?.capabilities.getMaxAnisotropy?.() || 1;
    return texture;
  }

  function createRoundedRectangleShape(width, depth, radius) {
    const x = -width / 2;
    const y = -depth / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + depth - radius);
    shape.quadraticCurveTo(
      x + width,
      y + depth,
      x + width - radius,
      y + depth,
    );
    shape.lineTo(x + radius, y + depth);
    shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
  }

  function createRingGeometry() {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, DISK_RADIUS, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.19, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const depth = DISK_HEIGHT - 0.12;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06,
      curveSegments: 32,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  function disposeThreeScene() {
    threeActive = false;
    if (threeFrameId) cancelAnimationFrame(threeFrameId);
    threeFrameId = null;

    if (renderer?.domElement) {
      renderer.domElement.removeEventListener("pointerdown", onCanvasPointerDown);
      renderer.domElement.removeEventListener("pointermove", onCanvasPointerMove);
      renderer.domElement.removeEventListener("pointerup", onCanvasPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onCanvasPointerLeave);
    }

    if (scene) {
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
    }

    controls?.dispose?.();
    renderer?.dispose?.();
    DOM.canvas3DContainer.innerHTML = "";
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    rodMeshes = [];
    rodHitTargets = [];
    diskMeshes3D = [];
    hoveredRod = null;
  }

  function initThreeJS() {
    disposeThreeScene();

    if (typeof THREE === "undefined") {
      DOM.canvas3DContainer.innerHTML =
        '<p class="three-error">Le plateau 3D n’a pas pu être chargé. Vérifie ta connexion puis réessaie.</p>';
      return;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x100a35, 0.025);

    const width = Math.max(DOM.canvas3DContainer.clientWidth, 320);
    const height = Math.max(DOM.canvas3DContainer.clientHeight, 360);
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(8.6, 7.1, 10.4);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    DOM.canvas3DContainer.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 8.5;
    controls.maxDistance = 17;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.target.set(0, 1.25, 0);
    controls.update();

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    const hemisphere = new THREE.HemisphereLight(0xfff0d2, 0x231052, 1.45);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffd9a1, 2.1);
    keyLight.position.set(-5, 9, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -7;
    keyLight.shadow.camera.right = 7;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -6;
    scene.add(keyLight);

    const pinkLight = new THREE.PointLight(0xff3f8d, 2.2, 22);
    pinkLight.position.set(-7, 4, -5);
    scene.add(pinkLight);

    const cyanLight = new THREE.PointLight(0x55e9e2, 1.8, 22);
    cyanLight.position.set(7, 5, 6);
    scene.add(cyanLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7.8, 64),
      new THREE.ShadowMaterial({ color: 0x05021e, opacity: 0.46 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.22;
    floor.receiveShadow = true;
    scene.add(floor);

    const woodTexture = createWoodTexture();
    const baseGeometry = new THREE.ExtrudeGeometry(
      createRoundedRectangleShape(8.5, 8.5, 0.55),
      {
        depth: 0.7,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.15,
        bevelThickness: 0.14,
      },
    );
    const baseMaterial = new THREE.MeshStandardMaterial({
      map: woodTexture,
      color: 0xffffff,
      roughness: 0.58,
      metalness: 0.03,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.y = BASE_TOP;
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);

    const lowerTrim = new THREE.Mesh(
      new THREE.BoxGeometry(7.9, 0.18, 7.9),
      new THREE.MeshStandardMaterial({ color: 0x66301f, roughness: 0.72 }),
    );
    lowerTrim.position.y = 0.03;
    lowerTrim.castShadow = true;
    scene.add(lowerTrim);

    const offset = (3 * ROD_SPACING) / 2;
    rodMeshes = Array.from({ length: 4 }, () => Array(4).fill(null));
    const rodGeometry = new THREE.CylinderGeometry(0.105, 0.12, ROD_HEIGHT, 20);
    const rodMaterial = new THREE.MeshStandardMaterial({
      color: 0xf1d5a8,
      roughness: 0.28,
      metalness: 0.26,
      emissive: 0x331b12,
      emissiveIntensity: 0.05,
    });
    const collarGeometry = new THREE.TorusGeometry(0.4, 0.065, 10, 30);
    const collarMaterial = new THREE.MeshStandardMaterial({
      color: 0x764025,
      roughness: 0.64,
      metalness: 0.04,
    });
    const hitGeometry = new THREE.CylinderGeometry(0.68, 0.68, 4.5, 10);
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.001,
      depthWrite: false,
    });

    for (let x = 0; x < 4; x += 1) {
      for (let z = 0; z < 4; z += 1) {
        const posX = x * ROD_SPACING - offset;
        const posZ = z * ROD_SPACING - offset;

        const collar = new THREE.Mesh(collarGeometry, collarMaterial);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(posX, BASE_TOP + 0.08, posZ);
        collar.receiveShadow = true;
        scene.add(collar);

        const rod = new THREE.Mesh(rodGeometry, rodMaterial.clone());
        rod.position.set(posX, BASE_TOP + ROD_HEIGHT / 2, posZ);
        rod.castShadow = true;
        rod.userData = { gridX: x, gridZ: z };
        scene.add(rod);
        rodMeshes[x][z] = rod;

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.145, 16, 10),
          rod.material,
        );
        cap.position.set(posX, BASE_TOP + ROD_HEIGHT, posZ);
        cap.scale.y = 0.55;
        cap.castShadow = true;
        scene.add(cap);

        const hitTarget = new THREE.Mesh(hitGeometry, hitMaterial);
        hitTarget.position.set(posX, BASE_TOP + 2.1, posZ);
        hitTarget.userData = { gridX: x, gridZ: z };
        scene.add(hitTarget);
        rodHitTargets.push(hitTarget);
      }
    }

    const cornerGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 18);
    const cornerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3c24d,
      metalness: 0.65,
      roughness: 0.24,
    });
    [[-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7], [3.7, 3.7]].forEach(
      ([x, z]) => {
        const inlay = new THREE.Mesh(cornerGeometry, cornerMaterial);
        inlay.position.set(x, BASE_TOP + 0.12, z);
        scene.add(inlay);
      },
    );

    renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);
    renderer.domElement.addEventListener("pointermove", onCanvasPointerMove);
    renderer.domElement.addEventListener("pointerup", onCanvasPointerUp);
    renderer.domElement.addEventListener("pointerleave", onCanvasPointerLeave);

    threeActive = true;
    animate3D();
  }

  function animate3D(time = 0) {
    if (!threeActive || !renderer || !scene || !camera) return;
    threeFrameId = requestAnimationFrame(animate3D);
    controls.update();
    diskMeshes3D.forEach((disk) => {
      if (disk.userData.winning) {
        const pulse = 1 + Math.sin(time * 0.009) * 0.06;
        disk.scale.setScalar(pulse);
      }
    });
    renderer.render(scene, camera);
  }

  function getRodAtPointer(event) {
    if (!renderer || !camera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(rodHitTargets, false)[0]?.object || null;
  }

  function setHoveredRod(target) {
    if (hoveredRod === target) return;
    if (hoveredRod) {
      hoveredRod.material.emissive.setHex(0x331b12);
      hoveredRod.material.emissiveIntensity = 0.05;
    }
    hoveredRod = target;
    if (hoveredRod) {
      hoveredRod.material.emissive.setHex(0x55e9e2);
      hoveredRod.material.emissiveIntensity = 0.48;
    }
  }

  function onCanvasPointerDown(event) {
    pointerOrigin = { x: event.clientX, y: event.clientY };
  }

  function onCanvasPointerMove(event) {
    if (pointerOrigin) return;
    const hit = getRodAtPointer(event);
    if (hit) {
      const { gridX, gridZ } = hit.userData;
      setHoveredRod(rodMeshes[gridX][gridZ]);
      renderer.domElement.style.cursor = "pointer";
    } else {
      setHoveredRod(null);
      renderer.domElement.style.cursor = "grab";
    }
  }

  function onCanvasPointerUp(event) {
    if (!pointerOrigin) return;
    const distance = Math.hypot(
      event.clientX - pointerOrigin.x,
      event.clientY - pointerOrigin.y,
    );
    pointerOrigin = null;
    if (distance > 7) return;
    if (STATE.isGameOver || STATE.isAnimating || STATE.mode !== "3d") return;
    if (STATE.opponent === "ai" && STATE.currentPlayer === 2) return;

    const hit = getRodAtPointer(event);
    if (!hit) return;
    const { gridX, gridZ } = hit.userData;
    playMove3D(gridX, gridZ);
  }

  function onCanvasPointerLeave() {
    pointerOrigin = null;
    setHoveredRod(null);
  }

  function addDiskMesh3D(x, y, z, player) {
    const offset = (3 * ROD_SPACING) / 2;
    const posX = x * ROD_SPACING - offset;
    const posZ = z * ROD_SPACING - offset;
    const targetY = BASE_TOP + DISK_HEIGHT / 2 + 0.08 + y * (DISK_HEIGHT + 0.06);
    const color = player === 1 ? 0xff405f : 0xffd134;
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.24,
      metalness: 0.2,
    });
    const disk = new THREE.Mesh(createRingGeometry(), material);
    disk.position.set(posX, 5.6, posZ);
    disk.rotation.y = Math.random() * Math.PI;
    disk.castShadow = true;
    disk.receiveShadow = true;
    disk.userData = { gridX: x, gridY: y, gridZ: z, player };
    scene.add(disk);
    diskMeshes3D.push(disk);

    STATE.isAnimating = true;
    const duration = 360;
    const startY = 5.6;
    const startTime = performance.now();

    function bounce(progress) {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (progress < 1 / d1) return n1 * progress * progress;
      if (progress < 2 / d1) {
        const value = progress - 1.5 / d1;
        return n1 * value * value + 0.75;
      }
      if (progress < 2.5 / d1) {
        const value = progress - 2.25 / d1;
        return n1 * value * value + 0.9375;
      }
      const value = progress - 2.625 / d1;
      return n1 * value * value + 0.984375;
    }

    function animateDrop(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      disk.position.y = startY + (targetY - startY) * bounce(progress);
      disk.rotation.y += 0.035 * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(animateDrop);
      } else {
        disk.position.y = targetY;
        STATE.isAnimating = false;
        AudioEngine.playDrop();
        triggerVibration();
      }
    }

    requestAnimationFrame(animateDrop);
  }

  // ---------------------------------------------------------------------------
  // Core game logic
  // ---------------------------------------------------------------------------
  function scheduleAIMove() {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(triggerAIMove, 480);
  }

  function switchPlayer() {
    STATE.currentPlayer = STATE.currentPlayer === 1 ? 2 : 1;
    updateCurrentPlayerUI();
    if (
      !STATE.isGameOver &&
      STATE.opponent === "ai" &&
      STATE.currentPlayer === 2
    ) {
      scheduleAIMove();
    }
  }

  function init2DGridUI() {
    DOM.board2DGrid.innerHTML = "";
    DOM.colTriggers.innerHTML = "";

    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const cell = document.createElement("div");
        cell.className = "cell-2d";
        cell.dataset.row = row;
        cell.dataset.col = column;
        DOM.board2DGrid.appendChild(cell);
      }
    }

    for (let column = 0; column < 7; column += 1) {
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "col-trigger";
      trigger.dataset.col = column;
      trigger.setAttribute("aria-label", `Jouer dans la colonne ${column + 1}`);
      trigger.addEventListener("click", () => playMove2D(column, true));
      DOM.colTriggers.appendChild(trigger);
    }
  }

  function getLowestEmptyRow2D(column) {
    for (let row = 5; row >= 0; row -= 1) {
      if (STATE.board2D[row][column] === 0) return row;
    }
    return -1;
  }

  function playMove2D(column, initiatedByPlayer = false) {
    if (STATE.isGameOver || STATE.isAnimating) return;
    if (
      initiatedByPlayer &&
      STATE.opponent === "ai" &&
      STATE.currentPlayer === 2
    ) {
      return;
    }

    const row = getLowestEmptyRow2D(column);
    if (row === -1) return;

    AudioEngine.init();
    const player = STATE.currentPlayer;
    STATE.board2D[row][column] = player;
    STATE.history.push({ mode: "2d", row, col: column, player });

    const cell = DOM.board2DGrid.children[row * 7 + column];
    const disk = document.createElement("div");
    disk.className = `disk ${player === 1 ? "red" : "yellow"}`;
    cell.appendChild(disk);
    AudioEngine.playDrop();
    triggerVibration();

    const winLine = checkWin2D(row, column, player);
    if (winLine) {
      handleWin(player, winLine);
    } else if (STATE.board2D.every((line) => line.every(Boolean))) {
      handleDraw();
    } else {
      switchPlayer();
    }
  }

  function checkWin2D(row, column, player) {
    const directions = [
      [[0, 1], [0, -1]],
      [[1, 0], [-1, 0]],
      [[1, 1], [-1, -1]],
      [[1, -1], [-1, 1]],
    ];

    for (const direction of directions) {
      const line = [[row, column]];
      for (const [deltaRow, deltaColumn] of direction) {
        let nextRow = row + deltaRow;
        let nextColumn = column + deltaColumn;
        while (
          nextRow >= 0 &&
          nextRow < 6 &&
          nextColumn >= 0 &&
          nextColumn < 7 &&
          STATE.board2D[nextRow][nextColumn] === player
        ) {
          line.push([nextRow, nextColumn]);
          nextRow += deltaRow;
          nextColumn += deltaColumn;
        }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  function getLowestEmptyY3D(x, z) {
    for (let y = 0; y < 4; y += 1) {
      if (STATE.board3D[x][y][z] === 0) return y;
    }
    return -1;
  }

  function playMove3D(x, z) {
    if (STATE.isGameOver || STATE.isAnimating || !scene) return;
    if (STATE.disksLeft[STATE.currentPlayer] <= 0) return;
    const y = getLowestEmptyY3D(x, z);
    if (y === -1) return;

    AudioEngine.init();
    const player = STATE.currentPlayer;
    STATE.board3D[x][y][z] = player;
    STATE.disksLeft[player] -= 1;
    STATE.history.push({ mode: "3d", x, y, z, player });
    updateDisksUI();
    addDiskMesh3D(x, y, z, player);

    const winLine = checkWin3D(player);
    if (winLine) {
      handleWin(player, winLine);
    } else if (STATE.disksLeft[1] === 0 && STATE.disksLeft[2] === 0) {
      handleDraw();
    } else {
      switchPlayer();
    }
  }

  function checkWin3D(player) {
    return (
      WINNING_LINES_3D.find((line) =>
        line.every(([x, y, z]) => STATE.board3D[x][y][z] === player),
      ) || null
    );
  }

  function findTacticalMove2D(player) {
    for (let column = 0; column < 7; column += 1) {
      const row = getLowestEmptyRow2D(column);
      if (row < 0) continue;
      STATE.board2D[row][column] = player;
      const wins = Boolean(checkWin2D(row, column, player));
      STATE.board2D[row][column] = 0;
      if (wins) return column;
    }
    return null;
  }

  function chooseHardMove2D(validColumns) {
    const positionalWeight = [1, 2, 4, 7, 4, 2, 1];
    let bestScore = -Infinity;
    let bestColumns = [];
    validColumns.forEach((column) => {
      const row = getLowestEmptyRow2D(column);
      let score = positionalWeight[column] + Math.random();
      const adjacent = [[0, -1], [0, 1], [1, 0], [1, -1], [1, 1]];
      adjacent.forEach(([deltaRow, deltaColumn]) => {
        const nearRow = row + deltaRow;
        const nearColumn = column + deltaColumn;
        if (
          nearRow >= 0 && nearRow < 6 && nearColumn >= 0 && nearColumn < 7 &&
          STATE.board2D[nearRow][nearColumn] === 2
        ) score += 2;
      });
      if (score > bestScore) {
        bestScore = score;
        bestColumns = [column];
      } else if (score === bestScore) {
        bestColumns.push(column);
      }
    });
    return bestColumns[Math.floor(Math.random() * bestColumns.length)];
  }

  function findTacticalMove3D(player) {
    for (let x = 0; x < 4; x += 1) {
      for (let z = 0; z < 4; z += 1) {
        const y = getLowestEmptyY3D(x, z);
        if (y < 0) continue;
        STATE.board3D[x][y][z] = player;
        const wins = Boolean(checkWin3D(player));
        STATE.board3D[x][y][z] = 0;
        if (wins) return { x, z };
      }
    }
    return null;
  }

  function triggerAIMove() {
    if (
      STATE.isGameOver ||
      STATE.currentPlayer !== 2 ||
      DOM.gameScreen.classList.contains("hidden")
    ) return;

    if (STATE.mode === "2d") {
      const validColumns = Array.from({ length: 7 }, (_, column) => column)
        .filter((column) => STATE.board2D[0][column] === 0);
      if (!validColumns.length) return;

      let chosenColumn = null;
      if (STATE.difficulty !== "easy") {
        chosenColumn = findTacticalMove2D(2);
      }
      if (chosenColumn === null && STATE.difficulty === "hard") {
        chosenColumn = findTacticalMove2D(1);
      }
      if (chosenColumn === null) {
        chosenColumn = STATE.difficulty === "hard"
          ? chooseHardMove2D(validColumns)
          : validColumns[Math.floor(Math.random() * validColumns.length)];
      }
      playMove2D(chosenColumn, false);
      return;
    }

    const validRods = [];
    for (let x = 0; x < 4; x += 1) {
      for (let z = 0; z < 4; z += 1) {
        if (STATE.board3D[x][3][z] === 0) validRods.push({ x, z });
      }
    }
    if (!validRods.length) return;

    let chosenRod = null;
    if (STATE.difficulty !== "easy") chosenRod = findTacticalMove3D(2);
    if (!chosenRod && STATE.difficulty === "hard") chosenRod = findTacticalMove3D(1);
    if (!chosenRod) {
      const weightedRods = STATE.difficulty === "hard"
        ? validRods.flatMap((rod) => {
            const central = (rod.x === 1 || rod.x === 2) && (rod.z === 1 || rod.z === 2);
            return central ? [rod, rod, rod] : [rod];
          })
        : validRods;
      chosenRod = weightedRods[Math.floor(Math.random() * weightedRods.length)];
    }
    playMove3D(chosenRod.x, chosenRod.z);
  }

  function undoLastMove() {
    clearTimeout(aiTimer);
    if (!STATE.history.length || STATE.isGameOver || STATE.isAnimating) return;
    const lastMove = STATE.history.pop();

    if (lastMove.mode === "2d") {
      STATE.board2D[lastMove.row][lastMove.col] = 0;
      DOM.board2DGrid.children[lastMove.row * 7 + lastMove.col].innerHTML = "";
    } else {
      STATE.board3D[lastMove.x][lastMove.y][lastMove.z] = 0;
      STATE.disksLeft[lastMove.player] += 1;
      updateDisksUI();
      const lastMesh = diskMeshes3D.pop();
      if (lastMesh) {
        scene.remove(lastMesh);
        lastMesh.geometry.dispose();
        lastMesh.material.dispose();
      }
    }

    if (
      STATE.opponent === "ai" &&
      STATE.history.length > 0 &&
      lastMove.player === 2
    ) {
      undoLastMove();
      return;
    }

    STATE.currentPlayer = lastMove.player;
    updateCurrentPlayerUI();
  }

  // ---------------------------------------------------------------------------
  // End states and effects
  // ---------------------------------------------------------------------------
  function highlightWinningLine(winLine) {
    if (STATE.mode === "2d") {
      winLine.forEach(([row, column]) => {
        const disk = DOM.board2DGrid.children[row * 7 + column]?.firstElementChild;
        disk?.classList.add("winning");
      });
      return;
    }

    winLine.forEach(([x, y, z]) => {
      const disk = diskMeshes3D.find(
        (mesh) =>
          mesh.userData.gridX === x &&
          mesh.userData.gridY === y &&
          mesh.userData.gridZ === z,
      );
      if (disk) {
        disk.userData.winning = true;
        disk.material.emissiveIntensity = 0.7;
      }
    });
  }

  function launchConfetti() {
    DOM.confettiLayer.innerHTML = "";
    const colors = ["#ff4f8b", "#ffd134", "#55e9e2", "#fff4d6", "#8b46e8"];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 70; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.setProperty("--fall-delay", `${Math.random() * 0.7}s`);
      piece.style.setProperty("--fall-duration", `${2.1 + Math.random() * 1.8}s`);
      piece.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
      fragment.appendChild(piece);
    }
    DOM.confettiLayer.appendChild(fragment);
  }

  function revealGameOver(withConfetti = false) {
    DOM.gameOverModal.classList.remove("hidden");
    if (withConfetti) launchConfetti();
  }

  function handleWin(player, winLine) {
    STATE.isGameOver = true;
    clearTimeout(aiTimer);
    highlightWinningLine(winLine);
    AudioEngine.playWin();

    if (player === 1) STATE.stats.red += 1;
    else STATE.stats.yellow += 1;
    localStorage.setItem("p4_neon_stats", JSON.stringify(STATE.stats));
    updateStatsUI();

    const name = player === 1 ? "ROUGE" : "JAUNE";
    DOM.winnerTitle.textContent = `VICTOIRE ${name} !`;
    DOM.winnerSubtext.textContent = "Quatre pièces alignées. Quel coup de maître !";
    modalTimer = setTimeout(() => revealGameOver(true), STATE.mode === "3d" ? 420 : 280);
  }

  function handleDraw() {
    STATE.isGameOver = true;
    clearTimeout(aiTimer);
    DOM.winnerTitle.textContent = "MATCH NUL !";
    DOM.winnerSubtext.textContent = "La grille est pleine. La revanche s’impose.";
    modalTimer = setTimeout(() => revealGameOver(false), 220);
  }

  function resetGame() {
    clearTimeout(aiTimer);
    clearTimeout(modalTimer);
    STATE.isGameOver = false;
    STATE.isAnimating = false;
    STATE.currentPlayer = 1;
    STATE.history = [];
    STATE.disksLeft = { 1: 32, 2: 32 };
    STATE.board2D = createBoard2D();
    STATE.board3D = createBoard3D();
    DOM.gameOverModal.classList.add("hidden");
    DOM.confettiLayer.innerHTML = "";
    updateCurrentPlayerUI();
    updateDisksUI();
    updateModeCopy();

    if (STATE.mode === "2d") {
      if (renderer) disposeThreeScene();
      init2DGridUI();
    } else {
      requestAnimationFrame(initThreeJS);
    }
  }

  // ---------------------------------------------------------------------------
  // Menu and application events
  // ---------------------------------------------------------------------------
  function activateChoice(selector, selectedButton) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle("active", button === selectedButton);
    });
    AudioEngine.playSelect();
  }

  document.querySelectorAll(".btn-mode").forEach((button) => {
    button.addEventListener("click", (event) => {
      activateChoice(".btn-mode", event.currentTarget);
      STATE.mode = event.currentTarget.dataset.mode;
    });
  });

  document.querySelectorAll(".btn-opp").forEach((button) => {
    button.addEventListener("click", (event) => {
      activateChoice(".btn-opp", event.currentTarget);
      STATE.opponent = event.currentTarget.dataset.opp;
      DOM.aiGroup.classList.toggle("hidden", STATE.opponent !== "ai");
    });
  });

  document.querySelectorAll(".btn-diff").forEach((button) => {
    button.addEventListener("click", (event) => {
      activateChoice(".btn-diff", event.currentTarget);
      STATE.difficulty = event.currentTarget.dataset.diff;
    });
  });

  document.getElementById("btn-start").addEventListener("click", () => {
    AudioEngine.init();
    AudioEngine.playSelect();
    DOM.menuScreen.classList.add("hidden");
    DOM.gameScreen.classList.remove("hidden");
    const is3D = STATE.mode === "3d";
    DOM.view2D.classList.toggle("hidden", is3D);
    DOM.view3D.classList.toggle("hidden", !is3D);
    DOM.remainingDisksBar.classList.toggle("hidden", !is3D);
    resetGame();
  });

  document.getElementById("btn-menu").addEventListener("click", () => {
    clearTimeout(aiTimer);
    clearTimeout(modalTimer);
    threeActive = false;
    DOM.gameScreen.classList.add("hidden");
    DOM.gameOverModal.classList.add("hidden");
    DOM.menuScreen.classList.remove("hidden");
  });

  document.getElementById("btn-restart").addEventListener("click", resetGame);
  document.getElementById("btn-modal-restart").addEventListener("click", resetGame);
  document.getElementById("btn-undo").addEventListener("click", undoLastMove);
  document.getElementById("btn-modal-menu").addEventListener("click", () => {
    clearTimeout(aiTimer);
    clearTimeout(modalTimer);
    threeActive = false;
    DOM.gameOverModal.classList.add("hidden");
    DOM.gameScreen.classList.add("hidden");
    DOM.menuScreen.classList.remove("hidden");
  });

  window.addEventListener("resize", () => {
    if (!renderer || !camera || !threeActive) return;
    const width = Math.max(DOM.canvas3DContainer.clientWidth, 320);
    const height = Math.max(DOM.canvas3DContainer.clientHeight, 360);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
});
