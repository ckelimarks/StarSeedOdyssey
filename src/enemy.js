import * as THREE from 'https://esm.sh/three@0.128.0';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import * as config from './config.js'; // Import config for potential future use
import { getRandomPositionOnPlanet } from './utils.js'; // <<< NEW: Import utility

// --- Enemy States Enum ---
const EnemyAIState = {
    PATROLLING: 'PATROLLING',
    HUNTING: 'HUNTING',
    SCANNING: 'SCANNING' // <<< NEW STATE
};
// -----------------------

// --- Behavior Constants ---
const SCAN_CHANCE = 0.3; // 30% chance to scan after reaching patrol point
const MIN_SCAN_DURATION = 2.0; // seconds
const MAX_SCAN_DURATION = 5.0; // seconds
const SCAN_ROTATION_SPEED = Math.PI * 0.2; // Radians per second (slow rotation)
const HUNT_GIVE_UP_TIME = 3.0; // Seconds to hunt before giving up
const HUNT_DETECTION_DURATION = 1.0; // <<< NEW: Seconds player must be seen to trigger hunt
const NUM_PATROL_POINTS = 50; // <<< NEW: Number of points for systematic patrol
const SPOTLIGHT_SENSITIVITY_FACTOR = 0.75; // <<< RE-ENABLED sensitivity adjustment // Sensitivity at MAX distance
const SPOTLIGHT_SENSITIVITY_AT_MIN_DIST = 1.0; // <<< NEW: Sensitivity multiplier when player is very close
const HUNT_PREDICTION_ERROR_DISTANCE = 2.0; // <<< NEW: How much inaccuracy when hunting
const SPOTLIGHT_TRACKING_SPEED = 6.0; // <<< INCREASED AGAIN
const DETECTION_SOUND_COOLDOWN = 3.0; // <<< NEW: Cooldown for roar/siren sounds
// ------------------------

// Module-level variables
const loader = new GLTFLoader();
let homePlanetRef = null;

// --- Enemy State ---
let enemyState = {
    mesh: null,
    mixer: null, // Animation Mixer
    animations: [], // Loaded animation clips
    actions: { // Store specific actions by name/purpose
        walk: null,
        idle: null
    },
    isInitialized: false,
    spotLight: null, // Added for spotlight
    spotLightHelper: null, // <<< RE-ADD Helper property
    lightOriginMarker: null, // <<< NEW: Marker for light origin
    spotLightTargetHelper: null, // <<< NEW: Default target object
    // --- Movement State ---
    velocity: new THREE.Vector3(),
    targetLookDirection: new THREE.Vector3(0, 0, 1), // Initial forward relative to initial orientation
    // --- AI State ---
    currentState: EnemyAIState.PATROLLING, // Start patrolling
    scanTimer: 0, 
    scanDuration: 0, 
    timeSincePlayerSeen: 0, // <<< NEW: Timer for giving up hunt
    lastKnownPlayerWorldPos: new THREE.Vector3(), // <<< NEW: Last place player was seen
    currentPatrolPointIndex: 0, // <<< NEW: Index for Fibonacci lattice patrol
    timeInSpotlight: 0, // <<< NEW: Timer for hunt detection delay
    // --- Sound State ---
    isMovingSoundPlaying: false, // Track if the movement sound is active
    isScanningSoundPlaying: false, // <<< NEW: Track if scanning sound is active
    // ---------------
    statusText: "Initializing", // Current action description
    lastDetectionSoundTime: 0, // <<< NEW: Timestamp for cooldown
    // --------------------
};
// ------------------

// Temporary vectors
const _enemyWorldPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3(); // NEW: Need player position
const _planetWorldPos = new THREE.Vector3(); // NEW: Need planet position
const _planetCenter = new THREE.Vector3(); // Assuming planet is at world origin
const _enemyUp = new THREE.Vector3();
const _modelUp = new THREE.Vector3(0, 1, 0); // Assume Y-up for model
const _alignmentQuaternion = new THREE.Quaternion();
const _dirToPlayer = new THREE.Vector3(); // NEW
const _tangentAccelDir = new THREE.Vector3(); // NEW
const _tempMatrix = new THREE.Matrix4(); // NEW
const _tempQuat = new THREE.Quaternion(); // NEW
const _origin = new THREE.Vector3(0, 0, 0); // NEW
const _vector3 = new THREE.Vector3(); // NEW: General purpose temp

// --- NEW: Vision Check Vectors ---
const _spotLightWorldPos = new THREE.Vector3();
const _spotLightWorldDir = new THREE.Vector3();
const _dirToPlayerFromLight = new THREE.Vector3();
// --------------------------------

// --- Fibonacci Lattice Helper ---
const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio

function getFibonacciLatticePoint(index, totalPoints) {
    const i = index + 0.5; // Offset index
    const y = 1 - (2 * i) / totalPoints; // Y goes from 1 down to -1
    const radius = Math.sqrt(1 - y * y); // Radius at y
    const theta = (2 * Math.PI * i) / phi; // Golden angle increment
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    return new THREE.Vector3(x, y, z); // Return unit vector direction
}
// ------------------------------

/**
 * Checks if the player mesh is within the enemy's spotlight cone and distance.
 * @param {THREE.Object3D} playerMesh - The player's mesh.
 * @returns {boolean} True if the player is detected, false otherwise.
 */
