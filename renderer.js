// =========================================================================
// 1. GAME SETUP AND OBJECT DEFINITIONS (Keep outside DOMContentLoaded)
// =========================================================================

const canvas = document.getElementById('game');
// Add a strong check here to ensure the canvas exists
if (!canvas) {
    console.error("Canvas element 'game' not found! Check index.html.");
    // Exit the script early if the canvas is missing
    throw new Error("Canvas element 'game' not found.");
} 

const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// --- Audio assets -----------------------------------------------------
// Preload hit sound for brick collisions. Using HTMLAudioElement here is
// fine in the renderer context (Electron / browser). We reset currentTime
// before play so repeated quick hits replay the sound.
const hitSound = new Audio('audio/hit2.wav');
hitSound.volume = 0.5;

// Sound when the player loses a life
const loseSound = new Audio('audio/Lose1.m4a');
loseSound.volume = 0.6;

// Sound when the game is over (no lives left)
const gameOverSound = new Audio('audio/Gameover1.m4a');
gameOverSound.volume = 0.7;

// Game State - Initialized later in DOMContentLoaded
let running = false;
let score = 0;
let lives = 3;
let highScore = 0; // Initialize to 0, load actual value later
let animationFrameId = null; 

// Paddle Setup
const paddle = {
    w: 100,
    h: 10,
    x: W / 2 - 50,
    y: H - 30,
    speed: 5,
    color: '#0cf'
};

// Ball Setup
const ball = {
    r: 6,
    x: W / 2,
    y: H - 40,
    vx: 3,
    vy: -3,
    color: '#fff'
};

// Brick Setup
const brickW = 60;
const brickH = 15;
const brickRow = 5;
const brickCol = 12;
const brickPadding = 5;
const totalBrickWidth = brickCol * (brickW + brickPadding) - brickPadding;
const brickOffsetTop = 30;
const brickOffsetLeft = (W - totalBrickWidth) / 2; 
let bricks = [];

// Input State
let leftDown = false;
let rightDown = false;

// =========================================================================
// 2. INITIALIZATION AND RESET FUNCTIONS
// =========================================================================

function initBricks() {
    bricks = [];
    for (let r = 0; r < brickRow; r++) {
        bricks[r] = [];
        for (let c = 0; c < brickCol; c++) {
            const x = c * (brickW + brickPadding) + brickOffsetLeft;
            const y = r * (brickH + brickPadding) + brickOffsetTop;
            bricks[r][c] = { x, y, alive: true };
        }
    }
}

function resetBall() {
    ball.x = W / 2;
    ball.y = H - 40;
    paddle.x = W / 2 - 50;
    ball.vx = 3 * (Math.random() < 0.5 ? 1 : -1); 
    ball.vy = -3;
}

function startGame() {
    running = true;
    if (!animationFrameId) {
        gameLoop();
    }
}

function restartGame() {
    score = 0;
    lives = 3;
    initBricks();
    resetBall();
    updateHUD();
    startGame();
}

// =========================================================================
// 3. DRAWING AND UI FUNCTIONS
// =========================================================================

function drawPaddle() {
    ctx.fillStyle = paddle.color;
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
}

function drawBall() {
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
}

function drawBricks() {
    let allDead = true;
    for (let r = 0; r < brickRow; r++) {
        for (let c = 0; c < brickCol; c++) {
            const b = bricks[r][c];
            if (b.alive) {
                allDead = false;
                ctx.fillStyle = r % 2 === 0 ? '#2b6' : '#6b2'; 
                ctx.fillRect(b.x, b.y, brickW, brickH);
            }
        }
    }
    if (allDead) {
        running = false;
        alert('You Win! Press Restart to play again.');
    }
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, W, H);
    
    drawBricks();
    drawPaddle();
    drawBall();
}

function updateHUD() {
    document.getElementById('score').innerText = score;
    document.getElementById('lives').innerText = lives;
    document.getElementById('high').innerText = highScore;

    if (score > highScore) {
        highScore = score;
        if(window.electronAPI && window.electronAPI.setHighScore) {
             window.electronAPI.setHighScore(highScore);
        }
    }
}

