// fireflies.js

import * as THREE from 'three';
// import { scene, directionalLight } from './scene.js'; // Assuming directionalLight is exported from scene.js
import { scene, starLight } from './scene.js'; // Use exported scene and starLight
import { homePlanet } from './planets.js'; // Assuming homePlanet mesh is exported

const FIREFLY_COUNT = 20; // Start with a conservative number
const FIREFLY_LIFESPAN = 10000; // 10 seconds in milliseconds
const FIREFLY_GLOW_DURATION_MIN = 1000; // 1 second
const FIREFLY_GLOW_DURATION_MAX = 3000; // 3 seconds
const FIREFLY_OFF_DURATION_MIN = 2000; // 2 seconds
const FIREFLY_OFF_DURATION_MAX = 5000; // 5 seconds

const FIREFLY_SIZE = 0.1;
const FIREFLY_COLOR_ON = new THREE.Color(0xffffaa);
const FIREFLY_COLOR_OFF = new THREE.Color(0x333300); // Very dim yellow
const FIREFLY_LIGHT_INTENSITY_ON = 0.8;
const FIREFLY_LIGHT_RANGE = 5; // How far the point light reaches

const fireflyPool = [];
const activeFireflies = new Set();

let planetRadius = 50; // Default, will be updated

// Helper function to get a random position on or near the planet surface
function getRandomPositionNearPlanet(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    // Add a slight offset so they are not exactly on the surface
    const offset = 1 + Math.random() * 2; // 1 to 3 units above surface
    return new THREE.Vector3(x, y, z).normalize().multiplyScalar(radius + offset);
}


function createFirefly() {
    const geometry = new THREE.SphereGeometry(FIREFLY_SIZE, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: FIREFLY_COLOR_OFF });
    const mesh = new THREE.Mesh(geometry, material);

    const pointLight = new THREE.PointLight(FIREFLY_COLOR_ON, 0, FIREFLY_LIGHT_RANGE);
    pointLight.castShadow = false; // Performance: fireflies don't cast shadows
    mesh.add(pointLight); // Attach light to the firefly mesh

    const firefly = {
        mesh,
        pointLight,
        isActive: false,
        spawnTime: 0,
        nextGlowToggleTime: 0,
        isGlowing: false,
        velocity: new THREE.Vector3(),
        // Target position for wandering behavior
        targetPosition: new THREE.Vector3(),
    };
    return firefly;
}

export function initFireflies(_homePlanetRef) {
    if (!_homePlanetRef || !_homePlanetRef.geometry) {
        console.warn("Home planet not ready for firefly initialization.");
        return;
    }
    planetRadius = _homePlanetRef.geometry.parameters.radius;

    for (let i = 0; i < FIREFLY_COUNT; i++) {
        fireflyPool.push(createFirefly());
    }
    console.log(`Firefly pool initialized with ${FIREFLY_COUNT} fireflies. Planet radius: ${planetRadius}`);
}

function spawnFirefly() {
    const firefly = fireflyPool.find(f => !f.isActive);
    if (!firefly) return null; // No available fireflies in pool

    firefly.isActive = true;
    firefly.spawnTime = Date.now();
    firefly.isGlowing = Math.random() > 0.5; // Start some on, some off
    firefly.mesh.material.color.set(firefly.isGlowing ? FIREFLY_COLOR_ON : FIREFLY_COLOR_OFF);
    firefly.pointLight.intensity = firefly.isGlowing ? FIREFLY_LIGHT_INTENSITY_ON : 0;
    firefly.nextGlowToggleTime = Date.now() + (firefly.isGlowing ?
        (FIREFLY_GLOW_DURATION_MIN + Math.random() * (FIREFLY_GLOW_DURATION_MAX - FIREFLY_GLOW_DURATION_MIN)) :
        (FIREFLY_OFF_DURATION_MIN + Math.random() * (FIREFLY_OFF_DURATION_MAX - FIREFLY_OFF_DURATION_MIN))
    );

    // Determine spawn position (e.g., on the dark side of the planet)
    const planetWorldPosition = new THREE.Vector3();
    homePlanet.getWorldPosition(planetWorldPosition); // Assuming homePlanet is accessible globally or passed in

    const sunDirection = new THREE.Vector3().copy(starLight.position).normalize();

    let spawnPosition;
    let attempts = 0;
    const maxAttempts = 20;
    do {
        spawnPosition = getRandomPositionNearPlanet(planetRadius);
        // Check if the position is on the "dark side" relative to the sun
        // Vector from planet center to spawn point
        const pointToPlanetCenterDir = spawnPosition.clone().sub(planetWorldPosition).normalize();
        attempts++;
    } while (pointToPlanetCenterDir.dot(sunDirection) > -0.2 && attempts < maxAttempts); // -0.2 to allow some twilight spawning

    if (attempts >= maxAttempts) { // Fallback if can't find a dark spot easily
        spawnPosition = getRandomPositionNearPlanet(planetRadius);
    }

    firefly.mesh.position.copy(spawnPosition);
    firefly.mesh.lookAt(planetWorldPosition); // Orient them somewhat towards the planet center initially

    // Initialize velocity for fluttering (simple random direction for now)
    firefly.velocity.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
    );
    firefly.targetPosition.copy(getRandomPositionNearPlanet(planetRadius)); // Initial wander target

    scene.add(firefly.mesh);
    activeFireflies.add(firefly);
    return firefly;
}