function isPlayerInSpotlight(playerMesh) {
    if (!enemyState.spotLight || !playerMesh || !enemyState.mesh) {
        return false;
    }

    const spotLight = enemyState.spotLight;

    // Get world positions
    spotLight.getWorldPosition(_spotLightWorldPos);
    playerMesh.getWorldPosition(_playerWorldPos); // Use existing _playerWorldPos

    // Calculate vector from light source to player
    _dirToPlayerFromLight.subVectors(_playerWorldPos, _spotLightWorldPos);
    const distanceToPlayerSq = _dirToPlayerFromLight.lengthSq();

    // 1. Check distance
    const maxDistSq = spotLight.distance * spotLight.distance;
    // --- DEBUG LOG ---
    // console.log(`[Vision Check] DistSq: ${distanceToPlayerSq.toFixed(1)}, MaxDistSq: ${maxDistSq.toFixed(1)}`);
    // ---------------
    if (distanceToPlayerSq > maxDistSq) {
        return false; // Player is outside the spotlight range
    }

    // --- Calculate Dynamic Sensitivity ---
    const normalizedDistance = Math.sqrt(distanceToPlayerSq) / spotLight.distance; // 0.0 (close) to 1.0 (far)
    const dynamicSensitivity = SPOTLIGHT_SENSITIVITY_AT_MIN_DIST + (SPOTLIGHT_SENSITIVITY_FACTOR - SPOTLIGHT_SENSITIVITY_AT_MIN_DIST) * normalizedDistance;
    // -----------------------------------

    // 2. Check angle
    // Get the spotlight's world direction (direction it's pointing)
    // We need the target's world position (which is currently the player mesh)
    // Note: If target changes, this needs adjustment.
    // spotLight.getWorldDirection(_spotLightWorldDir); // <<< NEW: Get actual direction <<< REVERTING THIS
    // --- Calculate direction based on target --- 
    spotLight.target.getWorldPosition(_vector3); // Get current target's world position
    _spotLightWorldDir.subVectors(_vector3, _spotLightWorldPos).normalize(); // Direction = Target - Source
    // -----------------------------------------

    // Normalize the direction to the player from the light
    // (We already calculated this vector, just need to normalize its copy)
    const _normalizedDirToPlayer = _dirToPlayerFromLight.normalize(); // Normalize the existing vector

    // Calculate the angle between the spotlight direction and the direction to the player
    const angle = _spotLightWorldDir.angleTo(_normalizedDirToPlayer);
    
    // Compare with half the spotlight's cone angle, adjusted by dynamic sensitivity
    // const detectionAngleThreshold = (spotLight.angle / 2) * SPOTLIGHT_SENSITIVITY_FACTOR; // <<< OLD: Fixed sensitivity
    const detectionAngleThreshold = (spotLight.angle / 2) * dynamicSensitivity; // <<< NEW: Dynamic sensitivity
    // --- DEBUG LOG ---
    // console.log(`[Vision Check] Angle: ${angle.toFixed(2)}, Threshold: ${detectionAngleThreshold.toFixed(2)} (Raw Angle: ${(spotLight.angle / 2).toFixed(2)}, DynSens: ${dynamicSensitivity.toFixed(2)})`);
    // ---------------
    if (angle > detectionAngleThreshold) { 
        return false; // Player is outside the cone angle
    }
    
    // console.log("[Vision Check] Player SEEN!"); // Debug
    return true; // Player is within distance and angle
}

/**
 * Initializes the Enemy bot.
 * @param {THREE.Scene} scene - The main scene.
 * @param {THREE.Object3D} homePlanet - The object to attach the enemy to.
 */
