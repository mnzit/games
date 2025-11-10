// Mini Militia style 2D shooter game
// Game state variables
let running = false;
let score = 0;
let highScore = 0;
let animationFrameId = null;
let mouseX = 0;
let mouseY = 0;
let enemies = [];
let obstacles = [];
let spawnTimer = 0;
const spawnInterval = 180; // Spawn enemy every 3 seconds (60fps)
let effects = [];
let popupTexts = [];
let frameCount = 0; // For animation timing
let items = []; // Collectables/items placed in the world

const canvas = document.getElementById('game');
if (!canvas) throw new Error("Canvas element 'game' not found.");
const ctx = canvas.getContext('2d');

let W = canvas.width;
let H = canvas.height;

// Camera system
let cameraX = 0;
const MAP_WIDTH = 2400; // Example: 3x screen width, adjust as needed

function resizeCanvas() {
    // Calculate the new size while maintaining 4:3 aspect ratio
    const wrapperWidth = window.innerWidth * 0.8;
    const wrapperHeight = window.innerHeight * 0.8;
    const aspectRatio = 4/3;
    
    let newWidth, newHeight;
    
    if (wrapperWidth / aspectRatio <= wrapperHeight) {
        newWidth = wrapperWidth;
        newHeight = wrapperWidth / aspectRatio;
    } else {
        newHeight = wrapperHeight;
        newWidth = wrapperHeight * aspectRatio;
    }
    
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Update global width and height variables
    W = canvas.width;
    H = canvas.height;
    
    // Scale the context to match the new size
    ctx.imageSmoothingEnabled = false;  // Keep pixel art sharp
}

// Sprite loading
const spriteStates = {
    idle: { frames: 16, images: [] },
    run: { frames: 11, images: [] },
    jump: { frames: 16, images: [] },
    walk: { frames: 13, images: [] },
    slide: { frames: 11, images: [] },
    dead: { frames: 17, images: [] }
};

const enemySpriteStates = {
    idle: { frames: 10, images: [] },
    run: { frames: 8, images: [] },
    jump: { frames: 10, images: [] },
    walk: { frames: 10, images: [] },
    slide: { frames: 10, images: [] },
    dead: { frames: 10, images: [] }
};

// Load all sprites
console.log('Loading player sprites...');
let loadedSprites = 0;
const totalSprites = Object.values(spriteStates).reduce((sum, data) => sum + data.frames, 0);

Object.entries(spriteStates).forEach(([state, data]) => {
    for (let i = 1; i <= data.frames; i++) {
        const img = new Image();
        img.onload = () => {
            loadedSprites++;
            console.log(`Loaded sprite ${loadedSprites}/${totalSprites}`);
            if (loadedSprites === totalSprites) {
                console.log('All player sprites loaded!');
            }
        };
        img.onerror = (e) => {
            console.error(`Failed to load sprite: ${state} (${i})`, e);
        };
        img.src = `images/santasprites/png/${state.charAt(0).toUpperCase() + state.slice(1)} (${i}).png`;
        data.images.push(img);
    }
});

// Load enemy sprites
Object.entries(enemySpriteStates).forEach(([state, data]) => {
    for (let i = 1; i <= data.frames; i++) {
        const img = new Image();
        img.src = `images/enemy/${state.charAt(0).toUpperCase() + state.slice(1)} (${i}).png`;
        data.images.push(img);
    }
});

// Kauzz Forest Tiles assets (backgrounds and collectables)
const kauzz = {
    backgrounds: {
        bg: new Image(),
        bgExt: new Image(),
        mid: new Image(),
        midExt: new Image(),
        midGreen: new Image()
    },
    collectables: {
        coin: new Image(),
        silver: new Image(),
        heart: new Image()
    },
    loaded: false
};

// Load Kauzz images
kauzz.backgrounds.bg.src = 'images/Kauzz Forest Tiles/Backgrounds/Background Extended.png';
kauzz.backgrounds.bgExt.src = 'images/Kauzz Forest Tiles/Backgrounds/Background Extended Green.png';
kauzz.backgrounds.mid.src = 'images/Kauzz Forest Tiles/Backgrounds/Midground.png';
kauzz.backgrounds.midExt.src = 'images/Kauzz Forest Tiles/Backgrounds/Midground Extended.png';
kauzz.backgrounds.midGreen.src = 'images/Kauzz Forest Tiles/Backgrounds/Midground Extended Green.png';

