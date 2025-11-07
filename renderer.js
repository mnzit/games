// Flappy Bird style game
// Player controls a bird that must avoid pipes by jumping/flapping

const canvas = document.getElementById('game');
if (!canvas) throw new Error("Canvas element 'game' not found.");
const ctx = canvas.getContext('2d');
let W = canvas.width;
let H = canvas.height;

// Game state
let running = false;
let score = 0;
let highScore = 0;
let animationFrameId = null;

// Physics
const gravity = 0.4;
const jumpForce = -8;
const pipeSpeed = 3;

// Responsive canvas sizing (handles DPR and window resize)
function resizeCanvas() {
    // Use most of the window but keep some margins
    const cssW = Math.max(320, Math.min(window.innerWidth * 0.95, 1600));
    const cssH = Math.max(240, Math.min(window.innerHeight * 0.9, 1100));

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.floor(cssW) + 'px';
    canvas.style.height = Math.floor(cssH) + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    // Set logical width/height for drawing in CSS pixels
    W = cssW;
    H = cssH;

    // Reset transform so drawing uses CSS pixels; the canvas bitmap is scaled by DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    roadMargin = Math.max(20, Math.round(W * 0.06));
    const innerRoadWidth = Math.max(100, W - roadMargin * 2);
    laneWidth = innerRoadWidth / lanes;

    // Recompute player/enemy sizes based on new H if images already loaded
    const targetH = Math.max(40, Math.round(H * 0.14));
    if (playerImgLoaded) {
        const aspect = playerImg.naturalWidth / playerImg.naturalHeight || 1;
        player.h = targetH;
        player.w = Math.round(targetH * aspect);
    } else {
        player.h = Math.max(40, Math.round(H * 0.12));
        player.w = Math.max(30, Math.round(player.h * 0.6));
    }

    if (trafficImgLoaded) {
        const aspect = trafficImg.naturalWidth / trafficImg.naturalHeight || 1;
        enemyDefaultH = targetH;
        enemyDefaultW = Math.round(targetH * aspect);
    } else {
        enemyDefaultH = Math.max(40, Math.round(H * 0.12));
        enemyDefaultW = Math.max(30, Math.round(enemyDefaultH * 0.6));
    }

    // Reposition player and existing enemies to new lane centers (account for roadMargin)
    player.x = roadMargin + player.lane * laneWidth + laneWidth / 2;
    player.y = H - Math.round(H * 0.18);
    for (const e of enemies) {
        e.x = roadMargin + e.lane * laneWidth + laneWidth / 2;
    }
}

// Images (use uploaded assets if available)
const playerImg = new Image();
playerImg.src = 'images/bird.png'; // Will fallback to colored rectangle if not found
let playerImgLoaded = false;
playerImg.addEventListener('load', () => {
    playerImgLoaded = true;
    const targetH = Math.max(30, Math.round((H || 480) * 0.08));
    const aspect = playerImg.naturalWidth / playerImg.naturalHeight || 1;
    player.h = targetH;
    player.w = Math.round(targetH * aspect);
});
playerImg.addEventListener('error', () => { playerImgLoaded = false; });

// Audio effects
const flapAudio = new Audio('audio/flap.m4a');
flapAudio.preload = 'auto';
let flapAudioLoaded = false;
flapAudio.addEventListener('canplaythrough', () => { flapAudioLoaded = true; });
flapAudio.addEventListener('error', () => { flapAudioLoaded = false; });

const hitAudio = new Audio('audio/hit.wav');
hitAudio.preload = 'auto';
let hitAudioLoaded = false;
hitAudio.addEventListener('canplaythrough', () => { hitAudioLoaded = true; });
hitAudio.addEventListener('error', () => { hitAudioLoaded = false; });

// Player bird
const player = {
    x: W * 0.2,
    y: H / 2,
    w: 40,
    h: 30,
    velocity: 0,
    color: '#ff0'
};

// Pipes
let pipes = [];
let pipeGap = 150;
let pipeWidth = 60;
let spawnTimer = 0;
const spawnInterval = 100; // frames

// Input movement timing (prevents repeating moves when key is held)
let lastMoveTime = 0;
const minMoveInterval = 150; // ms between allowed lane changes

function resetGame() {
    score = 0;
    pipes = [];
    spawnTimer = 0;
    player.y = H / 2;
    player.velocity = 0;
    running = true;
    if (!animationFrameId) gameLoop();
}

function endGame() {
    running = false;
    // play hit sound if available
    try {
        if (hitAudioLoaded) {
            hitAudio.currentTime = 0;
            const p = hitAudio.play();
            if (p && p.catch) p.catch(() => {});
        }
    } catch (e) {
        // ignore playback errors
    }

    if (score > highScore) {
        highScore = score;
        if (window.electronAPI && window.electronAPI.setHighScore) {
            window.electronAPI.setHighScore(highScore);
        }
    }
}

function spawnPipes() {
    const gapStart = Math.random() * (H - pipeGap - 100) + 50;
    pipes.push({
        x: W,
        y: gapStart,
        w: pipeWidth,
        gapHeight: pipeGap,
        passed: false
    });
}