export function initEnemy(scene, homePlanet) {
    console.log("Enemy INIT: Initializing...");
    if (!homePlanet || !homePlanet.geometry || !homePlanet.geometry.parameters) {
        console.error("Enemy INIT Error: Valid homePlanet object is required.");
        return null; // Return null or handle error appropriately
    }
    homePlanetRef = homePlanet; // Store reference

    loader.load(
        'models/spider_bot/scene.gltf',
        function (gltf) { // Success callback
            console.log("Enemy INIT: Spider Bot GLTF model loaded.");
            const model = gltf.scene;
            enemyState.mesh = model;
            enemyState.animations = gltf.animations; // Store animations

            model.name = 'spiderBot';

            // Scaling (adjust as needed)
            const enemyScale = config.PLAYER_MODEL_SCALE * 0.25; // REDUCED scale factor significantly
            model.scale.set(enemyScale, enemyScale, enemyScale);

            // Shadows
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // --- Initial Positioning & Orientation ---
            const planetRadius = homePlanetRef.geometry.parameters.radius;
            
            // --- Place near player start (North Pole) with an offset ---
            const playerStartDirection = new THREE.Vector3(0, 1, 0); // North Pole direction
            const angleOffset = Math.PI / 8; // Offset angle (adjust as needed)
            const rotationAxis = new THREE.Vector3(0, 0, 1); // Rotate around Z-axis
            const offsetQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angleOffset);
            const initialDirection = playerStartDirection.clone().applyQuaternion(offsetQuat);
            
            // Set final position slightly above surface
            // Adjust verticalOffset based on model visual center vs origin
            const verticalOffset = 1.0; // TRY 1.0 - Adjust based on model geometry and scale
            const initialPosition = initialDirection.normalize().multiplyScalar(planetRadius + verticalOffset);
            model.position.copy(initialPosition); // Set initial position
            // ---------------------------------------------------------

            // --- Align to new surface normal ---
            const surfaceNormal = initialPosition.clone().normalize(); // Normal points outwards from center
            _alignmentQuaternion.setFromUnitVectors(_modelUp, surfaceNormal);
            model.quaternion.copy(_alignmentQuaternion);

            // --- Apply 180-degree flip around local Y-axis ---
            const flipAxis = new THREE.Vector3(0, 1, 0); // Local Y
            const flipAngle = Math.PI; // 180 degrees
            const flipQuat = new THREE.Quaternion().setFromAxisAngle(flipAxis, flipAngle);
            model.quaternion.multiply(flipQuat);
            // -------------------------------------------------

            // --- Apply 90-degree Counter-Clockwise Rotation (Local Y) ---
            const rotateAxis = new THREE.Vector3(0, 1, 0); // Local Y
            const rotateAngle = Math.PI / 2; // 90 degrees counter-clockwise
            const rotate90Quat = new THREE.Quaternion().setFromAxisAngle(rotateAxis, rotateAngle);
            model.quaternion.multiply(rotate90Quat); // Apply the additional rotation
            // ---------------------------------------------------------
            // ----------------------------------

            // Add to Parent
            homePlanetRef.add(model);
            console.log(`Enemy INIT: Spider Bot mesh added as child of ${homePlanetRef.name}`);

            // --- Add Spotlight ---
            const spotLight = new THREE.SpotLight(0xffffff, 140, 50, Math.PI / 6, 0.5, 1.5); // <<< Reverted angle back to PI/6
            spotLight.castShadow = true;
            spotLight.shadow.mapSize.width = 1024;
            spotLight.shadow.mapSize.height = 1024;
            spotLight.shadow.camera.near = 1;
            spotLight.shadow.camera.far = 50;

            // Position the spotlight slightly above/in front of the bot model origin
            spotLight.position.set(-1.0, 0.75, 0); // <<< HALVED offset

            // Create and position the target object
            // const spotLightTarget = new THREE.Object3D();
            // spotLightTarget.position.set(0, 0, 10); // <<< RESET Target to be directly in front (local Z)
            // model.add(spotLightTarget); // Add target as child of the bot model

            // spotLight.target = spotLightTarget; // Set the target for the spotlight
            spotLight.target = model; // <<< Target the model origin directly
            model.add(spotLight); // Add the spotlight itself as a child of the bot model
            enemyState.spotLight = spotLight; // Store reference if needed
            console.log("Enemy INIT: Added spotlight targeting model origin."); // Updated log
            
            // --- ADD Spotlight Helper ---
            const spotLightHelper = new THREE.SpotLightHelper(spotLight);
            scene.add(spotLightHelper); // Add helper to the main scene
            enemyState.spotLightHelper = spotLightHelper; // Store reference
            console.log("Enemy INIT: Added SpotLightHelper to the scene.");
            // --------------------------
            
            // --- Add Emissive Sphere at Light Origin ---
            const markerGeo = new THREE.SphereGeometry(0.15, 8, 8); // Small sphere
            const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 10 }); // <<< NEW
            const lightOriginMarker = new THREE.Mesh(markerGeo, markerMat);
            // No need to set position, it's relative to the parent (the spotlight)
            spotLight.add(lightOriginMarker); // Add marker as child of the light
            enemyState.lightOriginMarker = lightOriginMarker; // Store if needed
            console.log("Enemy INIT: Added light origin marker.");
            // -----------------------------------------

            // --- Add Smaller Red Emissive Sphere ---
            const redMarkerRadius = 0.15 / 2; // Half the original size
            const redMarkerGeo = new THREE.SphereGeometry(redMarkerRadius, 8, 8);
            const redMarkerMat = new THREE.MeshStandardMaterial({ 
                color: 0xff0000, 
                emissive: 0xff0000, 
                emissiveIntensity: 10 
            });
            const redLightOriginMarker = new THREE.Mesh(redMarkerGeo, redMarkerMat);
            // Position is relative to parent (spotLight)
            const whiteSphereRadius = 0.15;
            const redMarkerOffset = whiteSphereRadius * 8; // Renamed variable
            redLightOriginMarker.position.set(0, redMarkerOffset, 0); // Set Y position relative to spotlight origin
            spotLight.add(redLightOriginMarker);
            // enemyState.redLightOriginMarker = redLightOriginMarker; // Optional: Store reference
            console.log("Enemy INIT: Added smaller red light origin marker.");
            // -----------------------------------------

            // --- Create Default Spotlight Target Helper ---
            const spotLightTargetHelper = new THREE.Object3D();
            // Position it relative to the *enemy model* origin
            // After initial rotations, local +Z is likely forward
            spotLightTargetHelper.position.set(-15, 0, 0); // <<< TRY LOCAL -X AXIS
            model.add(spotLightTargetHelper); // Add as child of the enemy model
            enemyState.spotLightTargetHelper = spotLightTargetHelper; // Store reference
            console.log("Enemy INIT: Created spotlight target helper.");
            // --------------------------------------------

            // --- Visualize Patrol Points ---
            const pointGeo = new THREE.SphereGeometry(0.2, 6, 4); // Small sphere
            const pointMat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
            const planetCenter = homePlanetRef.position.clone(); // Assume planet center is its position
            const visualPointHeight = 0.1; // Slightly above surface

            console.log(`Enemy INIT: Visualizing ${NUM_PATROL_POINTS} patrol points...`);
            for (let i = 0; i < NUM_PATROL_POINTS; i++) {
                const direction = getFibonacciLatticePoint(i, NUM_PATROL_POINTS);
                const pointPos = direction.multiplyScalar(planetRadius + visualPointHeight);
                pointPos.add(planetCenter); // Add planet's offset if any

                const pointMesh = new THREE.Mesh(pointGeo, pointMat);
                pointMesh.position.copy(homePlanetRef.worldToLocal(pointPos.clone())); // Convert to local space of planet
                homePlanetRef.add(pointMesh); // Add as child of planet
            }
            console.log("Enemy INIT: Patrol point visualization complete.");
            // -------------------------------

            // --- Initialize Animation Mixer ---
            if (enemyState.animations && enemyState.animations.length > 0) {
                enemyState.mixer = new THREE.AnimationMixer(model);
                
                // Find walk and idle animations (assuming walk is first, idle by name)
                let walkClip = enemyState.animations[0]; // Assume first is walk
                let idleClip = enemyState.animations.find(clip => clip.name.toLowerCase().includes('idle'));

                if (walkClip) {
                    enemyState.actions.walk = enemyState.mixer.clipAction(walkClip);
                    // Start walk animation initially, fade it in
                    enemyState.actions.walk.play();
                     enemyState.actions.walk.fadeIn(0.5);
                     console.log(`Enemy INIT: Playing walk animation: ${walkClip.name || 'default'}`);
                } else {
                    console.warn("Enemy INIT: Could not find walk animation clip.");
                }

                if (idleClip) {
                    enemyState.actions.idle = enemyState.mixer.clipAction(idleClip);
                    enemyState.actions.idle.weight = 0; // Start idle faded out
                    enemyState.actions.idle.play(); 
                    console.log(`Enemy INIT: Found idle animation: ${idleClip.name}`);
                } else {
                    console.log("Enemy INIT: No specific 'idle' animation found. Walk animation will stop/pause during scan.");
                }

            } else {
                console.log("Enemy INIT: No animations found in the model.");
            }
            // ---------------------------------

            // --- Attach Movement Sound --- (NEW)
            const movementSound = window.loadedSounds?.enemyMovementSound;
            if (movementSound) {
                model.add(movementSound); // Attach sound directly to the enemy model
                console.log("Enemy INIT: Attached positional movement sound.");
            } else {
                console.warn("Enemy INIT: Enemy movement sound not found in loadedSounds.");
            }
            // -----------------------------

            enemyState.isInitialized = true;
        },
        undefined, // onProgress callback
        function (error) { // Error callback
            console.error("Enemy INIT: Error loading Spider Bot GLTF:", error);
        }
    );

    return enemyState; // Return the state object
}