kauzz.collectables.coin.src = 'images/Kauzz Forest Tiles/Collectables/gold_coin_strip4.png';
kauzz.collectables.silver.src = 'images/Kauzz Forest Tiles/Collectables/silver_coin_strip4.png';
kauzz.collectables.heart.src = 'images/Kauzz Forest Tiles/Collectables/Heart_strip2.png';

// Simple loaded flag once primary assets are ready
let _kauzzToLoad = Object.values(kauzz.backgrounds).length + Object.values(kauzz.collectables).length;
Object.values(kauzz.backgrounds).forEach(img => img.onload = () => { if (--_kauzzToLoad <= 0) kauzz.loaded = true; });
Object.values(kauzz.collectables).forEach(img => img.onload = () => { if (--_kauzzToLoad <= 0) kauzz.loaded = true; });


// Visual effects system
class VisualEffect {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.life = 1.0; // 0.0 to 1.0
        this.alpha = 1.0;
        
        switch(type) {
            case 'hit':
                this.color = '#ff0';
                this.radius = 20;
                this.duration = 0.3;
                break;
            case 'explosion':
                this.color = '#f00';
                this.radius = 30;
                this.duration = 0.5;
                break;
            case 'heal':
                this.color = '#0f0';
                this.radius = 15;
                this.duration = 0.4;
                break;
        }
    }

    update() {
        this.life -= 1/60/this.duration;
        this.alpha = this.life;
        return this.life > 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (2 - this.life), 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}
// ...existing code...

class PopupText {
    constructor(x, y, text, color = '#fff', size = '20px') {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.size = size;
        this.life = 1.0;
        this.velocity = -2;
    }

