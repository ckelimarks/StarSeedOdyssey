import * as THREE from 'https://esm.sh/three@0.128.0';

// --- Particle Constants ---
const MAX_PARTICLES = 500; // Max number of particles in the system
const PARTICLE_LIFETIME = 0.75; // Seconds a particle lives
const EMISSION_RATE = 200; // Particles per second

// Colors (adjust for low-poly style)
const FIRE_START_COLOR = new THREE.Color(0xffdd00); // Bright yellow/orange
const FIRE_MID_COLOR = new THREE.Color(0xff6600);   // Orange/Red
const SMOKE_COLOR = new THREE.Color(0x444444);      // Dark grey

// --- Emitter State Object ---
// This will hold references needed for updating
let particleEmitterState = {
    points: null,
    geometry: null,
    material: null,
    attributes: {
        positions: null,
        colors: null,
        startTimes: null,
        velocities: null
    },
    currentIndex: 0, // To track where to spawn next particle
    particleCount: MAX_PARTICLES,
    emitterPosition: new THREE.Vector3() // Initialize as empty vector, will be set in create function
};

// --- Utility ---
// Linear interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}
// Color interpolation
function lerpColor(colorA, colorB, t) {
    const r = lerp(colorA.r, colorB.r, t);
    const g = lerp(colorA.g, colorB.g, t);
    const b = lerp(colorA.b, colorB.b, t);
    return new THREE.Color(r, g, b);
}


/**
 * Creates the particle system for the rocket trail.
 * @param {number} ROCKET_HEIGHT - Used to estimate nozzle position.
 * @returns {object} The particleEmitterState object.
 */
export function createRocketTrailEmitter(ROCKET_HEIGHT) {
    const geometry = new THREE.BufferGeometry();

    // --- Attributes ---
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const startTimes = new Float32Array(MAX_PARTICLES);
    const velocities = new Float32Array(MAX_PARTICLES * 3); // (vx, vy, vz)

    // Initialize attributes (optional, but good practice)
    for (let i = 0; i < MAX_PARTICLES; i++) {
        startTimes[i] = -1.0; // Mark as inactive initially
        // Initial position can be origin, will be reset on spawn
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        // Initial velocity can be zero
        velocities[i * 3] = 0;
        velocities[i * 3 + 1] = 0;
        velocities[i * 3 + 2] = 0;
        // Initial color (can be anything, will be overwritten)
        colors[i * 3] = SMOKE_COLOR.r;
        colors[i * 3 + 1] = SMOKE_COLOR.g;
        colors[i * 3 + 2] = SMOKE_COLOR.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); // Mark for updates
    geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.startTime.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.velocity.setUsage(THREE.DynamicDrawUsage);

    // --- Material ---
    const material = new THREE.PointsMaterial({
        size: 1.5, // Adjust particle size
        vertexColors: true, // Use colors from attribute
        transparent: true,
        opacity: 0.8, // Initial opacity (will be controlled by color alpha later if needed)
        blending: THREE.AdditiveBlending, // Good for fire effect
        depthWrite: false // Important for blending
        // map: createParticleTexture(), // Optional: Add texture later
    });

    // --- Points Object ---
    const points = new THREE.Points(geometry, material);
    points.name = "rocketTrailParticles";
    points.frustumCulled = false; // Prevent clipping

    // Store references in the state object
    particleEmitterState.points = points;
    particleEmitterState.geometry = geometry;
    particleEmitterState.material = material;
    particleEmitterState.attributes.positions = positions;
    particleEmitterState.attributes.colors = colors;
    particleEmitterState.attributes.startTimes = startTimes;
    particleEmitterState.attributes.velocities = velocities;
    particleEmitterState.emitterPosition.set(0, 0, -ROCKET_HEIGHT * 0.2); // Adjusted emitter origin much closer to cone base

    console.log("Particle Emitter created.");
    return particleEmitterState;
}

/**
 * Updates the particle system animation (CPU version).
 * @param {number} deltaTime Time since last frame.
 * @param {boolean} isPreLaunching Is the rocket in the pre-launch phase?
 * @param {boolean} isFlying Is the rocket actively flying (after prelaunch, before landing)?
 */