/**
 * Updates the Enemy bot's position, orientation, animation, and spotlight target.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D | null} playerMesh The player's mesh object (or null if not ready).
 */
export function updateEnemy(deltaTime, playerMesh) { 
    if (!enemyState.isInitialized || !enemyState.mesh || !homePlanetRef) {
        return; // Exit if enemy not ready
    }
    if (!playerMesh && enemyState.currentState === EnemyAIState.HUNTING) {
        // If hunting but player disappears, maybe revert to patrol?
        console.warn("Enemy is HUNTING but playerMesh is null. Reverting to PATROLLING.");
        enemyState.currentState = EnemyAIState.PATROLLING;
        return;
    }

    const enemyMesh = enemyState.mesh;
    const planetRadius = homePlanetRef.geometry.parameters.radius;
    const enemyVelocity = enemyState.velocity;
    const PATROL_TARGET_REACH_DISTANCE_SQ = 5.0 * 5.0; // <<< INCREASED from 1.0*1.0
    const PATROL_NEW_TARGET_TIME = 5.0; // Seconds before picking new target even if not reached
    const PATROL_MAX_DISTANCE = 20.0; // How far away to pick patrol points

    // --- Get World Positions --- (Needed regardless of state for orientation/clamping)
    enemyMesh.getWorldPosition(_enemyWorldPos);
    homePlanetRef.getWorldPosition(_planetWorldPos); // Usually 0,0,0 but good practice
    // --- Force Matrix Update --- 
    enemyMesh.updateMatrixWorld(true); // Ensure enemy and children (spotlight, target) matrices are current
    // --- Update Spotlight Target Matrix (if needed) ---
    if (enemyState.spotLight && enemyState.spotLightTargetHelper) {
        if (enemyState.spotLight.target === enemyState.spotLightTargetHelper) {
            // Update the helper's matrix *before* getting spotlight direction
            enemyState.spotLightTargetHelper.updateMatrixWorld(); 
        }
        // No need to explicitly update player mesh matrix here, assume it's handled elsewhere
    }
    // --------------------------------------------------

    // --- STATE MACHINE LOGIC ---
    let targetWorldPos = null; // Where the enemy should move towards in world space
    const FADE_DURATION = 0.5; // Animation fade duration

    // --- Get Sound References --- (Do this once)
    const movementSound = window.loadedSounds?.enemyMovementSound;
    const scanningSound = window.loadedSounds?.enemyScanningSound;
    // ---------------------------

    // --- Handle State Transitions and Actions ---
    switch (enemyState.currentState) {
        case EnemyAIState.PATROLLING:
            // --- Stop Scanning Sound (if playing) ---
            if (scanningSound && enemyState.isScanningSoundPlaying) {
                scanningSound.stop();
                enemyState.isScanningSoundPlaying = false;
                console.log("Enemy Sound: Stopped scanning sound (Entered PATROLLING).");
            }
            // -----------------------------------------

            // Set default status for patrolling
            enemyState.statusText = `Patrolling (Point ${enemyState.currentPatrolPointIndex})`;

            // --- Vision Check ---
            if (!window.debugDisableHuntMode && playerMesh && isPlayerInSpotlight(playerMesh)) {
                console.log("ENEMY STATE: Player detected! Switching to HUNTING.");
                enemyState.currentState = EnemyAIState.HUNTING;
                enemyState.timeInSpotlight = 0; // Reset timer (still good practice)
                enemyState.timeSincePlayerSeen = 0; // Reset hunt give up timer too
                enemyState.statusText = "Hunting (Player Visible)"; // Update status

                // Fade from walk/idle to walk
                if (enemyState.actions.idle) enemyState.actions.idle.fadeOut(FADE_DURATION);
                if (enemyState.actions.walk) enemyState.actions.walk.fadeIn(FADE_DURATION);
                break; // Exit switch for this frame
            } else {
                // Player not seen (or hunt disabled), reset delay timer
                enemyState.timeInSpotlight = 0; // Keep resetting this even if unused for detection
                // --- Reset Spotlight Target Helper Position ---
                if (enemyState.spotLightTargetHelper) {
                    enemyState.spotLightTargetHelper.position.set(-15, 0, 0); // Default forward
                }
                // --------------------------------------------
            }
            // --------------------------------
            
            // --- Fibonacci Patrol Movement Logic ---
            // Get the target world position for the current patrol index
            const targetDirection = getFibonacciLatticePoint(enemyState.currentPatrolPointIndex, NUM_PATROL_POINTS);
            const enemyHeight = config.PLAYER_RADIUS * 0.25 * 0.8; // Reuse approximate height
            const targetRadius = planetRadius + enemyHeight;
            // Calculate world position: planet center + direction * radius
            _vector3.copy(targetDirection).multiplyScalar(targetRadius);
            const currentTargetWorldPos = _vector3.add(homePlanetRef.position); // Assumes planet might move, use its current world pos
            
            targetWorldPos = currentTargetWorldPos; // Set the target for movement logic

            // Ensure walk animation is playing while moving to patrol point
             if (enemyState.actions.idle?.getEffectiveWeight() === 1.0) enemyState.actions.idle.fadeOut(FADE_DURATION);
             if (enemyState.actions.walk && enemyState.actions.walk?.getEffectiveWeight() === 0.0) enemyState.actions.walk.fadeIn(FADE_DURATION);
            
            // Check if reached target
            if (_enemyWorldPos.distanceToSquared(targetWorldPos) < PATROL_TARGET_REACH_DISTANCE_SQ) {
                console.log(`ENEMY PATROL: Reached target point ${enemyState.currentPatrolPointIndex}.`);
                targetWorldPos = null; // Stop movement towards target
                // Move to next patrol point index
                enemyState.currentPatrolPointIndex = (enemyState.currentPatrolPointIndex + 1) % NUM_PATROL_POINTS;
                
                // Decide whether to scan or continue immediately
                if (enemyState.currentPatrolPointIndex % 2 === 0) {
                    console.log(`ENEMY STATE: Reached point ${enemyState.currentPatrolPointIndex - 1}. Next point (${enemyState.currentPatrolPointIndex}) is even, starting SCAN.`);
                    enemyState.currentState = EnemyAIState.SCANNING;
                    // Initialize scan timer and duration
                    enemyState.scanTimer = 0;
                    enemyState.scanDuration = MIN_SCAN_DURATION + Math.random() * (MAX_SCAN_DURATION - MIN_SCAN_DURATION);
                    console.log(`ENEMY SCAN: Set duration to ${enemyState.scanDuration.toFixed(2)}s`);
                    // Fade anims
                    if (enemyState.actions.walk) enemyState.actions.walk.fadeOut(FADE_DURATION);
                    if (enemyState.actions.idle) enemyState.actions.idle.fadeIn(FADE_DURATION);
                    // Ensure scanning sound starts (handled in SCANNING state logic)

                } else {
                     console.log(`ENEMY STATE: Reached point ${enemyState.currentPatrolPointIndex - 1}. Next point (${enemyState.currentPatrolPointIndex}) is odd, moving directly.`);
                     // No state change, new target will be picked next frame using the incremented index
                     // Ensure walk animation is still playing
                     // ... (existing animation check/fade logic is fine) ...
                }
            }
            // --------------------------------------
            break;

        case EnemyAIState.SCANNING:
            enemyState.statusText = "Scanning"; // Update status
            // --- Ensure Scanning Sound is Playing ---
            if (scanningSound && !enemyState.isScanningSoundPlaying && scanningSound.context.state === 'running') {
                 scanningSound.play();
                 enemyState.isScanningSoundPlaying = true;
                 console.log("Enemy Sound: Started scanning sound (In SCANNING).");
            }
            // --------------------------------------

            enemyVelocity.set(0, 0, 0); // Ensure stopped
            targetWorldPos = null; // No movement target

            // --- <<< NEW: Vision Check During Scan --- 
            if (!window.debugDisableHuntMode && playerMesh && isPlayerInSpotlight(playerMesh)) {
                console.log("ENEMY STATE: Player detected during SCAN! Switching to HUNTING.");
                // Stop scanning sound immediately
                if (scanningSound && enemyState.isScanningSoundPlaying) {
                    scanningSound.stop();
                    enemyState.isScanningSoundPlaying = false;
                }
                enemyState.currentState = EnemyAIState.HUNTING;
                enemyState.timeInSpotlight = 0; // Reset timer
                enemyState.timeSincePlayerSeen = 0; // Reset hunt give up timer
                enemyState.statusText = "Hunting (Player Visible)"; // Update status

                // Fade from idle to walk
                if (enemyState.actions.idle) enemyState.actions.idle.fadeOut(FADE_DURATION);
                if (enemyState.actions.walk) enemyState.actions.walk.fadeIn(FADE_DURATION);
                // Start movement sound (handled by HUNTING state logic/velocity check)
                break; // Exit switch for this frame
            }
            // ---------------------------------------

            enemyState.scanTimer += deltaTime;

            // Rotate slowly around local up axis
            const rotationAmount = SCAN_ROTATION_SPEED * deltaTime;
            const rotateQuat = _tempQuat.setFromAxisAngle(_enemyUp, rotationAmount); // Use _enemyUp (surface normal)
            enemyMesh.quaternion.premultiply(rotateQuat); // Apply rotation

            // Check if scan finished
            if (enemyState.scanTimer >= enemyState.scanDuration) {
                console.log("ENEMY STATE: Scan complete. Returning to PATROLLING.");
                enemyState.currentState = EnemyAIState.PATROLLING;
                // targetWorldPos = null; // No need to set this, PATROLLING will calculate next point
                enemyState.timeInSpotlight = 0; // Reset hunt timer when returning to patrol
                enemyState.statusText = `Patrolling (Point ${enemyState.currentPatrolPointIndex})`; // Update status
                // Fade back to walk animation
                if (enemyState.actions.idle) enemyState.actions.idle.fadeOut(FADE_DURATION);
                if (enemyState.actions.walk) enemyState.actions.walk.fadeIn(FADE_DURATION);
                // --- Reset Spotlight Target Helper Position ---
                if (enemyState.spotLightTargetHelper) {
                    enemyState.spotLightTargetHelper.position.set(-15, 0, 0); // Default forward
                }
                // --------------------------------------------
            } else {
                // Ensure idle animation is playing (or walk is stopped)
                 if (enemyState.actions.idle?.getEffectiveWeight() < 1.0) enemyState.actions.idle?.fadeIn(FADE_DURATION);
                 if (enemyState.actions.walk?.getEffectiveWeight() > 0.0) enemyState.actions.walk?.fadeOut(FADE_DURATION);
            }
            break;

        case EnemyAIState.HUNTING:
            // --- Stop Scanning Sound (if playing) ---
            if (scanningSound && enemyState.isScanningSoundPlaying) {
                scanningSound.stop();
                enemyState.isScanningSoundPlaying = false;
                 console.log("Enemy Sound: Stopped scanning sound (Entered HUNTING).");
            }
            // -----------------------------------------

            // Set default status for hunting
            enemyState.statusText = "Hunting"; 

            // This state assumes playerMesh is valid (checked at the start of updateEnemy)
            playerMesh.getWorldPosition(_playerWorldPos); // Get current player position

            if (!window.debugDisableHuntMode && isPlayerInSpotlight(playerMesh)) { // Added debug check here too
                // Player is SEEN
                enemyState.timeSincePlayerSeen = 0; // Reset timer
                enemyState.lastKnownPlayerWorldPos.copy(_playerWorldPos); // Update last known position
                // targetWorldPos = enemyState.lastKnownPlayerWorldPos; // <<< OLD: Target current position directly

                // --- NEW: Add Inaccuracy to Target --- 
                const offset = _vector3.set(
                    (Math.random() - 0.5),
                    (Math.random() - 0.5),
                    (Math.random() - 0.5)
                ).normalize().multiplyScalar(HUNT_PREDICTION_ERROR_DISTANCE);
                const inaccurateTarget = _playerWorldPos.clone().add(offset);
                
                // Project inaccurate target onto planet surface
                const dirFromCenter = inaccurateTarget.clone().sub(_planetWorldPos);
                const enemyHeight = config.PLAYER_RADIUS * 0.25 * 0.8; // Reuse approximate height
                dirFromCenter.normalize().multiplyScalar(planetRadius + enemyHeight);
                targetWorldPos = _planetWorldPos.clone().add(dirFromCenter);
                // -------------------------------------

                // --- Play Detection Sounds (with Cooldown) --- <<< MOVED & ADDED COOLDOWN
                const nowSeconds = performance.now() / 1000;
                if (nowSeconds - enemyState.lastDetectionSoundTime > DETECTION_SOUND_COOLDOWN) {
                     if (window.loadedSounds?.enemyRoarSound && !window.loadedSounds.enemyRoarSound.isPlaying && window.loadedSounds.enemyRoarSound.context.state === 'running') {
                         window.loadedSounds.enemyRoarSound.play();
                         enemyState.lastDetectionSoundTime = nowSeconds; // Update time only when sounds actually play
                         console.log(`[Enemy Sound] Played Roar (Cooldown Active). Time: ${nowSeconds.toFixed(1)}`);
                     }
                     // Play siren slightly after roar or concurrently? Let's do concurrently for now.
                     if (window.loadedSounds?.alarmSirenSound && !window.loadedSounds.alarmSirenSound.isPlaying && window.loadedSounds.alarmSirenSound.context.state === 'running') {
                         window.loadedSounds.alarmSirenSound.play(); 
                         // No need to update timestamp again if roar already did
                         console.log(`[Enemy Sound] Played Siren (Cooldown Active). Time: ${nowSeconds.toFixed(1)}`);
                     }
                } else {
                    // Optional log: console.log(`[Enemy Sound] Detection sound cooldown active. Remaining: ${(DETECTION_SOUND_COOLDOWN - (nowSeconds - enemyState.lastDetectionSoundTime)).toFixed(1)}s`);
                }
                // -------------------------------------------

                enemyState.timeInSpotlight = 0; // Reset hunt delay timer if seen while hunting
                enemyState.statusText = "Hunting (Player Visible)"; // Update status
                // Ensure walk animation is playing
                if (enemyState.actions.idle?.getEffectiveWeight() === 1.0) enemyState.actions.idle.fadeOut(FADE_DURATION);
                if (enemyState.actions.walk && enemyState.actions.walk?.getEffectiveWeight() === 0.0) enemyState.actions.walk.fadeIn(FADE_DURATION);

                // --- Smoothly Update Spotlight Target Helper Position ---
                if (enemyState.spotLightTargetHelper) {
                    const targetHelper = enemyState.spotLightTargetHelper;
                    
                    // Get helper's current world position
                    targetHelper.getWorldPosition(_vector3); 
                    
                    // Interpolate world position towards player's world position
                    _vector3.lerp(_playerWorldPos, SPOTLIGHT_TRACKING_SPEED * deltaTime); 

                    // Convert interpolated world position back to local position relative to enemy
                    enemyMesh.worldToLocal(_vector3); 
                    targetHelper.position.copy(_vector3); // Set local position
                }
                // ---------------------------------------------------

            } else {
                // Player is NOT SEEN
                enemyState.timeSincePlayerSeen += deltaTime;
                if (enemyState.timeSincePlayerSeen < HUNT_GIVE_UP_TIME) {
                    // Continue hunting towards last known position
                    targetWorldPos = enemyState.lastKnownPlayerWorldPos; // Target LAST known position
                    enemyState.statusText = `Hunting (Searching last known)`; // Update status
                    // Keep walking animation
                    if (enemyState.actions.idle?.getEffectiveWeight() === 1.0) enemyState.actions.idle.fadeOut(FADE_DURATION);
                    if (enemyState.actions.walk && enemyState.actions.walk?.getEffectiveWeight() === 0.0) enemyState.actions.walk.fadeIn(FADE_DURATION);
                } else {
                    // Give up hunting!
                    console.log(`ENEMY STATE: Lost player for ${HUNT_GIVE_UP_TIME}s. Giving up hunt, returning to PATROLLING.`);
                    enemyState.currentState = EnemyAIState.PATROLLING;
                    // targetWorldPos = null; // No need to set, PATROLLING handles it
                    enemyState.lastKnownPlayerWorldPos.set(0, 0, 0); 
                    enemyState.timeSincePlayerSeen = 0; 
                    enemyState.timeInSpotlight = 0; // Reset hunt delay timer
                    enemyState.statusText = `Patrolling (Point ${enemyState.currentPatrolPointIndex})`; // Update status
                    // Ensure walk animation is playing for patrol start
                    if (enemyState.actions.idle?.getEffectiveWeight() === 1.0) enemyState.actions.idle.fadeOut(FADE_DURATION);
                    if (enemyState.actions.walk && enemyState.actions.walk?.getEffectiveWeight() === 0.0) enemyState.actions.walk.fadeIn(FADE_DURATION);
                }
                // --- Reset Spotlight Target Helper Position (when searching) ---
                if (enemyState.spotLightTargetHelper) {
                    enemyState.spotLightTargetHelper.position.set(-15, 0, 0); // Default forward
                }
                // -----------------------------------------------------------
            }
            break;
    }
    // -------------------------------------------

    // --- Calculate Movement Logic (Common for all states, uses targetWorldPos) ---
    if (targetWorldPos) {
        // Direction from enemy to target in world space
        _dirToPlayer.subVectors(targetWorldPos, _enemyWorldPos); // Reusing _dirToPlayer as _dirToTarget

        // Enemy's up vector (surface normal)
        _enemyUp.copy(_enemyWorldPos).sub(_planetWorldPos).normalize();

        // Calculate tangent direction towards target on planet surface
        _tangentAccelDir.copy(_dirToPlayer).projectOnPlane(_enemyUp).normalize();

        // Apply acceleration towards target
        if (_tangentAccelDir.lengthSq() > 1e-6) { // Check if direction is valid
            enemyVelocity.addScaledVector(_tangentAccelDir, config.ENEMY_ACCELERATION * deltaTime);
        }
    } else {
        // No target (e.g., scanning or reached patrol point), so just apply friction
        // Setting velocity to 0 directly if scanning
        if (enemyState.currentState !== EnemyAIState.SCANNING) {
             _tangentAccelDir.set(0, 0, 0); // No acceleration direction
        }
        // Friction applied below regardless
    }

    // Apply friction (always apply friction, unless scanning where velocity is forced to 0)
    if (enemyState.currentState !== EnemyAIState.SCANNING) {
        enemyVelocity.multiplyScalar(1.0 - (1.0 - config.ENEMY_FRICTION) * deltaTime * 60);
    } 

    // Clamp velocity
    if (enemyVelocity.lengthSq() > config.ENEMY_MAX_VELOCITY * config.ENEMY_MAX_VELOCITY) {
        enemyVelocity.normalize().multiplyScalar(config.ENEMY_MAX_VELOCITY);
    }

    // Stop completely if velocity is very low
    const stoppedThresholdSq = 1e-4; // Slightly larger threshold for stopping sound
    const isActuallyMoving = enemyVelocity.lengthSq() > stoppedThresholdSq;

    if (enemyVelocity.lengthSq() < 1e-8) {
        enemyVelocity.set(0, 0, 0);
    }
    // -----------------------------

    // --- Start/Stop Movement Sound --- 
    if (movementSound) {
        if (isActuallyMoving && !enemyState.isMovingSoundPlaying) {
            // <<< ADDED Check: Don't play move sound if scanning >>>
            if (enemyState.currentState !== EnemyAIState.SCANNING && movementSound.context.state === 'running') {
                 movementSound.play();
                 enemyState.isMovingSoundPlaying = true;
                 console.log("Enemy Sound: Started movement sound.");
             } else {
                 console.warn("Enemy Sound: Cannot start movement sound - context not running.")
             }
        } else if ((!isActuallyMoving || enemyState.currentState === EnemyAIState.SCANNING) && enemyState.isMovingSoundPlaying) { // Stop if not moving OR if scanning
            movementSound.stop();
            enemyState.isMovingSoundPlaying = false;
             console.log("Enemy Sound: Stopped movement sound.");
        }
    }
    // ---------------------------------

    // --- Calculate Displacement & Update Position (Common) ---
    const deltaPosition = enemyVelocity.clone().multiplyScalar(deltaTime);
    _enemyWorldPos.add(deltaPosition);

    // Clamp to surface
    const directionFromCenter = _vector3.copy(_enemyWorldPos).sub(_planetWorldPos);
    const enemyApproxRadius = config.PLAYER_RADIUS * 0.25 * 0.8; // Estimate based on player radius, scale, and model shape
    const targetDistance = planetRadius + enemyApproxRadius; 
    directionFromCenter.normalize().multiplyScalar(targetDistance);
    _enemyWorldPos.copy(_planetWorldPos).add(directionFromCenter);

    // NaN Check (Common)
    if (isNaN(_enemyWorldPos.x) || isNaN(_enemyWorldPos.y) || isNaN(_enemyWorldPos.z)) {
        console.error("ENEMY DEBUG: Calculated NaN for world position!", { 
            state: enemyState.currentState,
            velocity: enemyVelocity.toArray(),
            deltaPosition: deltaPosition.toArray(),
            directionFromCenter: directionFromCenter.toArray(),
            targetDistance: targetDistance
        }); 
        enemyVelocity.set(0,0,0); 
        return; 
    }

    // Convert back to local position (Common)
    const finalLocalPos = homePlanetRef.worldToLocal(_enemyWorldPos.clone());
    if (isNaN(finalLocalPos.x) || isNaN(finalLocalPos.y) || isNaN(finalLocalPos.z)) {
        console.error("ENEMY DEBUG: Calculated NaN for local position!", { worldPos: _enemyWorldPos.toArray() });
        return; 
    }
    enemyMesh.position.copy(finalLocalPos);
    // ---------------------------------------------

    // --- Update Orientation (Common) --- 
    const upDir = _enemyUp.clone(); 
    let targetForwardDir = enemyState.targetLookDirection.clone(); // Start with last direction

    if (enemyVelocity.lengthSq() > 1e-6) { // Look towards velocity if moving
        const tangentVelocity = enemyVelocity.clone().projectOnPlane(upDir);
        if (tangentVelocity.lengthSq() > 1e-6) {
            targetForwardDir.copy(tangentVelocity).normalize();
            enemyState.targetLookDirection.copy(targetForwardDir); // Store new look direction
        }
    } // else: keep looking in the last direction if stopped

    // Ensure targetForwardDir is valid (Common)
    if (targetForwardDir.lengthSq() < 1e-6 || Math.abs(targetForwardDir.dot(upDir)) > 0.999) {
        // Fallback based on current target direction (if patrolling and stopped, might look weird)
        _tangentAccelDir.copy(_dirToPlayer).projectOnPlane(upDir).normalize(); // Use _dirToPlayer (which holds dir to target)
        if (_tangentAccelDir.lengthSq() > 1e-6) {
             targetForwardDir.copy(_tangentAccelDir);
        } else {
             // Final fallback: current world direction
             enemyMesh.getWorldDirection(_vector3);
             targetForwardDir.copy(_vector3).projectOnPlane(upDir).normalize();
        } 
        enemyState.targetLookDirection.copy(targetForwardDir); // Store the fallback
    }

    // Calculate and apply rotation (Common)
    _tempMatrix.lookAt(_origin, targetForwardDir, upDir);
    _tempQuat.setFromRotationMatrix(_tempMatrix);
    // Apply corrective rotations
    const flipAxis = new THREE.Vector3(0, 1, 0);
    const flipAngle = Math.PI;
    const flipQuat = new THREE.Quaternion().setFromAxisAngle(flipAxis, flipAngle);
    const rotateAxis = new THREE.Vector3(0, 1, 0); 
    const rotateAngle = Math.PI / 2; 
    const rotate90Quat = new THREE.Quaternion().setFromAxisAngle(rotateAxis, rotateAngle);
    _tempQuat.multiply(flipQuat).multiply(rotate90Quat); 

    // Slerp towards target orientation (Common)
    const step = config.PLAYER_ROTATION_SPEED * 0.5 * deltaTime; 
    // Prevent jerky rotation changes when stopping to scan
    if(enemyState.currentState !== EnemyAIState.SCANNING) {
        enemyMesh.quaternion.rotateTowards(_tempQuat, step); 
    }
    // -------------------------

    // Update animation mixer (Common) - Handles fades
    if (enemyState.mixer) {
        enemyState.mixer.update(deltaTime);
    }

    // --- Update Spotlight Target Position --- 
    // <<< REMOVED the block that switched spotLight.target >>>
    // Always keep targeting the helper object
    if (enemyState.spotLight && enemyState.spotLight.target !== enemyState.spotLightTargetHelper) {
        console.log("Correcting spotlight target to always be the helper.");
        enemyState.spotLight.target = enemyState.spotLightTargetHelper;
    }

    // Update the target helper's position based on state (logic to be added within state machine)
    // Ensure target's matrix is updated *after* position changes and *before* vision check
    if (enemyState.spotLightTargetHelper) {
        enemyState.spotLightTargetHelper.updateMatrixWorld(); 
    }
    // -------------------------------------

} 

function getFibonacciPatrolPoint(planetRadius) {
    // Implement Fibonacci lattice patrol logic here
    // This is a placeholder and should be replaced with the actual implementation
    return null; // Placeholder return, actual implementation needed
} 