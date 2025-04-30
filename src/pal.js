// src/pal.js
import * as THREE from 'https://esm.sh/three@0.128.0';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import * as config from './config.js'; // May need config later
import { // Import Pal Sound Functions (Simplified)
    startPalMovementSound, 
    stopPalMovementSound, 
    playPalArrivalSound 
} from './resources.js';

// Module-level variables
const loader = new GLTFLoader();

const PAL_MOVE_SPEED = 5.0;
const PAL_HOVER_HEIGHT = 1.5;
const PAL_FOLLOW_DISTANCE = 5.0;
const PAL_SMOOTHING_FACTOR = 0.05;
const PAL_MAX_DISTANCE_FROM_PLAYER = 15.0;
const PAL_CLAMP_THRESHOLD = 5.0; // How close to player before clamping kicks in hard
const PAL_SOUND_UPDATE_INTERVAL = 1000; // ms between positional sound updates

let palMesh = null;
let playerMeshRef = null; // Reference to the player's mesh
let homePlanetRef = null; // Reference to the home planet
let palTargetPosition = new THREE.Vector3();
let palSound = null;
let lastSoundUpdateTime = 0;
let isPalInitialized = false;

// --- Export the mesh --- 
export { palMesh }; 
// -----------------------

// --- Pal State ---
let palState = {
    mesh: null,
    velocity: new THREE.Vector3(),
    targetLookDirection: new THREE.Vector3(0, 0, 1), // Initial forward
    wasMovingTowardsPlayer: false, // NEW: Track pursuit state
    // Add other pal-specific state here later if needed (e.g., health)
};
// -----------------

// Temporary vectors
const _palWorldPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();
const _planetWorldPos = new THREE.Vector3();
const _planetCenter = new THREE.Vector3(); // Assuming planet is at world origin
const _palUp = new THREE.Vector3();
const _dirToPlayer = new THREE.Vector3();
const _tangentAccelDir = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();
const _origin = new THREE.Vector3(0, 0, 0);
const _vector3 = new THREE.Vector3(); // General purpose
const _modelUp = new THREE.Vector3(0, 1, 0);
const _alignmentQuaternion = new THREE.Quaternion();
const _flipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // Precompute flip
const _rockQuat = new THREE.Quaternion(); // For rocking animation
const _localRockAxis = new THREE.Vector3(0, 0, 1); // Local Z-axis for rocking

/**
 * Initializes the Pal character.
 * @param {THREE.Object3D} playerMesh - The player's mesh object (the root parent).
 * @param {THREE.Object3D} parentObject - The object to attach the pal to (e.g., homePlanet).
 */
export function initPal(playerMesh, parentObject) {
    console.log("Pal INIT: Initializing...");

    if (!playerMesh) {
        console.error("Pal INIT Error: playerMesh is required.");
        return;
    }
    if (!parentObject) {
        console.error("Pal INIT Error: parentObject is required.");
        return;
    }
    if (!parentObject.geometry || !parentObject.geometry.parameters) {
        console.error("Pal INIT Error: parentObject requires geometry with parameters (radius).");
        return;
    }

    // --- Assign arguments to module-level refs BEFORE loader call ---
    playerMeshRef = playerMesh; 
    homePlanetRef = parentObject;
    // -------------------------------------------------------------

    loader.load(
        'models/stuffed_toy_penguins_type_a/penguin.gltf',
        function (gltf) { // Success callback
            console.log("Pal INIT: Penguin GLTF model loaded.");
            const model = gltf.scene;

            // --- Assign to EXPORTED variable AND local state ---
            palMesh = model; // Assign to exported variable
            palState.mesh = palMesh; // Assign to local state object
            // ---------------------------------------------------

            palMesh.name = 'palPenguin';

            // Scaling
            const palScale = config.PLAYER_MODEL_SCALE * 1.2; // Using the updated scale
            palMesh.scale.set(palScale, palScale, palScale);

            // Shadows
            palMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Initial Positioning & Orientation
            const playerLocalPos = playerMeshRef.position.clone(); // Use playerMeshRef now
            const playerQuaternion = playerMeshRef.quaternion.clone(); // Use playerMeshRef now

            // Start pal at player's pos initially for alignment calc
            palMesh.position.copy(playerLocalPos);

            // Align pal with surface normal
            _palUp.copy(playerLocalPos).normalize(); // Normal based on player's local pos
            _alignmentQuaternion.setFromUnitVectors(_modelUp, _palUp);
            palMesh.quaternion.copy(_alignmentQuaternion);

            // Add to Parent BEFORE calculating offset
            homePlanetRef.add(palMesh); // Use homePlanetRef now
            console.log(`Pal INIT: Pal mesh added as child of ${homePlanetRef.name}`);

            // Apply Offset RELATIVE to Player's Local Frame
            const playerRight = new THREE.Vector3(1, 0, 0).applyQuaternion(playerQuaternion);
            const offsetDistance = 2.0; // Slightly increased offset
            palMesh.position.addScaledVector(playerRight, offsetDistance);
            console.log(`Pal INIT: Applied offset relative to player.`);

            // Final clamp to surface after offset
            const palFinalLocalPos = palMesh.position.clone();
            const planetRadius = homePlanetRef.geometry.parameters.radius;
            const palApproxRadius = config.PLAYER_RADIUS * 0.6; // Estimate pal radius based on scale multiplier
            const palTargetHeight = planetRadius + palApproxRadius;
            palFinalLocalPos.normalize().multiplyScalar(palTargetHeight);
            palMesh.position.copy(palFinalLocalPos);
            console.log(`Pal INIT: Clamped final position to surface.`);

            // --- Attach Positional Sound to Pal Mesh ---
            const sound = window.loadedSounds?.palMovementSound;
            if (sound && palMesh) { // Use palMesh here
                palMesh.add(sound);
                console.log("[Pal Sound] Attached positional sound to pal mesh.");
            } else {
                console.warn("[Pal Sound] Could not attach sound in init - sound or mesh not ready?");
            }
            // -------------------------------------------

            // Set initial look direction based on player
            const initialPlayerForward = new THREE.Vector3(0,0,-1).applyQuaternion(playerQuaternion);
            palState.targetLookDirection.copy(initialPlayerForward);
            // Apply initial flip to match orientation logic in update
            palMesh.quaternion.multiply(_flipQuat);

            isPalInitialized = true; // Set flag only on successful load

        },
        undefined, // onProgress callback
        function (error) { // Error callback
            console.error("Pal INIT: Error loading penguin GLTF:", error);
            palState.mesh = null; // Ensure mesh is null on error
        }
    );
}