export function updateParticlesCPU(deltaTime, isPreLaunching, isFlying) {
    const state = particleEmitterState;
    const attributes = state.attributes;
    const positions = attributes.positions;
    const colors = attributes.colors;
    const startTimes = attributes.startTimes;
    const velocities = attributes.velocities;
    const now = performance.now() / 1000; // Current time in seconds

    let needsPositionUpdate = false;
    let needsColorUpdate = false;

    // --- Update Existing Particles ---
    for (let i = 0; i < state.particleCount; i++) {
        if (startTimes[i] < 0) continue; // Skip inactive particles

        const age = now - startTimes[i];

        if (age > PARTICLE_LIFETIME) {
            // Particle is dead
            startTimes[i] = -1.0; // Mark as inactive
            // Optional: Reset position/color/velocity? Or just let spawn overwrite
            positions[i * 3 + 1] = -10000; // Move dead particles far away instantly
            needsPositionUpdate = true;
            continue; // Go to next particle
        }

        // Update position
        const idx3 = i * 3;
        positions[idx3] += velocities[idx3] * deltaTime;
        positions[idx3 + 1] += velocities[idx3 + 1] * deltaTime;
        positions[idx3 + 2] += velocities[idx3 + 2] * deltaTime;
        needsPositionUpdate = true;

        // Update color based on age (Fire -> Smoke)
        const lifeRatio = age / PARTICLE_LIFETIME; // 0.0 -> 1.0
        let currentColor;
        if (lifeRatio < 0.3) { // Fire phase (Yellow -> Orange)
             currentColor = lerpColor(FIRE_START_COLOR, FIRE_MID_COLOR, lifeRatio / 0.3);
        } else { // Smoke phase (Orange -> Grey)
             currentColor = lerpColor(FIRE_MID_COLOR, SMOKE_COLOR, (lifeRatio - 0.3) / 0.7);
        }
        colors[idx3] = currentColor.r;
        colors[idx3 + 1] = currentColor.g;
        colors[idx3 + 2] = currentColor.b;
        needsColorUpdate = true;

        // TODO: Update size or alpha based on age?
        // Example: state.material.opacity = 1.0 - lifeRatio; (Needs changes to material)
    }

    const shouldEmit = isPreLaunching || isFlying; // Determine emission based on separate flags

    // --- Spawn New Particles ---
    if (shouldEmit) {
        const particlesToSpawn = Math.floor(EMISSION_RATE * deltaTime);
        const spawnCount = Math.max(1, particlesToSpawn); // Spawn at least 1 if active and dt > 0

        for (let j = 0; j < spawnCount; j++) {
            const i = state.currentIndex; // Get the index to spawn at

            // Check if this slot is actually inactive (it should be if pool is large enough)
            // if (startTimes[i] < 0) { ... } // Can add this check if needed

            // Reset Start Time
            startTimes[i] = now;

            // Reset Position to emitter origin (relative to parent)
            const idx3 = i * 3;
            positions[idx3] = state.emitterPosition.x;
            positions[idx3 + 1] = state.emitterPosition.y;
            positions[idx3 + 2] = state.emitterPosition.z;

            // Reset Velocity
            const angle = Math.random() * Math.PI * 2;
            let spread = 0.5; // Default spread
            let zVel = -(Math.random() * 2 + 2.0); // Default Z velocity
            let xSpeedMult = (Math.random() * 0.5 + 0.5);
            let ySpeedMult = (Math.random() * 0.5 + 0.5);

            // --- Adjust velocity for pre-launch ---
            if (isPreLaunching) {
                spread = 2.5; // Much wider spread
                zVel = -(Math.random() * 1.0 + 1.0); // Negative Z-vel again, maybe slightly less strong than flight
                // console.log("Using wide pre-launch particle emission."); // DEBUG
                // Increase initial speed for pre-launch burst
                xSpeedMult = (Math.random() * 0.8 + 0.7); // Faster X spread
                ySpeedMult = (Math.random() * 0.8 + 0.7); // Faster Y spread
            }
            // -------------------------------------

            velocities[idx3] = Math.cos(angle) * spread * xSpeedMult;
            velocities[idx3 + 1] = Math.sin(angle) * spread * ySpeedMult;
            velocities[idx3 + 2] = zVel;

            // Reset Color to start color
            colors[idx3] = FIRE_START_COLOR.r;
            colors[idx3 + 1] = FIRE_START_COLOR.g;
            colors[idx3 + 2] = FIRE_START_COLOR.b;

            needsPositionUpdate = true;
            needsColorUpdate = true;
            // Could also update startTime attribute needsUpdate flag

            // Move to next index for spawning
            state.currentIndex = (state.currentIndex + 1) % state.particleCount;
        }
    }

    // --- Update Geometry Attributes ---
    if (needsPositionUpdate) {
        state.geometry.attributes.position.needsUpdate = true;
    }
    if (needsColorUpdate) {
        state.geometry.attributes.color.needsUpdate = true;
    }
    // state.geometry.attributes.startTime.needsUpdate = true; // Update if necessary
    // state.geometry.attributes.velocity.needsUpdate = true; // Only if velocity changes over time
}

// --- Optional: Texture Creation ---
/*
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');

    // Simple circle
    context.beginPath();
    context.arc(16, 16, 14, 0, Math.PI * 2);
    context.fillStyle = 'white';
    context.fill();

    // Sharp diamond/square (for low poly?)
    // context.fillStyle = 'white';
    // context.fillRect(8, 8, 16, 16); // Square
    // context.translate(16, 16);
    // context.rotate(Math.PI / 4); // Rotate for diamond
    // context.fillRect(-8, -8, 16, 16);


    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}
*/ 