    update() {
        this.y += this.velocity;
        this.life -= 0.02;
        return this.life > 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.font = `${this.size} Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// Track mouse position
document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) + cameraX;
    mouseY = e.clientY - rect.top;
});

// Handle shooting
canvas.addEventListener('click', (e) => {
    if (running) {
        const rect = canvas.getBoundingClientRect();
        const targetX = e.clientX - rect.left;
        const targetY = e.clientY - rect.top;
        player.shoot(targetX, targetY);
    }
});

// Initialize obstacles
function createObstacles() {
    // Create some platforms
    obstacles = [
        new Obstacle(100, H - 200, 200, 20),
        new Obstacle(400, H - 300, 200, 20),
        new Obstacle(700, H - 250, 200, 20),
        // Add walls
        new Obstacle(300, H - 400, 20, 150),
        new Obstacle(600, H - 350, 20, 150)
    ];
}

// Spawn enemies
function spawnEnemy() {
    const x = Math.random() * (W - 40);
    const y = 0;
    enemies.push(new Enemy(x, y));
}

// Player class
// Enemy class
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 80;
        this.height = 100;
    this.speed = 0.6; // Slower enemy movement (reduced)
        this.velX = 0;
        this.velY = 0;
        this.gravity = 0.5;
    this.health = 60; // Easier to kill
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.state = 'idle';
        this.frameIndex = 0;
        this.animationSpeed = 5;
        this.aggroRange = 300; // Range at which enemy becomes aggressive
        this.jumpForce = -10;
        this.jumpCooldown = 0;
        this.facing = 'right';
    }

    getCurrentSprite() {
        const state = enemySpriteStates[this.state];
        if (!state) return null;
        return state.images[Math.floor(this.frameIndex / this.animationSpeed) % state.frames];
    }

    updateState() {
        if (this.health <= 0) {
            this.state = 'dead';
        } else if (this.velY < 0 || this.velY > 1) {
            this.state = 'jump';
        } else if (Math.abs(this.velX) > 0.1) {
            this.state = Math.abs(this.velX) > 1.5 ? 'run' : 'walk';
        } else {
            this.state = 'idle';
        }

        // Update animation frame
        this.frameIndex++;
        if (this.frameIndex >= enemySpriteStates[this.state].frames * this.animationSpeed) {
            this.frameIndex = 0;
        }
    }

    update() {
        // Apply gravity
        this.velY += this.gravity;
        this.y += this.velY;

        // Ground collision
        if (this.y > H - this.height) {
            this.y = H - this.height;
            this.velY = 0;
        }

        // Calculate distance to player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Update behavior based on distance to player
        if (distance < this.aggroRange) {
            // Move towards player
            this.direction = dx > 0 ? 1 : -1;
            this.velX = this.speed * this.direction;
            
            // Jump if player is above and cooldown is ready
            if (this.jumpCooldown <= 0 && dy < -50 && Math.abs(dx) < 100) {
                this.velY = this.jumpForce;
                this.jumpCooldown = 120; // 2 seconds at 60fps
            }
        } else {
            // Patrol behavior
            this.velX = this.speed * this.direction;
            
            // Change direction at screen edges
            if (this.x <= 0 || this.x >= W - this.width) {
                this.direction *= -1;
            }
        }

        // Update position
        this.x += this.velX;

        // Update facing direction
        this.facing = this.direction > 0 ? 'right' : 'left';

        // Update jump cooldown
        if (this.jumpCooldown > 0) {
            this.jumpCooldown--;
        }

        // Wall collisions
        if (this.x < 0) this.x = 0;
        if (this.x > W - this.width) this.x = W - this.width;
    }

    draw(ctx) {
        // Update animation state
        this.updateState();

        // Get current sprite
        const sprite = this.getCurrentSprite();
        if (sprite) {
                if (this.facing === 'left') {
                    // Save state for flipped sprite
                    ctx.save();
                    ctx.translate(this.x + this.width, this.y);
                    ctx.scale(-1, 1);
                    ctx.drawImage(sprite, 0, 0, this.width, this.height);
                    ctx.restore();
                } else {
                    ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
                }
        }

        // Health bar
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x, this.y - 15, this.width, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x, this.y - 15, (this.width * this.health) / 100, 5);
    }

    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }
}

// Obstacle class
class Obstacle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = '#666';
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 80;
        this.height = 100;
    this.speed = 3; // Reduced player movement speed
        this.velX = 0;
        this.velY = 0;
        this.gravity = 0.5;
        this.jumpForce = -12;
        this.jetpackForce = -0.7;
        this.health = 100;
        this.bullets = [];
        this.facing = 'right';
        this.jetpackFuel = 100;
        this.maxJetpackFuel = 100;
        this.jetpackRechargeRate = 0.5;
        this.state = 'idle';
        this.frameIndex = 0;
        this.animationSpeed = 5;
        this.aimAngle = 0;

        // Weapon system
        this.currentWeapon = 'pistol';
        this.weapons = {
            pistol: { ...weapons.pistol, ammo: weapons.pistol.magazineSize, image: weapons.pistol.image },
            rifle: { ...weapons.rifle, ammo: weapons.rifle.magazineSize, image: weapons.rifle.image },
            shotgun: {
                ...weapons.shotgun,
                ammo: weapons.shotgun.magazineSize,
                image: weapons.shotgun.image,
                pellets: typeof weapons.shotgun.pellets === 'number' && weapons.shotgun.pellets > 0 ? weapons.shotgun.pellets : 8,
                spread: typeof weapons.shotgun.spread === 'number' ? weapons.shotgun.spread : 0.3
            },
            sniper: { ...weapons.sniper, ammo: weapons.sniper.magazineSize, image: weapons.sniper.image }
        };
        this.lastShootTime = 0;
        this.isReloading = false;
        this.reloadTimeout = null;
    }

    getCurrentSprite() {
        const state = spriteStates[this.state];
        if (!state) return null;
        return state.images[Math.floor(this.frameIndex / this.animationSpeed) % state.frames];
    }

    updateState() {
        // Determine animation state based on movement
        if (this.health <= 0) {
            this.state = 'dead';
        } else if (this.velY < 0 || this.velY > 1) {
            this.state = 'jump';
        } else if (Math.abs(this.velX) > 0.1) {
            this.state = Math.abs(this.velX) > 3 ? 'run' : 'walk';
        } else {
            this.state = 'idle';
        }

        // Update animation frame
        this.frameIndex++;
        if (this.frameIndex >= enemySpriteStates[this.state].frames * this.animationSpeed) {
            this.frameIndex = 0;
        }
    }

    update() {
        // Apply gravity
        this.velY += this.gravity;

        // Apply velocities
        this.x += this.velX;
        this.y += this.velY;

        // Ground collision
        if (this.y > H - this.height) {
            this.y = H - this.height;
            this.velY = 0;
        }

        // Wall collisions
        if (this.x < 0) this.x = 0;
        if (this.x > W - this.width) this.x = W - this.width;

        // Update facing direction based on movement and mouse position
        if (this.velX !== 0) {
            this.facing = this.velX > 0 ? 'right' : 'left';
        } else {
            // When not moving, face the mouse direction
            this.facing = mouseX > this.x + this.width / 2 ? 'right' : 'left';
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].update();
            if (this.bullets[i].isOffscreen()) {
                this.bullets.splice(i, 1);
            }
        }
        
        // Recharge jetpack when not using
        if (!keys['ShiftLeft'] && this.jetpackFuel < this.maxJetpackFuel) {
            this.jetpackFuel += this.jetpackRechargeRate;
        }
    }

    draw(ctx) {
        // Update animation state
        this.updateState();

        // Get current sprite
        const sprite = this.getCurrentSprite();
        if (sprite) {
            ctx.save();
            // Draw the sprite flipped if facing left
            if (this.facing === 'left') {
                ctx.translate(this.x + this.width, this.y);
                ctx.scale(-1, 1);
                ctx.drawImage(sprite, 0, 0, this.width, this.height);
            } else {
                ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
            }
            ctx.restore();
        }

        // Draw current weapon
        const weapon = this.weapons[this.currentWeapon];
        if (weapon.image.complete) {
            ctx.save();
            const weaponWidth = 40;
            const weaponHeight = 20;
            const weaponX = this.x + (this.facing === 'right' ? this.width/2 : this.width/2 - weaponWidth);
            const weaponY = this.y + this.height/2 - weaponHeight/2;

            // Calculate angle to mouse
            const angleToMouse = Math.atan2(
                mouseY - (this.y + this.height/2),
                mouseX - (this.x + this.width/2)
            );

            // Center the rotation on the player
            ctx.translate(this.x + this.width/2, this.y + this.height/2);
            ctx.rotate(angleToMouse);
            
            // Flip weapon if facing left
            if (this.facing === 'left') {
                ctx.scale(1, -1);
            }

            // Draw weapon at offset from rotation point
            ctx.drawImage(weapon.image, 0, -weaponHeight/2, weaponWidth, weaponHeight);
            ctx.restore();
        }

        // Draw health bar
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x, this.y - 15, this.width, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x, this.y - 15, (this.width * this.health) / 100, 5);

        // Draw jetpack fuel
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, this.y - 25, this.width, 5);
        ctx.fillStyle = 'yellow';
        ctx.fillRect(
            this.x,
            this.y - 25,
            (this.width * this.jetpackFuel) / this.maxJetpackFuel,
            5
        );

        // Draw ammo counter
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        const ammoText = `${weapon.ammo}/${weapon.magazineSize}`;
        ctx.fillText(ammoText, this.x + this.width/2 - ctx.measureText(ammoText).width/2, this.y - 35);
        
        if (this.isReloading) {
            ctx.fillText('Reloading...', this.x + this.width/2 - 30, this.y - 50);
        }

        // Draw bullets
        this.bullets.forEach(bullet => bullet.draw(ctx));
    }

    shoot(targetX, targetY) {
        const weapon = this.weapons[this.currentWeapon];
        const now = Date.now();

        // Check if can shoot
        if (this.isReloading || 
            now - this.lastShootTime < weapon.fireRate || 
            weapon.ammo <= 0) {
            return;
        }

        const startX = this.x + this.width / 2;
        const startY = this.y + this.height / 2;
        
        // Calculate base angle to target
        const angle = Math.atan2(targetY - startY, targetX - startX);

        // Handle different weapon types
        if (weapon.name === 'SawedOffShotgun') {
            // Shotgun spread pattern
            for (let i = 0; i < weapon.pellets; i++) {
                const spreadAngle = angle + (Math.random() - 0.5) * weapon.spread;
                const velocityX = Math.cos(spreadAngle) * weapon.bulletSpeed;
                const velocityY = Math.sin(spreadAngle) * weapon.bulletSpeed;
                
                this.bullets.push(new Bullet(
                    startX, 
                    startY, 
                    velocityX, 
                    velocityY, 
                    'shotgun',
                    weapon.damage
                ));
            }
        } else {
            // Regular guns
            const spreadAngle = angle + (Math.random() - 0.5) * weapon.spread;
            const velocityX = Math.cos(spreadAngle) * weapon.bulletSpeed;
            const velocityY = Math.sin(spreadAngle) * weapon.bulletSpeed;
            
            this.bullets.push(new Bullet(
                startX,
                startY,
                velocityX,
                velocityY,
                weapon.bulletType,
                weapon.damage
            ));
        }

        // Update weapon state
        weapon.ammo--;
        this.lastShootTime = now;

        // Auto reload when empty
        if (weapon.ammo <= 0) {
            this.reload();
        }
    }

    reload() {
        if (this.isReloading) return;
        
        const weapon = this.weapons[this.currentWeapon];
        this.isReloading = true;
        
        this.reloadTimeout = setTimeout(() => {
            weapon.ammo = weapon.magazineSize;
            this.isReloading = false;
        }, weapon.reloadTime);
    }

    useJetpack() {
        if (this.jetpackFuel > 0) {
            this.velY += this.jetpackForce;
            this.jetpackFuel -= 1;
        }
    }

    jump() {
        if (this.y === H - this.height) {
            this.velY = this.jumpForce;
        }
    }
}

// Bullet class
// Weapon definitions
const weapons = {
    pistol: {
        name: 'Luger',
        damage: 40, // Increased damage
        fireRate: 400,
        reloadTime: 1000,
        magazineSize: 12,
        bulletSpeed: 12,
        bulletType: 'pistol',
        image: new Image(),
        spread: 0.1,
        automatic: false
    },
    rifle: {
        name: 'AK47',
        damage: 60, // Increased damage
        fireRate: 100,
        reloadTime: 2000,
        magazineSize: 30,
        bulletSpeed: 15,
        bulletType: 'rifle',
        image: new Image(),
        spread: 0.15,
        automatic: true
    },
    shotgun: {
        name: 'SawedOffShotgun',
        damage: 30, // Increased damage
        fireRate: 800,
        reloadTime: 2500,
        magazineSize: 2,
        bulletSpeed: 10,
        bulletType: 'shotgun',
        spread: 0.3,
        pellets: 8,
        automatic: false
    },
    sniper: {
        name: 'M24',
        damage: 200, // Increased damage
        fireRate: 1200,
        reloadTime: 2000,
        magazineSize: 5,
        bulletSpeed: 20,
        bulletType: 'rifle',
        image: new Image(),
        spread: 0.02,
        automatic: false
    }
};

// Load weapon images with defensive guards
Object.entries(weapons).forEach(([_, weapon]) => {
    if (!weapon.image || !(weapon.image instanceof Image)) {
        weapon.image = new Image();
    }
    weapon.image.src = `images/GunsPack/Guns/${weapon.name}.png`;
});

// Bullet images with error handling
const bulletImages = {
    pistol: {
        small: new Image(),
        big: new Image()
    },
    rifle: {
        small: new Image(),
        big: new Image()
    },
    shotgun: {
        small: new Image(),
        big: new Image()
    }
};

// Default bullet image (a simple rectangle) for when images fail to load
const createDefaultBulletImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 10, 4);
    return canvas;
};

const defaultBulletImage = createDefaultBulletImage();

// Load bullet images with error handling
Object.keys(bulletImages).forEach(type => {
    if (!bulletImages[type] || typeof bulletImages[type] !== 'object') {
        bulletImages[type] = {};
    }
    if (!bulletImages[type].small || !(bulletImages[type].small instanceof Image)) {
        bulletImages[type].small = new Image();
    }
    if (!bulletImages[type].big || !(bulletImages[type].big instanceof Image)) {
        bulletImages[type].big = new Image();
    }
    
    // Map types to actual filenames in the Bullets folder
    const filenameMap = {
        pistol: { small: 'PistolAmmoSmall.png', big: 'PistolAmmoBig.png' },
        rifle: { small: 'RifleAmmoSmall.png', big: 'RifleAmmoBig.png' },
        shotgun: { small: 'ShotgunShellSmall.png', big: 'ShotgunShellBig.png' }
    };

    // Add error handlers before setting src
    bulletImages[type].small.onerror = () => {
        console.warn(`Failed to load bullet image: ${type} small`);
        bulletImages[type].small = defaultBulletImage;
    };
    bulletImages[type].big.onerror = () => {
        console.warn(`Failed to load bullet image: ${type} big`);
        bulletImages[type].big = defaultBulletImage;
    };

    const files = filenameMap[type] || filenameMap.pistol;
    bulletImages[type].small.src = `images/GunsPack/Bullets/${files.small}`;
    bulletImages[type].big.src = `images/GunsPack/Bullets/${files.big}`;
});

class Bullet {
    constructor(x, y, velocityX, velocityY, type, damage) {
        this.x = x;
        this.y = y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.type = type;
        this.damage = damage;
        this.width = 10;
        this.height = 4;
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
    }

    draw(ctx) {
        const img = bulletImages[this.type]?.small || defaultBulletImage;
        ctx.save();
        // Rotate bullet based on velocity
        const angle = Math.atan2(this.velocityY, this.velocityX);
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        try {
            ctx.drawImage(img, -this.width/2, -this.height/2, this.width, this.height);
        } catch (e) {
            // If image drawing fails, draw a simple rectangle
            ctx.fillStyle = '#fff';
            ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        }
        ctx.restore();
    }

    isOffscreen() {
        return this.x < 0 || this.x > MAP_WIDTH || this.y < 0 || this.y > H;
    }
}

// Collectable items
class Collectable {
    constructor(x, y, type = 'coin') {
        this.x = x;
        this.y = y;
        this.type = type; // 'coin', 'silver', 'heart'
        this.width = 32;
        this.height = 32;
        this.collected = false;
    }

    draw(ctx) {
        const img = kauzz.collectables[this.type];
        if (img && img.complete) {
            // If strip sprite, draw the leftmost frame (simple)
            try {
                ctx.drawImage(img, this.x, this.y, this.width, this.height);
            } catch (e) {
                ctx.fillStyle = 'yellow';
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        } else {
            ctx.fillStyle = this.type === 'heart' ? 'red' : 'yellow';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

function createCollectables() {
    items = [];
    // Place coins and a few hearts across the map
    for (let i = 0; i < 20; i++) {
        const x = 80 + Math.random() * (MAP_WIDTH - 160);
        const y = H - 150 - Math.random() * 80;
        items.push(new Collectable(x, y, Math.random() > 0.85 ? 'heart' : 'coin'));
    }
}

// Create player instance and input handling
const player = new Player(W / 2, H / 2);
const keys = {};

    // Input handlers
document.addEventListener('keydown', e => {
    keys[e.code] = true;
    
    // Weapon switching
    if (e.code === 'Digit1') player.currentWeapon = 'pistol';
    if (e.code === 'Digit2') player.currentWeapon = 'rifle';
    if (e.code === 'Digit3') player.currentWeapon = 'shotgun';
    if (e.code === 'Digit4') player.currentWeapon = 'sniper';
    
    // Manual reload
    if (e.code === 'KeyR') {
        player.reload();
    }
});

document.addEventListener('keyup', e => {
    keys[e.code] = false;
});

function checkCollisions() {
    // Player-Obstacle collisions
    for (const obstacle of obstacles) {
        if (player.x < obstacle.x + obstacle.width &&
            player.x + player.width > obstacle.x &&
            player.y < obstacle.y + obstacle.height &&
            player.y + player.height > obstacle.y) {
            
            // Collision resolution
            const overlapX = Math.min(player.x + player.width - obstacle.x, obstacle.x + obstacle.width - player.x);
            const overlapY = Math.min(player.y + player.height - obstacle.y, obstacle.y + obstacle.height - player.y);

            if (overlapX < overlapY) {
                // Horizontal collision
                if (player.x < obstacle.x) {
                    player.x = obstacle.x - player.width;
                } else {
                    player.x = obstacle.x + obstacle.width;
                }
                player.velX = 0;
            } else {
                // Vertical collision
                if (player.y < obstacle.y) {
                    player.y = obstacle.y - player.height;
                    player.velY = 0;
                } else {
                    player.y = obstacle.y + obstacle.height;
                    player.velY = 0;
                }
            }
        }
    }

    // Bullet-Enemy collisions
    for (let i = player.bullets.length - 1; i >= 0; i--) {
        const bullet = player.bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
                bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
                // Hit effect
                effects.push(new VisualEffect(bullet.x, bullet.y, 'hit'));
                popupTexts.push(new PopupText(
                    bullet.x,
                    bullet.y,
                    `-${bullet.damage}`,
                    '#ff0',
                    'bold 16px Arial'
                ));

                // Damage handling
                if (enemy.takeDamage(bullet.damage)) {
                    effects.push(new VisualEffect(
                        enemy.x + enemy.width/2,
                        enemy.y + enemy.height/2,
                        'explosion'
                    ));
                    enemies.splice(j, 1);
                    score += 100;
                    popupTexts.push(new PopupText(
                        enemy.x + enemy.width/2,
                        enemy.y,
                        '+100',
                        '#0f0',
                        'bold 20px Arial'
                    ));
                }
                player.bullets.splice(i, 1);
                break;
            }
        }
    }

    // Player-Enemy collisions
    for (const enemy of enemies) {
        if (player.x < enemy.x + enemy.width &&
            player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height &&
            player.y + player.height > enemy.y) {
            const oldHealth = player.health;
            player.health = Math.max(0, player.health - 1);
            
            if (oldHealth !== player.health) {
                // Damage effect
                effects.push(new VisualEffect(
                    player.x + player.width/2,
                    player.y + player.height/2,
                    'hit'
                ));
                
                // Screen shake effect
                canvas.classList.add('damage-flash');
                setTimeout(() => canvas.classList.remove('damage-flash'), 500);
                
                popupTexts.push(new PopupText(
                    player.x + player.width/2,
                    player.y,
                    '-1',
                    '#f00',
                    'bold 16px Arial'
                ));
            }

            if (player.health <= 0) {
                effects.push(new VisualEffect(
                    player.x + player.width/2,
                    player.y + player.height/2,
                    'explosion'
                ));
                endGame();
            }
        }
    }

    // Player-Item (collectable) collisions
    for (let k = items.length - 1; k >= 0; k--) {
        const it = items[k];
        if (player.x < it.x + it.width && player.x + player.width > it.x &&
            player.y < it.y + it.height && player.y + player.height > it.y) {
            // Pick up
            if (it.type === 'heart') {
                player.health = Math.min(100, player.health + 20);
                popupTexts.push(new PopupText(player.x + player.width/2, player.y, '+20 HP', '#0f0', 'bold 16px Arial'));
            } else {
                score += 10;
                popupTexts.push(new PopupText(player.x + player.width/2, player.y, '+10', '#ff0', 'bold 16px Arial'));
            }
            effects.push(new VisualEffect(it.x + it.width/2, it.y + it.height/2, 'hit'));
            items.splice(k, 1);
        }
    }
}

function updateUI() {
    // Update health bar
    const healthBar = document.getElementById('healthBar');
    if (healthBar) {
        healthBar.style.width = `${player.health}%`;
    }

    // Update jetpack bar
    const jetpackBar = document.getElementById('jetpackBar');
    if (jetpackBar) {
        jetpackBar.style.width = `${(player.jetpackFuel / player.maxJetpackFuel) * 100}%`;
    }

    // Update weapon info
    const weaponIcon = document.getElementById('weaponIcon');
    const ammoCount = document.getElementById('ammoCount');
    const weaponName = document.getElementById('weaponName');
    const currentWeapon = player.weapons[player.currentWeapon];

    if (weaponIcon) weaponIcon.src = `images/GunsPack/Guns/${currentWeapon.name}.png`;
    if (ammoCount) ammoCount.textContent = `${currentWeapon.ammo}/${currentWeapon.magazineSize}`;
    if (weaponName) weaponName.textContent = currentWeapon.name;

    // Update weapon slots
    document.querySelectorAll('.weapon-slot').forEach(slot => {
        slot.classList.toggle('active', slot.dataset.weapon === player.currentWeapon);
    });

    // Update score
    document.getElementById('score').textContent = score;
    document.getElementById('high').textContent = highScore;
}

function update() {
    if (!running) return;

    // Handle movement
    if (keys['KeyA'] || keys['ArrowLeft']) {
        player.velX = -player.speed;
        player.facing = 'left';
    } else if (keys['KeyD'] || keys['ArrowRight']) {
        player.velX = player.speed;
        player.facing = 'right';
    } else {
        player.velX = 0;
    }

    // Jump
    if (keys['KeyW'] || keys['ArrowUp']) {
        player.jump();
    }

    // Jetpack
    if (keys['ShiftLeft']) {
        player.useJetpack();
    }

    // Update player
    player.update();

    // Update enemies
    enemies.forEach(enemy => enemy.update());

    // Spawn enemies
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        spawnEnemy();
    }

    // Update effects
    effects = effects.filter(effect => effect.update());
    popupTexts = popupTexts.filter(text => text.update());

    // Check collisions
    checkCollisions();

    // Update UI
    updateUI();
}

// Moving 2D background
let bgOffset = 0;
function drawBackground() {
    // Layered parallax background using Kauzz assets when available
    if (kauzz.loaded) {
        // Clear
        ctx.save();
        ctx.fillStyle = '#8bbf7f';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        const layers = [
            { img: kauzz.backgrounds.bg, parallax: 0.2 },
            { img: kauzz.backgrounds.bgExt, parallax: 0.35 },
            { img: kauzz.backgrounds.midExt, parallax: 0.6 },
            { img: kauzz.backgrounds.mid, parallax: 0.75 }
        ];

        layers.forEach(layer => {
            const iw = layer.img.width || W;
            const ih = layer.img.height || H;
            // start drawing from left edge of view
            let startX = -((cameraX * layer.parallax) % iw) - iw;
            for (let x = startX; x < W; x += iw) {
                ctx.drawImage(layer.img, Math.round(x), 0, iw, ih);
            }
        });

        // Draw some midground trees/green overlay
        if (kauzz.backgrounds.midGreen.complete) {
            ctx.drawImage(kauzz.backgrounds.midGreen, 0, H - kauzz.backgrounds.midGreen.height, W, kauzz.backgrounds.midGreen.height);
        }

        // Draw collectable items in world space (they are drawn with camera transform in draw())
    } else {
        // fallback simple moving stripes
        bgOffset += 1.5;
        if (bgOffset > W) bgOffset = 0;
        ctx.save();
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#333';
        // Draw background stripes
        for (let x = -(cameraX % 80); x < W; x += 80) {
            ctx.fillRect(x, 0, 40, H);
        }
        ctx.restore();
    }
}

function draw() {
    drawBackground();

    // Save the original context state
    ctx.save();
    
    // Apply camera transform for all world objects
    ctx.translate(-cameraX, 0);

    // Draw debug info (fixed to view)
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.fillText(`Canvas Size: ${W} x ${H}`, cameraX + 10, 20);
    ctx.fillText(`Player Position: ${Math.round(player.x)}, ${Math.round(player.y)}`, cameraX + 10, 40);
    ctx.fillText(`Game Running: ${running}`, cameraX + 10, 60);

    // Draw obstacles
    obstacles.forEach(obstacle => obstacle.draw(ctx));

    // Draw collectable items (world space)
    items.forEach(item => item.draw(ctx));

    // Draw enemies
    enemies.forEach(enemy => enemy.draw(ctx));

    // Draw effects behind player
    effects.forEach(effect => effect.draw(ctx));

    // Draw player
    player.draw(ctx);

    ctx.restore(); // End camera offset

    // Draw aim line and crosshair
    const gradient = ctx.createLinearGradient(
        player.x + player.width / 2 - cameraX,
        player.y + player.height / 2,
        mouseX - cameraX,
        mouseY
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.moveTo(player.x + player.width / 2 - cameraX, player.y + player.height / 2);
    ctx.lineTo(mouseX - cameraX, mouseY);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw crosshair
    const crosshairSize = 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mouseX - crosshairSize, mouseY);
    ctx.lineTo(mouseX + crosshairSize, mouseY);
    ctx.moveTo(mouseX, mouseY - crosshairSize);
    ctx.lineTo(mouseX, mouseY + crosshairSize);
    ctx.stroke();

    // Draw popup texts (screen space)
    popupTexts.forEach(text => text.draw(ctx));
}

function gameLoop() {
    if (running) {
        update();
        draw();
    }
    animationFrameId = requestAnimationFrame(gameLoop);
}

// Game initialization
function startGame() {
    running = true;
    createObstacles();
    createCollectables();
    gameLoop();
}

function endGame() {
    running = false;
    if (score > highScore) {
        highScore = score;
    }
}

function update() {
    if (!running) return;

    // Handle movement
    if (keys['KeyA'] || keys['ArrowLeft']) {
        player.velX = -player.speed;
        player.facing = 'left';
    } else if (keys['KeyD'] || keys['ArrowRight']) {
        player.velX = player.speed;
        player.facing = 'right';
    } else {
        player.velX = 0;
    }

    // Jump
    if (keys['KeyW'] || keys['ArrowUp']) {
        player.jump();
    }

    // Jetpack
    if (keys['ShiftLeft']) {
        player.useJetpack();
    }

    // Update player
    player.update();

    // Update camera position to follow player
    if (player.x > W / 2 && player.x < MAP_WIDTH - W / 2) {
        cameraX = player.x - W / 2;
    }

    // Update enemies
    enemies.forEach(enemy => enemy.update());

    // Spawn enemies
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        spawnEnemy();
    }

    // Update effects
    effects = effects.filter(effect => effect.update());
    popupTexts = popupTexts.filter(text => text.update());

    // Check collisions
    checkCollisions();

    // Update UI
    updateUI();
}

// Reset game function
function resetGame() {
    // Reset game state
    score = 0;
    player.health = 100;
    player.jetpackFuel = player.maxJetpackFuel;
    enemies = [];
    effects = [];
    popupTexts = [];
    items = [];
    spawnTimer = 0;
    
    // Reset player position
    player.x = W / 2;
    player.y = H / 2;
    player.velX = 0;
    player.velY = 0;
    
    // Reset camera
    cameraX = 0;
    
    // Start game
    startGame();
}

// Initialize game
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

    // Make canvas responsive
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
    });
    
    // Create initial obstacles
    createObstacles();
    
    // Start the game
    startGame();
});