/**
 * Updates the Pal character's state (following logic).
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D} playerMesh The player's mesh object.
 * @param {THREE.Object3D} homePlanet The home planet mesh.
 */
export function updatePal(deltaTime, playerMesh, homePlanet) {
    if (!palState.mesh || !playerMesh || !homePlanet || !homePlanet.geometry?.parameters?.radius) {
        return; // Don't update if not ready
    }

    const now = performance.now(); // Get current time for fade calculation

    const planetRadius = homePlanet.geometry.parameters.radius;
    const palApproxRadius = config.PLAYER_RADIUS * 0.6; // Same estimate as in init

    // Get world positions
    palState.mesh.getWorldPosition(_palWorldPos);
    playerMesh.getWorldPosition(_playerWorldPos);
    homePlanet.getWorldPosition(_planetWorldPos); // Usually (0,0,0) but good practice

    // Calculate pal's up vector (surface normal)
    _palUp.copy(_palWorldPos).sub(_planetWorldPos).normalize();

    // Calculate direction and distance to player
    _dirToPlayer.subVectors(_playerWorldPos, _palWorldPos);
    const distanceToPlayer = _dirToPlayer.length();

    // --- Determine Movement Intent --- 
    let shouldMoveTowardsPlayer = distanceToPlayer > config.PAL_STOPPING_DISTANCE;
    let isActivelyAccelerating = false; // Track if we apply acceleration force this frame
    let accelerationDirection = _vector3.set(0, 0, 0);
    
    if (distanceToPlayer > config.PAL_FOLLOW_DISTANCE) {
        // Far away: Accelerate towards player
        isActivelyAccelerating = true;
        _tangentAccelDir.copy(_dirToPlayer).sub(
            _palUp.clone().multiplyScalar(_dirToPlayer.dot(_palUp))
        ).normalize();
        if (_tangentAccelDir.lengthSq() > 1e-6) {
            accelerationDirection.copy(_tangentAccelDir);
        }
    } 
    // Between stopping and follow distance: Allow momentum/friction, don't accelerate
    // Closer than stopping distance: shouldMoveTowardsPlayer is false
    
    // --- Play Arrival Sound on Transition --- (NEW)
    if (palState.wasMovingTowardsPlayer && !shouldMoveTowardsPlayer) {
        playPalArrivalSound(); 
    }
    // --------------------------------------

    // Apply acceleration if decided
    if (isActivelyAccelerating && accelerationDirection.lengthSq() > 0) {
        palState.velocity.addScaledVector(accelerationDirection, config.PAL_ACCELERATION * deltaTime);
    }

    // Apply friction 
    palState.velocity.multiplyScalar(1.0 - (1.0 - config.PAL_FRICTION) * deltaTime * 60);
    
    // Apply extra dampening if stopped close
    if (!shouldMoveTowardsPlayer) {
        palState.velocity.multiplyScalar(0.8);
    }

    // Stop completely if velocity is very low
    if (palState.velocity.lengthSq() < 1e-8) {
        palState.velocity.set(0, 0, 0);
    }

    // Cap velocity
    if (palState.velocity.length() > config.PAL_MAX_VELOCITY) {
        palState.velocity.normalize().multiplyScalar(config.PAL_MAX_VELOCITY);
    }

    // --- Determine if Pal is moving (for sound/rocking) --- 
    const palSpeedSq = palState.velocity.lengthSq();
    const rockMovementThresholdSq = 0.1 * 0.1; // Threshold for visual rocking
    const soundStopThresholdSq = config.PAL_SOUND_STOP_THRESHOLD_SQ; // Use new threshold for sound
    const isMovingFastEnoughForSound = palSpeedSq > soundStopThresholdSq;
    const isMovingFastEnoughForRocking = palSpeedSq > rockMovementThresholdSq;
    // -----------------------------------

    // --- Handle Pal Movement Sound (Simplified for Positional Audio) --- 
    const sound = window.loadedSounds?.palMovementSound;
    if (sound) { // Check if sound object is loaded
        if (isMovingFastEnoughForSound && !sound.isPlaying) {
            startPalMovementSound(); 
        } else if (!isMovingFastEnoughForSound && sound.isPlaying) {
            stopPalMovementSound();
        }
    }
    // --- END Handle Pal Movement Sound ---

    // --- Position Update & Clamping ---
    // Only apply displacement if pal intends to move (not too close)
    if (shouldMoveTowardsPlayer) { 
        const deltaPosition = palState.velocity.clone().multiplyScalar(deltaTime);
        _palWorldPos.add(deltaPosition);
    } 

    // Clamp pal to the surface (always do this to correct position)
    const directionFromCenter = _vector3.copy(_palWorldPos).sub(_planetWorldPos);
    const targetDistance = planetRadius + palApproxRadius; 
    directionFromCenter.normalize().multiplyScalar(targetDistance);
    _palWorldPos.copy(_planetWorldPos).add(directionFromCenter);

    // Convert final world position back to LOCAL position relative to the planet
    palState.mesh.position.copy(homePlanet.worldToLocal(_palWorldPos.clone()));

    // --- Update Pal Orientation --- (Adapted from player)
    let targetForwardDir = palState.targetLookDirection.clone(); 
    const VELOCITY_LOOK_THRESHOLD_SQ = 0.01 * 0.01; 
    
    if (palSpeedSq > VELOCITY_LOOK_THRESHOLD_SQ) { // Look based on general velocity threshold
        const tangentVelocity = palState.velocity.clone().sub(
            _palUp.clone().multiplyScalar(palState.velocity.dot(_palUp))
        );
        if (tangentVelocity.lengthSq() > 1e-6) {
             targetForwardDir.copy(tangentVelocity).normalize();
             palState.targetLookDirection.copy(targetForwardDir); 
        }
    } else if (distanceToPlayer > config.PAL_FOLLOW_DISTANCE * 0.5) { 
         const tangentDirToPlayer = _dirToPlayer.clone().sub(
            _palUp.clone().multiplyScalar(_dirToPlayer.dot(_palUp))
        ).normalize();
         if (tangentDirToPlayer.lengthSq() > 1e-6) {
             targetForwardDir.copy(tangentDirToPlayer);
         }
    }
    // Else: Pal is stopped and close, keep looking previous direction

    // Set orientation using Quaternion from lookAt matrix
    if (targetForwardDir.lengthSq() > 1e-6) { // Check for valid forward dir
        _tempMatrix.lookAt(_origin, targetForwardDir, _palUp);
        // Target orientation WITHOUT rock
        const baseTargetQuat = _tempQuat.clone().setFromRotationMatrix(_tempMatrix);        
        // Apply 180-degree Y-axis flip
        baseTargetQuat.multiply(_flipQuat);

        // Final target includes potential rock
        const finalTargetQuat = baseTargetQuat.clone(); 

        // --- Add Rocking Animation (Conditional) --- 
        if (isMovingFastEnoughForRocking) { 
            const palSpeed = Math.sqrt(palSpeedSq);
            const speedFactor = Math.min(1.0, palSpeed / config.PAL_MAX_VELOCITY); 
            const dynamicRockSpeed = config.PAL_ROCK_SPEED * (0.5 + speedFactor * 0.5); // Rock faster as speed increases (range: 0.5x to 1.0x of PAL_ROCK_SPEED)
            
            const rockTime = now / 1000; // Reuse 'now' from earlier
            const currentRockAngle = Math.sin(rockTime * dynamicRockSpeed) * config.PAL_ROCK_ANGLE;
            _rockQuat.setFromAxisAngle(_localRockAxis, currentRockAngle);
            
            // Apply rock ON TOP of the base orientation
            finalTargetQuat.multiply(_rockQuat); 
        }
        // --- Else (not moving): Don't apply rock, target remains baseTargetQuat ---
        
        // Smoothly rotate towards the final target quaternion (includes rock if moving)
        if (!palState.mesh.quaternion.equals(finalTargetQuat)) { 
            const step = config.PAL_ROTATION_SPEED * deltaTime;
            palState.mesh.quaternion.rotateTowards(finalTargetQuat, step);
        }
    }
    
    // --- Update Pursuit State for Next Frame --- (NEW)
    palState.wasMovingTowardsPlayer = shouldMoveTowardsPlayer;
    // -----------------------------------------
}

/**
 * Returns the pal's mesh object.
 * @returns {THREE.Object3D | null}
 */
export function getPalMesh() {
    return palState.mesh;
} 