export function updateFireflies(deltaTime) {
    const now = Date.now();

    // Attempt to spawn new fireflies if below count and conditions are met
    if (activeFireflies.size < FIREFLY_COUNT && Math.random() < 0.1) { // Chance to spawn
        spawnFirefly();
    }

    activeFireflies.forEach(firefly => {
        if (!firefly.isActive) return;

        // Despawn if lifespan exceeded
        if (now > firefly.spawnTime + FIREFLY_LIFESPAN) {
            firefly.isActive = false;
            scene.remove(firefly.mesh);
            activeFireflies.delete(firefly);
            return;
        }

        // Toggle glow state
        if (now > firefly.nextGlowToggleTime) {
            firefly.isGlowing = !firefly.isGlowing;
            firefly.mesh.material.color.set(firefly.isGlowing ? FIREFLY_COLOR_ON : FIREFLY_COLOR_OFF);
            firefly.pointLight.intensity = firefly.isGlowing ? FIREFLY_LIGHT_INTENSITY_ON : 0;
            firefly.nextGlowToggleTime = now + (firefly.isGlowing ?
                (FIREFLY_GLOW_DURATION_MIN + Math.random() * (FIREFLY_GLOW_DURATION_MAX - FIREFLY_GLOW_DURATION_MIN)) :
                (FIREFLY_OFF_DURATION_MIN + Math.random() * (FIREFLY_OFF_DURATION_MAX - FIREFLY_OFF_DURATION_MIN))
            );
        }

        // Fluttering Movement
        // Simple wander: move towards targetPosition, then pick a new target
        const speed = 0.5 * deltaTime;
        const directionToTarget = firefly.targetPosition.clone().sub(firefly.mesh.position).normalize();
        firefly.velocity.lerp(directionToTarget, 0.05); // Smoothly turn towards target
        firefly.mesh.position.add(firefly.velocity.clone().multiplyScalar(speed));

        // Ensure fireflies stay near the planet surface
        const planetWorldPosition = new THREE.Vector3();
        homePlanet.getWorldPosition(planetWorldPosition);
        const directionFromPlanetCenter = firefly.mesh.position.clone().sub(planetWorldPosition).normalize();
        const desiredAltitude = planetRadius + 2 + Math.sin(now * 0.001 + firefly.spawnTime) * 0.5; // Bob up and down slightly
        firefly.mesh.position.copy(planetWorldPosition).add(directionFromPlanetCenter.multiplyScalar(desiredAltitude));


        if (firefly.mesh.position.distanceTo(firefly.targetPosition) < 1) {
            firefly.targetPosition.copy(getRandomPositionNearPlanet(planetRadius));
        }

        // Make them look somewhat towards their direction of movement (optional, can be tricky with surface snapping)
        // firefly.mesh.lookAt(firefly.mesh.position.clone().add(firefly.velocity));

    });
}

// Ensure scene and homePlanet are defined before use, or passed correctly.
// This basic structure needs to be integrated into the main game loop (main.js).
// And initFireflies called after scene and planets are initialized. 