function update() {
    if (!running) return;

    // Apply gravity to player
    player.velocity += gravity;
    player.y += player.velocity;

    // Keep player in bounds
    if (player.y < 0) {
        player.y = 0;
        player.velocity = 0;
    }
    if (player.y > H - player.h) {
        player.y = H - player.h;
        endGame();
    }

    // Spawn pipes
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        spawnPipes();
    }

    // Update pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
        const pipe = pipes[i];
        pipe.x -= pipeSpeed;

        // Check if player passed pipe
        if (!pipe.passed && pipe.x + pipe.w < player.x) {
            pipe.passed = true;
            score++;
        }

        // Remove off-screen pipes
        if (pipe.x + pipe.w < 0) {
            pipes.splice(i, 1);
            continue;
        }

        // Collision detection
        const birdBox = {
            x: player.x,
            y: player.y,
            w: player.w,
            h: player.h
        };

        // Check collision with upper pipe
        const upperPipe = {
            x: pipe.x,
            y: 0,
            w: pipe.w,
            h: pipe.y
        };

        // Check collision with lower pipe
        const lowerPipe = {
            x: pipe.x,
            y: pipe.y + pipe.gapHeight,
            w: pipe.w,
            h: H - (pipe.y + pipe.gapHeight)
        };

        if (checkCollision(birdBox, upperPipe) || checkCollision(birdBox, lowerPipe)) {
            endGame();
            break;
        }
    }
}

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

function drawBackground() {
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
}

function drawPlayer() {
    const x = player.x;
    const y = player.y;
    
    // Rotate bird based on velocity
    ctx.save();
    ctx.translate(x + player.w / 2, y + player.h / 2);
    const rotation = Math.min(Math.max(player.velocity * 0.1, -0.5), 0.5);
    ctx.rotate(rotation);
    
    if (playerImgLoaded) {
        ctx.drawImage(playerImg, -player.w / 2, -player.h / 2, player.w, player.h);
    } else {
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.ellipse(-player.w / 2, -player.h / 2, player.w / 2, player.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawPipes() {
    for (const pipe of pipes) {
        // Gradient for pipes
        const gradientUpper = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.w, 0);
        gradientUpper.addColorStop(0, '#FF6B6B');
        gradientUpper.addColorStop(0.5, '#FF4949');
        gradientUpper.addColorStop(1, '#FF6B6B');
        
        // Pipe body
        ctx.fillStyle = gradientUpper;
        
        // Upper pipe
        ctx.fillRect(pipe.x, 0, pipe.w, pipe.y);
        
        // Lower pipe
        const lowerPipeY = pipe.y + pipe.gapHeight;
        ctx.fillRect(pipe.x, lowerPipeY, pipe.w, H - lowerPipeY);
        
        // Pipe edges (darker color for depth)
        ctx.fillStyle = '#E64444';
        const edgeWidth = 4;
        
        // Upper pipe edges
        ctx.fillRect(pipe.x, pipe.y - edgeWidth, pipe.w, edgeWidth);
        ctx.fillRect(pipe.x - edgeWidth/2, 0, edgeWidth, pipe.y);
        ctx.fillRect(pipe.x + pipe.w - edgeWidth/2, 0, edgeWidth, pipe.y);
        
        // Lower pipe edges
        ctx.fillRect(pipe.x, lowerPipeY, pipe.w, edgeWidth);
        ctx.fillRect(pipe.x - edgeWidth/2, lowerPipeY, edgeWidth, H - lowerPipeY);
        ctx.fillRect(pipe.x + pipe.w - edgeWidth/2, lowerPipeY, edgeWidth, H - lowerPipeY);
    }
}

function drawHUD() {
    document.getElementById('score').innerText = score;
    document.getElementById('high').innerText = highScore;
    // Remove speed display since it's not used in Flappy Bird
    const speedElement = document.getElementById('speed');
    if (speedElement) speedElement.parentElement.style.display = 'none';
}

function draw() {
    drawBackground();
    drawPipes();
    drawPlayer();
    drawHUD();
}

function gameLoop() {
    if (running) update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}

// Helper: rounded rect
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof stroke === 'undefined') stroke = true;
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

// Handle jump/flap controls
function jump() {
    if (!running) {
        resetGame();
        return;
    }
    
    player.velocity = jumpForce;
    
    // Play flap sound
    try {
        if (flapAudioLoaded) {
            flapAudio.currentTime = 0;
            const p = flapAudio.play();
            if (p && p.catch) p.catch(() => {});
        }
    } catch (e) {
        // ignore playback errors
    }
}

document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        jump();
    }
});

canvas.addEventListener('click', jump);

document.addEventListener('DOMContentLoaded', () => {
    const restartButton = document.getElementById('restart');
    const toggleButton = document.getElementById('toggleFull');

    // Load high score
    if (window.electronAPI && window.electronAPI.getHighScore) {
        highScore = window.electronAPI.getHighScore();
    }

    if (restartButton) restartButton.addEventListener('click', () => resetGame());
    if (toggleButton && window.electronAPI && window.electronAPI.toggleFullscreen) {
        toggleButton.addEventListener('click', () => {
            window.electronAPI.toggleFullscreen();
        });
    }

    // make canvas responsive and start
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    resetGame();
});

// Expose for tests/debug
window._game = {
    resetGame,
    endGame
};