// =========================================================================
// 4. GAME LOOP AND CORE LOGIC
// =========================================================================

function update() {
    if (!running) return;

    // 1. Update Paddle Position
    if (leftDown) paddle.x -= paddle.speed;
    if (rightDown) paddle.x += paddle.speed;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    // 2. Update Ball Position
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 3. Wall Collision 
    if (ball.x + ball.r > W || ball.x - ball.r < 0) ball.vx *= -1;
    if (ball.y - ball.r < 0) ball.vy *= -1;

    // 4. Paddle Collision
    const py = H - 30; 
    if (
        ball.y + ball.r >= py && 
        ball.y + ball.r <= py + Math.abs(ball.vy) &&
        ball.x > paddle.x && 
        ball.x < paddle.x + paddle.w &&
        ball.vy > 0 
    ) {
        ball.vy = -Math.abs(ball.vy);
    }

    // 5. Brick Collision
    let hit = false;
    for (let r = 0; r < brickRow; r++) {
        for (let c = 0; c < brickCol; c++) {
            const b = bricks[r][c];
            if (!b.alive) continue;

            const bLeft = b.x;
            const bRight = b.x + brickW;
            const bTop = b.y;
            const bBottom = b.y + brickH;

            if (
                ball.x + ball.r > bLeft && ball.x - ball.r < bRight &&
                ball.y + ball.r > bTop && ball.y - ball.r < bBottom
            ) {
                const prevBallY = ball.y - ball.vy;

                // Vertical bounce (Hit Top or Bottom)
                if (prevBallY > bBottom || prevBallY < bTop) {
                    ball.vy *= -1;
                } else {
                    // Horizontal bounce (Hit Left or Right)
                    ball.vx *= -1;
                }

                b.alive = false;
                score += 10;
                // Play hit sound (reset so it can replay rapidly)
                try {
                    hitSound.currentTime = 0;
                    // play() returns a Promise in modern browsers — swallow errors
                    hitSound.play().catch(() => {});
                } catch (e) {
                    // Audio may be unavailable in some environments; ignore
                }
                hit = true;
                break; 
            }
        }
        if (hit) break; 
    }
    
    // 6. Check for Miss (Ball below screen)
    if (ball.y - ball.r > H) {
        lives--;

        // Play lose sound for life lost, or game over sound if no lives remain.
        try {
            if (lives > 0) {
                loseSound.currentTime = 0;
                loseSound.play().catch(() => {});
            } else {
                gameOverSound.currentTime = 0;
                gameOverSound.play().catch(() => {});
            }
        } catch (e) {
            // Ignore audio errors — non-fatal
        }

        if (lives > 0) {
            resetBall();
        } else {
            running = false;
            updateHUD();
        }
    }
}

function gameLoop() {
    if (running) {
        update();
    }
    draw();
    updateHUD();
    
    animationFrameId = requestAnimationFrame(gameLoop);
}


// =========================================================================
// 5. EVENT LISTENERS AND STARTUP (CRITICAL SECTION)
// =========================================================================

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') leftDown = true;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') rightDown = true;
});

document.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') leftDown = false;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') rightDown = false;
});

document.addEventListener('DOMContentLoaded', () => {
    const restartButton = document.getElementById('restart');
    const toggleButton = document.getElementById('toggleFull');

    // 1. Load high score safely now that DOM is ready
    if (window.electronAPI && window.electronAPI.getHighScore) {
        highScore = window.electronAPI.getHighScore();
    }

    // 2. Hook up Buttons
    if (restartButton) restartButton.addEventListener('click', restartGame);
    
    if (toggleButton && window.electronAPI && window.electronAPI.toggleFullscreen) {
        toggleButton.addEventListener('click', () => {
            window.electronAPI.toggleFullscreen();
        });
    }

    // 3. Start the game
    restartGame();
});