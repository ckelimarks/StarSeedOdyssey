import * as THREE from 'https://esm.sh/three@0.128.0';
import {
    ROCKET_RADIUS,
    ROCKET_HEIGHT,
    ROCKET_COLOR,
    ROCKET_TRAVEL_DURATION,
    // PLAYER_RADIUS // Now needed for launch pad positioning potentially
} from './config.js';
// import { inventory, consumeRocketFuel } from './resources.js'; // No longer consuming fuel during flight

let sceneRef = null;
let rocketMesh = null;
let homePlanetRef = null; // Store reference to home planet
// let rocketVelocity = new THREE.Vector3(); // No longer needed

// --- New State Variables for Lerp Travel ---
let isActive = false;        // Is the rocket currently launched and travelling?
let isStationed = false;     // Is the rocket visible on the launch pad, ready?
let targetPlanet = null;     // Reference to the target planet object {mesh, config}
let launchPosition = new THREE.Vector3(); // World position where launch started
let launchTime = 0;          // Timestamp when launch began
let payloadSeeds = 0;      // NEW: Seeds carried by this rocket

// --- Temporary Vectors ---
const _targetPos = new THREE.Vector3();
const _currentPos = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _alignQuaternion = new THREE.Quaternion();
const _alignFromVector = new THREE.Vector3(0, 0, 1); // NEW: Represents rocket's forward axis after geom rotation

function initRocket(scene, homePlanet) {
    sceneRef = scene;
    homePlanetRef = homePlanet; // Store reference
    const geometry = new THREE.CylinderGeometry(0, ROCKET_RADIUS, ROCKET_HEIGHT, 8);
    // *** NEW: Rotate geometry so height aligns with local Z ***
    geometry.rotateX(Math.PI / 2); 

    const material = new THREE.MeshStandardMaterial({
        color: ROCKET_COLOR,
        emissive: 0xffffff, // Make it glow white
        emissiveIntensity: 1.5 // Adjust intensity as needed
    });
    rocketMesh = new THREE.Mesh(geometry, material);
    rocketMesh.visible = false; // Start hidden
    rocketMesh.name = 'rocket';
    rocketMesh.scale.set(5, 5, 5); // Scale the rocket mesh up to make it more visible
    homePlanet.add(rocketMesh); // ADDED to homePlanet
    console.log('Rocket initialized (simplified travel, attached to planet).');
}

// --- New Function: Place rocket on launch pad ---
// localPosition: Local coordinates relative to the planet center
// planetNormal: Local normal vector (direction from center to localPosition)
function placeRocketOnPad(localPosition) { // Removed planetNormal parameter for now
    if (!rocketMesh || isActive) return; // Don't place if already launched

    // Log the inputs
    console.log(`placeRocketOnPad called. Target Local Position: x=${localPosition.x.toFixed(2)}, y=${localPosition.y.toFixed(2)}, z=${localPosition.z.toFixed(2)}`);
    // console.log(`placeRocketOnPad Normal: x=${planetNormal.x.toFixed(2)}, y=${planetNormal.y.toFixed(2)}, z=${planetNormal.z.toFixed(2)}`);

    // Set position directly in parent's (planet's) local space
    rocketMesh.position.copy(localPosition);

    // Orient rocket to point straight "up" in local space (along the position vector from center)
    const localNormal = localPosition.clone().normalize(); 
    // *** UPDATED: Align the rotated geometry's forward axis (Z) with the local normal ***
    _alignQuaternion.setFromUnitVectors(_alignFromVector, localNormal);
    rocketMesh.quaternion.copy(_alignQuaternion);

    rocketMesh.visible = true;
    isStationed = true;
    console.log('Rocket placed on launch pad (local coordinates).');
}

// --- New Function: Hide rocket from launch pad ---
function hideRocketFromPad() {
    if (isStationed && !isActive) { // Only hide if it's stationed and not launched
        rocketMesh.visible = false;
        isStationed = false;
        console.log('Rocket removed from launch pad.');
    }
}

// --- Modified Launch Function ---
// startPosition: NOT USED anymore (calculated internally)
// targetPlanetObj: Object containing target { mesh: THREE.Mesh, config: object }
// seedCount: Number of seeds being launched
function launchRocket(targetPlanetObj, seedCount) { // Added seedCount parameter
    if (!rocketMesh || !isStationed || isActive || !homePlanetRef || !sceneRef) {
        console.log('Rocket/Refs not ready or already active.');
        return false;
    }
    if (!targetPlanetObj || !targetPlanetObj.config || !targetPlanetObj.mesh) {
        console.error('Launch Error: Invalid targetPlanetObj provided.');
        return false;
    }
    console.log(`Launching rocket with ${seedCount} seeds from pad towards ${targetPlanetObj.config.name}`);

    // 1. Get current world position BEFORE detaching
    rocketMesh.getWorldPosition(launchPosition);
    // console.log(`Rocket world launch position: ${launchPosition.x.toFixed(2)}, y=${launchPosition.y.toFixed(2)}, z=${launchPosition.z.toFixed(2)}`);

    // 2. Detach from planet and attach to scene
    homePlanetRef.remove(rocketMesh);
    sceneRef.add(rocketMesh);

    // 3. Re-apply world position after re-parenting
    rocketMesh.position.copy(launchPosition);
    
    // --- Rest of launch logic ---
    targetPlanet = targetPlanetObj; // Store the whole object
    payloadSeeds = seedCount;     // Store the payload
    launchTime = performance.now();

    isActive = true;
    isStationed = false; // No longer stationed

    // Initial orientation towards target
    targetPlanet.mesh.getWorldPosition(_targetPos);
    rocketMesh.lookAt(_targetPos);
    
    return true; // Indicate successful launch start
}

// --- Modified Update Function (Lerp Travel) ---
function updateRocket(deltaTime) { // deltaTime not strictly needed for lerp timing, but kept for consistency
    if (!isActive || !rocketMesh || !targetPlanet?.mesh) {
        return undefined; // Return undefined if not active or target invalid
    }

    const elapsedTime = (performance.now() - launchTime) / 1000; // Time in seconds
    const alpha = Math.min(elapsedTime / ROCKET_TRAVEL_DURATION, 1.0);

    // Get the target's CURRENT world position
    targetPlanet.mesh.getWorldPosition(_targetPos);

    // Interpolate position
    _currentPos.lerpVectors(launchPosition, _targetPos, alpha);
    rocketMesh.position.copy(_currentPos);

    // Keep rocket oriented towards the target
    rocketMesh.lookAt(_targetPos);

    // Check for arrival
    if (alpha >= 1.0) {
        const landingInfo = {
            name: targetPlanet.config.name,
            payload: payloadSeeds
        };
        console.log(`Rocket landed on ${landingInfo.name} with ${landingInfo.payload} seeds.`);
        
        // Reset rocket state
        isActive = false;
        payloadSeeds = 0; // Reset payload
        rocketMesh.visible = false;
        targetPlanet = null; // Clear target
        // Reset position? Optional, depends if reuse is needed without re-init
        // sceneRef.remove(rocketMesh); // Should we remove it from scene?
        // Maybe attach back to home planet, invisible?

        return landingInfo; // Return landing info
    }
    
    return undefined; // Return undefined if still travelling
}

function isRocketActive() {
    return isActive;
}

function isRocketStationed() {
    return isStationed;
}

// Export the mesh itself for camera tracking, and new functions
export {
    initRocket,
    placeRocketOnPad, // New
    hideRocketFromPad, // New
    launchRocket,
    updateRocket,
    isRocketActive,
    isRocketStationed, // New
    rocketMesh
}; 