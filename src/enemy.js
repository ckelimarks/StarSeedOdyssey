import * as THREE from 'https://esm.sh/three@0.128.0';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import * as config from './config.js'; // Import config for potential future use
import {
    PLAYER_MODEL_SCALE, PLAYER_RADIUS, // Existing potentially used
    ENEMY_ACCELERATION, ENEMY_FRICTION, ENEMY_MAX_VELOCITY, // Existing potentially used
    ENEMY_PROXIMITY_ALERT_RADIUS, // <<< NEW: Import proximity radius
    NODES_REQUIRED, NODE_ACTIVATION_DURATION, NODE_INTERACTION_DISTANCE, MIN_NODE_DISTANCE // Node constants
} from './config.js';
import { getRandomPositionOnPlanet } from './utils.js'; // <<< NEW: Import utility
import { playAppropriateMusic } from './resources.js'; // <<< IMPORT MUSIC FUNCTION
import { techApertureModelProto, techApertureModelAnimations } from './resources.js'; // <<< Import Deactivation Node Model/Animations

// --- Enemy States Enum ---
const EnemyAIState = {
    PATROLLING: 'PATROLLING',
    HUNTING: 'HUNTING',
    SCANNING: 'SCANNING', // <<< NEW STATE
    SEARCHING_AREA: 'SEARCHING_AREA', // NEW: Searching a specific zone
    TARGETING_NODE: 'TARGETING_NODE', // NEW: For reacting to node activation
    SLEEPING: 'SLEEPING' // <<< NEW STATE
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
const SPOTLIGHT_TRACKING_SPEED = 6.0; // <<< INCREASED AGAIN
const DETECTION_SOUND_COOLDOWN = 3.0; // <<< NEW: Cooldown for roar/siren sounds
const SEARCH_AREA_RADIUS = 25.0; // NEW: Radius for local searching
const SEARCH_AREA_DURATION = 15.0; // NEW: How long to search an area before giving up
const SEARCH_POINT_REACH_DISTANCE_SQ = 2.0 * 2.0; // NEW: Squared distance for reaching search points
const PATROL_DURATION = 60.0; // <<< ADJUSTED for testing
const SLEEP_DURATION = 120.0;  // <<< CORRECTED VALUE & ADDED SEMICOLON
const MUSIC_ANTICIPATION_FADE_DURATION = 4.0; // <<< NEW: Added for music fade logic
// ------------------------

// Module-level variables
const loader = new GLTFLoader();
let homePlanetRef = null;
let planetsStateRef = null; // <<< ADD module-level variable
let enemyAudioListenerRef = null; // <<< NEW: Store audio listener

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
    currentState: EnemyAIState.SLEEPING, // <<< NEW: Start sleeping
    scanTimer: 0, 
    scanDuration: 0, 
    timeSincePlayerSeen: 0, // <<< NEW: Timer for giving up hunt
    lastKnownPlayerWorldPos: new THREE.Vector3(), // <<< NEW: Last place player was seen
    currentPatrolPointIndex: 0, // <<< NEW: Index for Fibonacci lattice patrol
    timeInSpotlight: 0, // <<< NEW: Timer for hunt detection delay
    // --- Sound State ---
    isMovingSoundPlaying: false, // Track if the movement sound is active
    isScanningSoundPlaying: false, // <<< NEW: Track if scanning sound is active
    isFadingToSleepMusic: false, // <<< NEW
    isFadingToAwakeMusic: false, // <<< NEW
    // ---------------
    statusText: "Initializing", // Current action description
    lastDetectionSoundTime: 0, // <<< NEW: Timestamp for cooldown
    priorityTargetNodePosition: null, // NEW: Stores the world position of a node the enemy is prioritizing
    priorityTargetNodeId: null, // NEW: Stores the ID of the node the enemy is prioritizing
    speedMultiplier: 1.0, // NEW: Multiplier for speed (e.g., when targeting a node)
    // --- Area Searching State ---
    searchAreaCenter: null, // NEW: Center position for area search
    searchTimer: 0,         // NEW: Timer for search duration
    currentSearchTargetPos: null, // NEW: Current random point being targeted in the search area
    isAreaScan: false,      // NEW: Flag to indicate if a scan is part of area searching
    // --------------------
    patrolTimer: 0, // <<< NEW
    sleepTimer: 0, // <<< NEW: Timer for sleep duration
    originalSpotlightIntensity: 1.0, // <<< STORE INTENSITY
    // --- Deactivation Node State ---
    deactivationNodes: [], // Array to store { mesh, mixer, isActivated, activationProgress }
    activationTimers: {}, // Map: nodeInstanceId -> timer
    nodeToEnemyLines: [], // <<< ADD BACK: Initialize as empty array
    walkAction: null, // Added for walk animation
    movementSound: null, // Added for movement sound
    deactivateNodeSoundTemplate: null, // Added for node deactivation sound
    roarSound: null, // Added for roar sound
    isPaused: false, // Added for pause state
};
// ------------------

// Temporary vectors
const _enemyWorldPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3(); // NEW: Need player position
const _planetWorldPos = new THREE.Vector3(); // NEW: Need planet position
const _targetWorldPos = new THREE.Vector3(); // <<< ADDED DECLARATION
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
const _vector3_2 = new THREE.Vector3(); // NEW: General purpose temp

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
 * @param {object} planetsData - The planetsState object from main.js <<< ADD parameter
 * @param {THREE.AudioListener} audioListener - The main audio listener <<< NEW parameter
 * @returns {object} The enemy state object.
 */
export function initEnemy(scene, homePlanet, planetsData, audioListener) { // <<< ADD audioListener parameter
    console.log("Enemy INIT: Initializing...");
    if (!homePlanet || !homePlanet.geometry || !homePlanet.geometry.parameters) {
        console.error("Enemy INIT Error: Valid homePlanet object is required.");
        return null; // Return null or handle error appropriately
    }
    if (!planetsData) { // <<< ADD check
        console.error("Enemy INIT Error: planetsData object is required.");
        return null;
    }
    if (!audioListener) { // <<< NEW check
        console.error("Enemy INIT Error: audioListener is required.");
        return null;
    }
    homePlanetRef = homePlanet; // Store reference
    planetsStateRef = planetsData; // <<< Store reference
    enemyAudioListenerRef = audioListener; // <<< NEW: Store listener reference

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
            enemyState.originalSpotlightIntensity = spotLight.intensity; // <<< STORE INTENSITY
            // --- NEW: Dim light if starting asleep ---
            if (enemyState.currentState === EnemyAIState.SLEEPING) {
                spotLight.intensity = 0.1;
                console.log("Enemy INIT: Starting asleep, spotlight dimmed.");
            }
            // -----------------------------------------
            console.log("Enemy INIT: Added spotlight targeting model origin."); // Updated log
            
            // --- ADD Spotlight Helper ---
            // const spotLightHelper = new THREE.SpotLightHelper(spotLight); // <<< COMMENTED OUT
            // scene.add(spotLightHelper); // Add helper to the main scene // <<< COMMENTED OUT
            // enemyState.spotLightHelper = spotLightHelper; // Store reference // <<< COMMENTED OUT
            // console.log("Enemy INIT: Added SpotLightHelper to the scene."); // <<< COMMENTED OUT
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
            // const pointGeo = new THREE.SphereGeometry(0.2, 6, 4); // Small sphere // <<< COMMENTED OUT
            // const pointMat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow // <<< COMMENTED OUT
            // const planetCenter = homePlanetRef.position.clone(); // Assume planet center is its position // <<< COMMENTED OUT
            // const visualPointHeight = 0.1; // Slightly above surface // <<< COMMENTED OUT

            console.log(`Enemy INIT: Visualizing ${NUM_PATROL_POINTS} patrol points...`); // <<< Keep log, but points won't be added
            for (let i = 0; i < NUM_PATROL_POINTS; i++) {
                // const direction = getFibonacciLatticePoint(i, NUM_PATROL_POINTS); // <<< COMMENTED OUT
                // const pointPos = direction.multiplyScalar(planetRadius + visualPointHeight); // <<< COMMENTED OUT
                // pointPos.add(planetCenter); // Add planet's offset if any // <<< COMMENTED OUT

                // const pointMesh = new THREE.Mesh(pointGeo, pointMat); // <<< COMMENTED OUT
                // pointMesh.position.copy(homePlanetRef.worldToLocal(pointPos.clone())); // Convert to local space of planet // <<< COMMENTED OUT
                // homePlanetRef.add(pointMesh); // Add as child of planet // <<< COMMENTED OUT
            }
            console.log("Enemy INIT: Patrol point visualization disabled."); // <<< Updated log
            // -------------------------------

            // --- Initialize Animation Mixer --- 
            if (enemyState.animations && enemyState.animations.length > 0) {
                enemyState.mixer = new THREE.AnimationMixer(model);
                
                // --- Log all animation names --- <<< NEW DEBUG
                console.log("[Enemy Anim Names] Found animations:");
                enemyState.animations.forEach((clip, index) => {
                    console.log(`  [${index}]: ${clip.name}`);
                });
                // -------------------------------

                let walkClip = enemyState.animations[0]; // Assume first is walk

                if (walkClip) {
                    enemyState.actions.walk = enemyState.mixer.clipAction(walkClip);
                    // Play walk initially, control visibility/pause based on state
                    enemyState.actions.walk.play(); 
                    if (enemyState.currentState === EnemyAIState.SLEEPING) {
                        enemyState.actions.walk.weight = 1; // Start faded IN if sleeping
                        enemyState.actions.walk.timeScale = 0; // Start PAUSED if sleeping
                         console.log(`Enemy INIT: Starting asleep, playing PAUSED walk animation: ${walkClip.name}`);
                    } else {
                         enemyState.actions.walk.weight = 1; // Start faded IN if patrolling
                         enemyState.actions.walk.timeScale = 1; // Start running if patrolling
                         console.log(`Enemy INIT: Starting awake, playing walk animation: ${walkClip.name}`);
                    }
                } else {
                    console.warn("Enemy INIT: Could not find walk animation clip.");
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

            // --- Attach Deactivation Sound (NEW) ---
            const deactivateSound = window.loadedSounds?.deactivateNodeSound;
            if (deactivateSound) {
                model.add(deactivateSound); // Attach sound directly to the enemy model
                console.log("Enemy INIT: Attached positional node deactivation sound.");
            } else {
                console.warn("Enemy INIT: Node deactivation sound not found in loadedSounds.");
            }
            // ----------------------------------

            // --- NEW: Set initial visibility based on state ---
            if (enemyState.currentState === EnemyAIState.SLEEPING) {
                // model.visible = false; // <<< OLD: Hide parent
                // --- NEW: Traverse and hide individual meshes ---
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.visible = false;
                    }
                });
                // ------------------------------------------------
                console.log("Enemy INIT: Starting asleep, mesh children set to invisible.");
            }
            // ------------------------------------------------

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
 * @param {THREE.Vector3} playerVelocity The player's current velocity vector.
 * @param {function} triggerScreenShakeFunc Function to call to trigger screen shake.
 */
export function updateEnemy(deltaTime, playerMesh, playerVelocity, triggerScreenShake) {
    if (!enemyState || !enemyState.isInitialized || enemyState.isPaused) return; // Add isPaused check
    
    const now = performance.now(); // <<< ADD BACK: Get current time for shader uniforms

    if (!playerMesh && enemyState.currentState === EnemyAIState.HUNTING) {
        // If hunting but player disappears, maybe revert to patrol?
        console.warn("Enemy is HUNTING but playerMesh is null. Reverting to PATROLLING.");
        enemyState.currentState = EnemyAIState.PATROLLING;
        return;
    }

    const enemyMesh = enemyState.mesh;
    const enemyVelocity = enemyState.velocity;
    const homePlanet = homePlanetRef; // Assuming homePlanetRef is correctly set from initEnemy
    const planetRadius = homePlanet.geometry.parameters.radius;
    const FADE_DURATION = 0.3; // General fade duration for animations
    const PATROL_TARGET_REACH_DISTANCE_SQ = 2.0 * 2.0; // Squared distance to consider patrol point reached
    const NODE_TARGET_REACH_DISTANCE_SQ = 3.0 * 3.0; // Squared distance for reaching a targeted node

    // Update enemy's world position for calculations
    enemyMesh.getWorldPosition(_enemyWorldPos);
    homePlanet.getWorldPosition(_planetWorldPos); // Assuming planet center is its world position

    // Default target for movement (can be overridden by states)
    let targetWorldPos = null;

    // Update current up vector based on planet surface normal
    _enemyUp.copy(_enemyWorldPos).sub(_planetWorldPos).normalize();

    // Animation mixer update (moved earlier, common to all states)
    if (enemyState.mixer) {
        enemyState.mixer.update(deltaTime);
    }
    
    // Audio context check for sounds
    const movementSound = window.loadedSounds?.enemyMovementSound;
    const scanningSound = window.loadedSounds?.enemyScanningSound;
    const audioCtx = movementSound?.context || scanningSound?.context;

    // --- STATE MACHINE LOGIC ---
    // Where the enemy should move towards in world space (set by states below)
    // let targetWorldPos = null; // REMOVED redundant declaration

    // --- Handle State Transitions and Actions ---
    switch (enemyState.currentState) {
        case EnemyAIState.PATROLLING:
            // --- Ensure Patrol Sound is Playing (Not Implemented Yet) ---
            // --- Stop Scanning Sound (if playing) ---
            if (scanningSound && enemyState.isScanningSoundPlaying) {
                scanningSound.stop();
                enemyState.isScanningSoundPlaying = false;
                console.log("Enemy Sound: Stopped scanning sound (Entered PATROLLING).");
            }
            // -----------------------------------------

            // Set default status for patrolling
            const remainingPatrolTime = Math.max(0, PATROL_DURATION - enemyState.patrolTimer);
            const minutes = Math.floor(remainingPatrolTime / 60);
            const seconds = Math.floor(remainingPatrolTime % 60);
            enemyState.statusText = `Patrolling (${minutes}:${seconds.toString().padStart(2, '0')} left)`;

            // --- Patrol Timer / Pre-Sleep Fade Check --- <<< MODIFIED
            enemyState.patrolTimer += deltaTime;
            // Start fade 4 seconds before sleeping
            if (!enemyState.isFadingToSleepMusic && remainingPatrolTime <= MUSIC_ANTICIPATION_FADE_DURATION) {
                console.log(`[Music] Approaching sleep time, starting fade to normal theme.`);
                playAppropriateMusic(false); // Fade to normal (sleep) music
                enemyState.isFadingToSleepMusic = true;
            }
            // Actual transition to sleep
            if (enemyState.patrolTimer >= PATROL_DURATION) {
                console.log(`ENEMY STATE: Patrol duration (${PATROL_DURATION}s) reached. Entering SLEEPING.`);
                enemyState.currentState = EnemyAIState.SLEEPING;
                enemyState.patrolTimer = 0;
                enemyState.sleepTimer = 0;
                enemyState.statusText = "Sleeping"; // Initial status, timer updates below
                enemyState.speedMultiplier = 1.0; // Reset speed multiplier
                
                // Stop sounds, dim light, idle anim
                if (movementSound && enemyState.isMovingSoundPlaying) movementSound.stop();
                enemyState.isMovingSoundPlaying = false;
                if (enemyState.spotLight) enemyState.spotLight.intensity = 0.1;
                if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 0; 
                }
                // --- NEW: Traverse and hide meshes --- 
                enemyMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.visible = false;
                    }
                });
                // -----------------------------------
                enemyState.isFadingToAwakeMusic = false; // Reset other flag on state entry
                
                // <<< Despawn Nodes on Sleep >>>
                despawnDeactivationNodes();
                
                break; 
            }
            // --------------------------

            // --- Vision Check ---
            if (!window.debugDisableHuntMode && playerMesh && isPlayerInSpotlight(playerMesh)) {
                console.log("ENEMY STATE: Player detected! Switching to HUNTING.");
                enemyState.patrolTimer = 0; 
                enemyState.isFadingToSleepMusic = false; // <<< Reset flag if hunt starts
                enemyState.currentState = EnemyAIState.HUNTING;
                enemyState.timeInSpotlight = 0; // Reset timer (still good practice)
                enemyState.timeSincePlayerSeen = 0; // Reset hunt give up timer too
                enemyState.statusText = "Hunting (Player Visible)"; // Update status
                triggerScreenShake(0.6, 1.0); // <<< Increased Duration (was 0.3)

                // Fade from walk/idle to walk
                if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 1; // Ensure resumed
                    // enemyState.actions.walk.fadeIn(FADE_DURATION); // Fade handled below?
                }
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
             if (enemyState.actions.walk) {
                enemyState.actions.walk.timeScale = 1; // Ensure resumed
                // Check weight before fading in? Might not be needed if always paused/resumed
                 if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) { // Only fade if needed?
                     enemyState.actions.walk.fadeIn(FADE_DURATION);
                 } else {
                     enemyState.actions.walk.weight = 1.0; // Ensure full weight if not fading
                 }
             }
            
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
                    // Pause walk animation
                    if (enemyState.actions.walk) {
                         enemyState.actions.walk.timeScale = 0; 
                         // enemyState.actions.walk.fadeOut(FADE_DURATION); // Remove fade
                    }
                } else {
                     console.log(`ENEMY STATE: Reached point ${enemyState.currentPatrolPointIndex - 1}. Next point (${enemyState.currentPatrolPointIndex}) is odd, moving directly.`);
                     // No state change, new target will be picked next frame using the incremented index
                     // Ensure walk animation is still playing (resumed)
                     if (enemyState.actions.walk) {
                         enemyState.actions.walk.timeScale = 1;
                         enemyState.actions.walk.weight = 1.0; // Ensure full weight
                     }
                }
            }
            // --------------------------------------
            break;

        case EnemyAIState.SCANNING:
            enemyState.statusText = `Scanning (${(enemyState.scanDuration - enemyState.scanTimer).toFixed(1)}s left)`;
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
                enemyState.patrolTimer = 0; // <<< Reset patrol timer when hunt starts during scan
                enemyState.currentState = EnemyAIState.HUNTING;
                enemyState.timeInSpotlight = 0; // Reset timer
                enemyState.timeSincePlayerSeen = 0; // Reset hunt give up timer
                enemyState.statusText = "Hunting (Target Visible)";
                triggerScreenShake(0.6, 1.0); // <<< Increased Duration (was 0.3)

                // Fade from idle to walk
                if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 1;
                    enemyState.actions.walk.fadeIn(FADE_DURATION);
                }
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
                if (enemyState.isAreaScan) {
                    console.log("ENEMY STATE: Area scan complete. Switching to SEARCHING_AREA.");
                    enemyState.currentState = EnemyAIState.SEARCHING_AREA;
                    enemyState.searchTimer = 0; // Reset search timer
                    enemyState.currentSearchTargetPos = null; // Clear search target
                    enemyState.isAreaScan = false; // Clear the flag
                } else {
                    console.log("ENEMY STATE: Patrol scan complete. Returning to PATROLLING.");
                    enemyState.currentState = EnemyAIState.PATROLLING;
                    // targetWorldPos = null; // PATROLLING calculates next point
                    enemyState.timeInSpotlight = 0; // Reset hunt timer
                    enemyState.statusText = `Patrolling (${Math.max(0, PATROL_DURATION - enemyState.patrolTimer).toFixed(1)}s left)`;
                }
                 // Resume walk animation (common for both transitions out of scan)
                if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 1;
                    enemyState.actions.walk.fadeIn(FADE_DURATION);
                }
                // --- Reset Spotlight Target Helper Position (common) ---
                if (enemyState.spotLightTargetHelper) {
                    enemyState.spotLightTargetHelper.position.set(-15, 0, 0); // Default forward
                }
            } else {
                // Ensure walk animation is paused during scan
                 if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 0; // Ensure paused
                 }
            }
            break;

        case EnemyAIState.SEARCHING_AREA:
            enemyState.statusText = `Searching Area (${(SEARCH_AREA_DURATION - enemyState.searchTimer).toFixed(1)}s left)`;
            enemyState.searchTimer += deltaTime;
            enemyState.speedMultiplier = 1.0; // Use normal speed for searching

            // Check timer expiry
            if (enemyState.searchTimer >= SEARCH_AREA_DURATION) {
                console.log("ENEMY STATE: Search area duration expired. Reverting to global PATROLLING.");
                enemyState.currentState = EnemyAIState.PATROLLING;
                enemyState.searchAreaCenter = null; // Clear search center
                enemyState.currentSearchTargetPos = null;
                break;
            }

            // Vision Check (interrupt search if player found)
            if (!window.debugDisableHuntMode && playerMesh && isPlayerInSpotlight(playerMesh)) {
                console.log("ENEMY STATE: Player detected during area search! Switching to HUNTING.");
                enemyState.currentState = EnemyAIState.HUNTING;
                enemyState.searchAreaCenter = null; // Clear search params
                enemyState.currentSearchTargetPos = null;
                enemyState.timeInSpotlight = 0;
                enemyState.timeSincePlayerSeen = 0;
                triggerScreenShake(0.6, 1.0);
                if (enemyState.actions.walk) enemyState.actions.walk.timeScale = 1; // Ensure walking
                break;
            }

            // Pick a new random search target if needed (or reached current one)
            if (!enemyState.currentSearchTargetPos || _enemyWorldPos.distanceToSquared(enemyState.currentSearchTargetPos) < SEARCH_POINT_REACH_DISTANCE_SQ) {
                console.log("ENEMY SEARCH: Picking new random point within area.");
                const randomDirection = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2
                ).normalize();
                const randomDistOffset = Math.random() * SEARCH_AREA_RADIUS;
                // Project the random offset onto the tangent plane at the search center
                const centerNormal = enemyState.searchAreaCenter.clone().sub(_planetWorldPos).normalize();
                const tangentOffset = randomDirection.clone().projectOnPlane(centerNormal).normalize().multiplyScalar(randomDistOffset);
                
                // Add tangent offset to the center point (in world space)
                const potentialTarget = enemyState.searchAreaCenter.clone().add(tangentOffset);
                
                // Project the potential target back onto the sphere surface
                const dirFromPlanetCenter = potentialTarget.clone().sub(_planetWorldPos);
                const enemyHeight = config.PLAYER_RADIUS * 0.25 * 0.8; // Reuse approximate height
                dirFromPlanetCenter.normalize().multiplyScalar(planetRadius + enemyHeight);
                enemyState.currentSearchTargetPos = _planetWorldPos.clone().add(dirFromPlanetCenter);
                console.log("ENEMY SEARCH: New target set.");
            }

            targetWorldPos = enemyState.currentSearchTargetPos; // Set the movement target

            // Ensure walk animation is playing
            if (enemyState.actions.walk) {
                enemyState.actions.walk.timeScale = 1;
                if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) {
                    enemyState.actions.walk.fadeIn(FADE_DURATION);
                } else {
                    enemyState.actions.walk.weight = 1.0;
                }
            }
            // Stop scanning sound if it was playing (shouldn't be, but safety)
            if (scanningSound && enemyState.isScanningSoundPlaying) {
                scanningSound.stop();
                enemyState.isScanningSoundPlaying = false;
            }
            break;

        case EnemyAIState.TARGETING_NODE:
            enemyState.statusText = "Investigating Node";
            if (enemyState.priorityTargetNodePosition && enemyState.priorityTargetNodeId) { // Check ID exists too
                targetWorldPos = enemyState.priorityTargetNodePosition.clone();
                // REMOVED Node Validity Check Block - Enemy will always travel to the location first.
                /*
                let targetedNodeStillValid = false;
                
                // Find the node by ID first
                const targetedNode = enemyState.deactivationNodes.find(node => node.id === enemyState.priorityTargetNodeId);

                // If found, check if it's still activated
                if (targetedNode && !targetedNode.isActivated) {
                    targetedNodeStillValid = true;
                }

                if (!targetedNodeStillValid) {
                    console.log("ENEMY STATE: Targeted node is no longer valid (activated, despawned, or ID mismatch). Reverting to PATROLLING.");
                    console.log("ENEMY STATE: Exiting TARGETING_NODE (-> PATROLLING due to invalid node)");
                    enemyState.currentState = EnemyAIState.PATROLLING;
                    enemyState.priorityTargetNodePosition = null;
                    enemyState.priorityTargetNodeId = null; // Clear ID
                    enemyState.speedMultiplier = 1.0;
                    break;
                }
                */

                // Check if player is in spotlight (This check remains)
                if (!window.debugDisableHuntMode && playerMesh && isPlayerInSpotlight(playerMesh)) {
                    console.log("ENEMY STATE: Player detected while investigating node! Switching to HUNTING.");
                    console.log("ENEMY STATE: Exiting TARGETING_NODE (-> HUNTING)"); // Log exit
                    enemyState.currentState = EnemyAIState.HUNTING;
                    enemyState.timeInSpotlight = 0;
                    enemyState.timeSincePlayerSeen = 0;
                    enemyState.priorityTargetNodePosition = null; // Clear node target
                    enemyState.priorityTargetNodeId = null; // Clear ID
                    enemyState.speedMultiplier = 1.0; // Reset speed multiplier
                    triggerScreenShake(0.6, 1.0);
                    playAppropriateMusic(true); // Ensure danger music
                    if (enemyState.actions.walk) enemyState.actions.walk.timeScale = 1;
                    break;
                }

                // Check if reached the node
                if (_enemyWorldPos.distanceToSquared(targetWorldPos) < NODE_TARGET_REACH_DISTANCE_SQ) {
                    console.log("ENEMY STATE: Reached targeted node. Node still valid. Continuing investigation or switching to SCANNING/PATROLLING.");
                    // Instead of immediately patrolling, consider a short scan or re-evaluating player position.
                    // For now, let's switch to SCANNING briefly if player not in sight.
                    if (!playerMesh || !isPlayerInSpotlight(playerMesh)) {
                        console.log("ENEMY STATE: Exiting TARGETING_NODE (-> SCANNING after reaching node)");
                        enemyState.currentState = EnemyAIState.SCANNING;
                        enemyState.scanTimer = 0;
                        enemyState.scanDuration = MIN_SCAN_DURATION; // Short scan
                        enemyState.isAreaScan = true; // Flag this scan as part of node investigation
                        // Store the node position as the center for the subsequent area search
                        enemyState.searchAreaCenter = enemyState.priorityTargetNodePosition.clone(); 
                        enemyState.priorityTargetNodePosition = null; // Clear node target
                        enemyState.priorityTargetNodeId = null; // Clear ID
                        enemyState.speedMultiplier = 1.0; // Reset speed multiplier
                    } else {
                        // Player is in spotlight at the node, switch to HUNTING
                        console.log("ENEMY STATE: Player detected at the targeted node! Switching to HUNTING.");
                        console.log("ENEMY STATE: Exiting TARGETING_NODE (-> HUNTING at node)"); // Log exit
                        enemyState.currentState = EnemyAIState.HUNTING;
                        enemyState.timeInSpotlight = 0;
                        enemyState.timeSincePlayerSeen = 0;
                        enemyState.priorityTargetNodePosition = null; // Clear node target
                        enemyState.priorityTargetNodeId = null; // Clear ID
                        enemyState.speedMultiplier = 1.0; // Reset speed multiplier
                        triggerScreenShake(0.6, 1.0);
                        playAppropriateMusic(true); 
                    }
                    break; // Break from TARGETING_NODE
                }
            } else {
                // Should not happen, but if no priority target, go to patrol
                console.warn("ENEMY STATE: In TARGETING_NODE but no priorityTargetNodePosition/ID. Reverting to PATROLLING.");
                enemyState.currentState = EnemyAIState.PATROLLING;
                enemyState.priorityTargetNodeId = null; // Clear ID just in case
                enemyState.speedMultiplier = 1.0; // Reset speed multiplier
            }
             // Ensure walk animation is playing
            if (enemyState.actions.walk) {
                enemyState.actions.walk.timeScale = 1;
                if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) {
                    enemyState.actions.walk.fadeIn(FADE_DURATION);
                } else {
                    enemyState.actions.walk.weight = 1.0;
                }
            }
            // Stop scanning sound if it was playing
            if (scanningSound && enemyState.isScanningSoundPlaying) {
                scanningSound.stop();
                enemyState.isScanningSoundPlaying = false;
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

            playerMesh.getWorldPosition(_playerWorldPos); // Get current player position

            let playerDetectedThisFrame = false;
            const distanceToPlayerSq = _enemyWorldPos.distanceToSquared(_playerWorldPos);

            // 1. Check Proximity First
            if (distanceToPlayerSq < ENEMY_PROXIMITY_ALERT_RADIUS * ENEMY_PROXIMITY_ALERT_RADIUS) {
                playerDetectedThisFrame = true;
                enemyState.statusText = "Hunting (Player Close)";
                enemyState.speedMultiplier = 1.5; // Maintain/set aggressive speed
            } 
            // 2. If not by proximity, check spotlight
            else if (!window.debugDisableHuntMode && isPlayerInSpotlight(playerMesh)) {
                playerDetectedThisFrame = true;
                enemyState.statusText = "Hunting (Player in Spotlight)";
                enemyState.speedMultiplier = 1.5; // Maintain/set aggressive speed
            }

            if (playerDetectedThisFrame) {
                enemyState.timeSincePlayerSeen = 0; // Reset timer
                enemyState.lastKnownPlayerWorldPos.copy(_playerWorldPos); // Update last known position

                // --- Target player's current position directly ---
                const dirFromCenter = _playerWorldPos.clone().sub(_planetWorldPos); 
                const enemyHeight = config.PLAYER_RADIUS * 0.25 * 0.8; 
                dirFromCenter.normalize().multiplyScalar(planetRadius + enemyHeight);
                targetWorldPos = _planetWorldPos.clone().add(dirFromCenter);
                // -------------------------------------

                // --- Play Detection Sounds (with Cooldown) ---
                const nowSeconds = performance.now() / 1000;
                if (nowSeconds - enemyState.lastDetectionSoundTime > DETECTION_SOUND_COOLDOWN) {
                     const roarSound = window.loadedSounds?.enemyRoarSound;
                     if (roarSound && !roarSound.isPlaying && roarSound.context.state === 'running') {
                         if (roarSound.parent !== enemyState.mesh) enemyState.mesh.add(roarSound);
                         roarSound.play();
                         enemyState.lastDetectionSoundTime = nowSeconds; 
                         console.log(`[Enemy Sound] Hunt: Played Roar. Time: ${nowSeconds.toFixed(1)}`);
                         if(playerMesh) { 
                            const distance = _enemyWorldPos.distanceTo(_playerWorldPos);
                            console.log(`[Enemy Sound Debug] Distance player-enemy on roar: ${distance.toFixed(2)}`);
                         }
                     }
                     if (window.loadedSounds?.alarmSirenSound && !window.loadedSounds.alarmSirenSound.isPlaying && window.loadedSounds.alarmSirenSound.context.state === 'running') {
                         window.loadedSounds.alarmSirenSound.play(); 
                         console.log(`[Enemy Sound] Hunt: Played Siren. Time: ${nowSeconds.toFixed(1)}`);
                         console.log(`[Enemy Sound Debug] Siren isPlaying state immediately after play(): ${window.loadedSounds?.alarmSirenSound?.isPlaying}`);
                     }
                }
                // -------------------------------------------

                enemyState.timeInSpotlight = 0; // Reset any spotlight-specific timers if re-detected
                // Ensure walk animation is playing
                if (enemyState.actions.walk) {
                     enemyState.actions.walk.timeScale = 1; 
                     if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) { 
                         enemyState.actions.walk.fadeIn(FADE_DURATION);
                     } else {
                          enemyState.actions.walk.weight = 1.0; 
                     }
                 }

                // --- Smoothly Update Spotlight Target Helper Position ---
                if (enemyState.spotLightTargetHelper) {
                    const targetHelper = enemyState.spotLightTargetHelper;
                    targetHelper.getWorldPosition(_vector3); 
                    _vector3.lerp(_playerWorldPos, SPOTLIGHT_TRACKING_SPEED * deltaTime); 
                    enemyMesh.worldToLocal(_vector3); 
                    targetHelper.position.copy(_vector3); 
                }
                // ---------------------------------------------------

            } else {
                // Player is NOT SEEN (neither by proximity nor spotlight)
                enemyState.timeSincePlayerSeen += deltaTime;
                enemyState.statusText = `Hunting (Searching - ${enemyState.timeSincePlayerSeen.toFixed(1)}s)`;
                // Keep speedMultiplier as is (e.g. 1.5) while searching for a short period.
                // It will be reset to 1.0 if it transitions to SEARCHING_AREA or PATROLLING.

                if (enemyState.timeSincePlayerSeen < HUNT_GIVE_UP_TIME) {
                    // Continue hunting towards last known position
                    targetWorldPos = enemyState.lastKnownPlayerWorldPos.clone(); 
                    if (enemyState.actions.walk) {
                        enemyState.actions.walk.timeScale = 1; 
                        if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) { 
                            enemyState.actions.walk.fadeIn(FADE_DURATION);
                         } else {
                              enemyState.actions.walk.weight = 1.0; 
                         }
                    }
                } else {
                    // Give up hunting!
                    console.log(`ENEMY STATE: Lost player for ${HUNT_GIVE_UP_TIME}s. Giving up hunt, switching to SEARCHING_AREA.`);
                    enemyState.currentState = EnemyAIState.SEARCHING_AREA;
                    enemyState.searchAreaCenter = enemyState.lastKnownPlayerWorldPos.clone(); 
                    enemyState.searchTimer = 0; 
                    enemyState.currentSearchTargetPos = null; 
                    enemyState.speedMultiplier = 1.0; // Reset speed multiplier when giving up hunt
                    enemyState.lastKnownPlayerWorldPos.set(0, 0, 0); 
                    enemyState.timeSincePlayerSeen = 0; 
                    enemyState.timeInSpotlight = 0; 
                    // Status text will be set by SEARCHING_AREA state
                    if (enemyState.actions.walk) {
                        enemyState.actions.walk.timeScale = 1; 
                        if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) { 
                            enemyState.actions.walk.fadeIn(FADE_DURATION);
                         } else {
                              enemyState.actions.walk.weight = 1.0; 
                         }
                    }
                }
                // --- Reset Spotlight Target Helper Position (when searching) ---
                if (enemyState.spotLightTargetHelper) {
                    enemyState.spotLightTargetHelper.position.set(-15, 0, 0); // Default forward
                }
                // -----------------------------------------------------------
            }
            break;

        // --- NEW SLEEPING STATE --- 
        case EnemyAIState.SLEEPING:
            let remainingSleepTime = 0; // <<< Declare variable outside the if/else
            
            // <<< Status Text Logic (uses previous frame's timer value) >>>
            if (enemyState.sleepTimer <= 1e-6) { 
                enemyState.statusText = "Deactivated"; 
            } else {
                // Calculate remaining time based on timer BEFORE incrementing for this frame
                const displaySleepTime = Math.max(0, SLEEP_DURATION - enemyState.sleepTimer);
                const sleepMinutes = Math.floor(displaySleepTime / 60);
                const sleepSeconds = Math.floor(displaySleepTime % 60);
                enemyState.statusText = `Sleeping (${sleepMinutes}:${sleepSeconds.toString().padStart(2, '0')} left)`;
            }
            // <<< END Status Text Logic >>>
            
            enemyVelocity.set(0, 0, 0); // Ensure stopped
            targetWorldPos = null;

            // Ensure sounds are stopped
            if (movementSound && enemyState.isMovingSoundPlaying) movementSound.stop();
            enemyState.isMovingSoundPlaying = false;
            if (scanningSound && enemyState.isScanningSoundPlaying) scanningSound.stop();
            enemyState.isScanningSoundPlaying = false;

            // Ensure light is dimmed
            if (enemyState.spotLight && enemyState.spotLight.intensity > 0.11) { // Check > 0.11 to avoid floating point issues
                enemyState.spotLight.intensity = 0.1; // Dim if not already dimmed
            }

            // Ensure walk animation is paused
            if (enemyState.actions.walk) {
                enemyState.actions.walk.timeScale = 0; // Ensure paused
            }

            // --- Wake Timer / Pre-Wake Fade Check --- <<< MODIFIED
            enemyState.sleepTimer += deltaTime; // <<< Increment timer FIRST
            remainingSleepTime = Math.max(0, SLEEP_DURATION - enemyState.sleepTimer); // <<< Calculate AFTER timer increment
            
            // Start fade 4 seconds before waking (uses the updated remainingTime)
            if (!enemyState.isFadingToAwakeMusic && remainingSleepTime <= MUSIC_ANTICIPATION_FADE_DURATION) {
                console.log(`[Music] Approaching wake time, starting fade to danger theme.`);
                playAppropriateMusic(true); // Fade to danger (awake) music
                enemyState.isFadingToAwakeMusic = true;
            }
            // Actual transition to patrol
            if (enemyState.sleepTimer >= SLEEP_DURATION) {
                console.log(`ENEMY STATE: Sleep duration (${SLEEP_DURATION}s) reached. Waking up and returning to PATROLLING.`);
                enemyState.currentState = EnemyAIState.PATROLLING;
                enemyState.sleepTimer = 0; 
                enemyState.patrolTimer = 0; 
                enemyState.statusText = `Patrolling (${Math.max(0, PATROL_DURATION - enemyState.patrolTimer).toFixed(1)}s left)`;
                enemyState.speedMultiplier = 1.0; // Reset speed multiplier
                playAppropriateMusic(true); // Play danger theme for awake
                // Restore light intensity
                if (enemyState.spotLight) enemyState.spotLight.intensity = enemyState.originalSpotlightIntensity;

                // --- Resume and Fade Walk Animation --- 
                if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 1; // RESUME
                    enemyState.actions.walk.reset(); // Reset to beginning
                    enemyState.actions.walk.play();  // Ensure it's playing
                    enemyState.actions.walk.fadeIn(FADE_DURATION); 
                    console.log(`[Enemy Anim] Resumed and fading in walk animation.`);
                }
                // ------------------------------------

                // enemyState.mesh.visible = true; // Show mesh // <<< OLD: Show parent
                // --- NEW: Traverse and show meshes --- 
                enemyMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.visible = true;
                    }
                });
                // -----------------------------------
                enemyState.isFadingToSleepMusic = false; // Reset flag
                
                // <<< Spawn Nodes on Wake Up >>>
                spawnDeactivationNodes();
                
            }
            break;
        // ------------------------
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
            // Apply speed multiplier here
            enemyVelocity.addScaledVector(_tangentAccelDir, config.ENEMY_ACCELERATION * enemyState.speedMultiplier * deltaTime);
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
    // Apply speed multiplier here too
    const maxVelocity = config.ENEMY_MAX_VELOCITY * enemyState.speedMultiplier;
    const maxVelocitySq = maxVelocity * maxVelocity;
    if (enemyVelocity.lengthSq() > maxVelocitySq) {
        enemyVelocity.normalize().multiplyScalar(maxVelocity);
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

    // --- Update Node Logic (If Nodes Exist) --- // <<< EXISTING SECTION
    if (enemyState.deactivationNodes.length > 0) {
        let allNodesActivated = true; // Assume true initially

        enemyState.deactivationNodes.forEach(nodeData => {
            // <<< ADD Ripple Shader Time Update >>>
            if (nodeData.indicatorCircle && nodeData.indicatorCircle.material.uniforms?.uTime) {
                nodeData.indicatorCircle.material.uniforms.uTime.value = now * 0.001; // Convert ms to s
                // console.log(`[Ripple Update] Node ${nodeData.id} uTime updated to: ${nodeData.indicatorCircle.material.uniforms.uTime.value.toFixed(3)}`); // <<< COMMENT OUT LOG
            } else if (nodeData.indicatorCircle) {
                // console.warn(`[Ripple Debug] Node ${nodeData.id} has indicatorCircle but no uTime uniform?`);
            }
            // <<< END Ripple Update >>>

            if (!nodeData.mesh || nodeData.isActivated) {
                 // ... logic for activated/missing nodes ...
                  // <<< Make sure ripple is removed if node is activated >>>
                  if (nodeData.isActivated && nodeData.indicatorCircle) {
                       // <<< ADD Proper Removal/Disposal >>>
                       if (nodeData.indicatorCircle.parent) {
                           nodeData.indicatorCircle.parent.remove(nodeData.indicatorCircle);
                       }
                       if (nodeData.indicatorCircle.geometry) {
                           nodeData.indicatorCircle.geometry.dispose();
                       }
                       if (nodeData.indicatorCircle.material) {
                           nodeData.indicatorCircle.material.dispose(); // Dispose shader material
                       }
                       // <<< END Removal/Disposal >>>
                       nodeData.indicatorCircle = null; // Clear reference
                  }
                  // <<< END Ripple Removal on Activation >>>
                 return; 
            }

            allNodesActivated = false; // Found an inactive node

            // Update animation
            if (nodeData.mixer) {
                // console.log(`[Node Anim Debug] Updating mixer for node ${nodeData.id}`); // <<< REMOVE verbose log
                nodeData.mixer.update(deltaTime);
            }

            // Check player proximity
            if (playerMesh) {
                playerMesh.getWorldPosition(_playerWorldPos);
                nodeData.mesh.getWorldPosition(_targetWorldPos);
                const distanceSq = _playerWorldPos.distanceToSquared(_targetWorldPos);

                if (distanceSq < NODE_INTERACTION_DISTANCE * NODE_INTERACTION_DISTANCE) {
                    // Player is near this inactive node

                    // Check if activation is just starting (progress is 0)
                    if (nodeData.activationProgress === 0) {
                        // Alert enemy if not already hunting or sleeping
                        if (enemyState.currentState !== EnemyAIState.HUNTING && 
                            enemyState.currentState !== EnemyAIState.SLEEPING &&
                            (enemyState.priorityTargetNodeId !== nodeData.id || // Not already targeting this specific node by ID
                             !enemyState.priorityTargetNodePosition || 
                             enemyState.priorityTargetNodePosition.distanceToSquared(_targetWorldPos) > 0.1) 
                           )
                        { 
                            console.log(`ENEMY ALERT: Player started activating node ${nodeData.id} (Progress was 0).`);
                            alertEnemyToNodeActivation(_targetWorldPos.clone(), nodeData.id); // Pass node ID
                        }
                    }

                    // Increment timer and calculate progress regardless of alert
                    enemyState.activationTimers[nodeData.id] += deltaTime;
                    nodeData.activationProgress = Math.min(1.0, enemyState.activationTimers[nodeData.id] / NODE_ACTIVATION_DURATION);

                    // TODO: Add visual feedback for activation progress (e.g., lerp color/emissive)
                    /* // <<< REMOVE Emissive Lerp During Activation >>>
                    // Example: Lerp emissive intensity
                    nodeData.mesh.traverse(child => {
                         if(child.isMesh && child.material.emissive) {
                              // Assuming base emissive is low or black
                              const targetIntensity = 5.0; // Activated intensity
                              child.material.emissiveIntensity = targetIntensity * nodeData.activationProgress;
                         }
                    });
                    */ // <<< END REMOVE Emissive Lerp >>>

                    if (enemyState.activationTimers[nodeData.id] >= NODE_ACTIVATION_DURATION) {
                        console.log(`[Nodes] Node ${nodeData.id} Activated!`);
                        nodeData.isActivated = true;
                        enemyState.activationTimers[nodeData.id] = NODE_ACTIVATION_DURATION; // Cap timer
                        nodeData.activationProgress = 1.0;
                        
                        // --- Set final activated visual state (Green Emissive on CLONED Material) ---
                         nodeData.mesh.traverse(child => {
                              if(child.isMesh && child.material?.emissive) { // Check material exists
                                   const originalMaterial = child.material;
                                   const newMaterial = originalMaterial.clone(); // <<< CLONE Material
                                   newMaterial.emissive.setHex(0x00ff00); // Set color on new material
                                   newMaterial.emissiveIntensity = 5.0;   // Set intensity on new material
                                   child.material = newMaterial; // <<< Assign NEW Material
                              }
                         });
                        // ---------------------------------------------------------------------------
                        // <<< Stop the looping spawn sound for THIS node >>>
                        if (nodeData.spawnSound && nodeData.spawnSound.isPlaying) {
                            nodeData.spawnSound.stop();
                            console.log(`[Node Sound] Stopped spawn sound for activated node ${nodeData.id}`);
                        }
                        // <<< END Stop Spawn Sound >>>
                        
                        // <<< Play the Single Activation Sound >>>
                        const singleActivationSoundBuffer = window.loadedSounds?.singleNodeActivationSound?.buffer; // <<< CORRECTED NAME
                        if (singleActivationSoundBuffer && enemyAudioListenerRef) {
                            const singleSoundInstance = new THREE.PositionalAudio(enemyAudioListenerRef);
                            singleSoundInstance.setBuffer(singleActivationSoundBuffer);
                            // Copy settings from prototype if needed (e.g., refDistance, rolloff)
                            singleSoundInstance.setRefDistance(10); 
                            singleSoundInstance.setRolloffFactor(1.0);
                            nodeData.mesh.add(singleSoundInstance); // Attach to the node mesh
                            singleSoundInstance.play();
                            console.log(`[Node Sound] Played single activation sound for node ${nodeData.id}`);
                            // No need to store reference, it's non-looping
                        } else {
                            console.warn(`[Node Sound] Single activation sound buffer or listener missing for node ${nodeData.id}`);
                        }
                        // <<< END Play Single Activation Sound >>>
                    }
                } else {
                    // Player moved away, reset timer and visual progress
                    if (enemyState.activationTimers[nodeData.id] > 0) {
                         console.log(`[Nodes] Player moved away from node ${nodeData.id}, resetting progress.`);
                         enemyState.activationTimers[nodeData.id] = 0;
                         nodeData.activationProgress = 0;
                          // TODO: Reset visual feedback
                          /* // <<< REMOVE Emissive Reset >>>
                           nodeData.mesh.traverse(child => {
                              if(child.isMesh && child.material.emissive) {
                                   // Assuming original emissive is black or low
                                   child.material.emissive.setHex(0x000000); 
                                   child.material.emissiveIntensity = 0;
                              }
                         });
                         */ // <<< END REMOVE Emissive Reset >>>
                    }
                }
            } else {
                 // No player mesh, ensure timer resets if it was running
                 if (enemyState.activationTimers[nodeData.id] > 0) {
                     enemyState.activationTimers[nodeData.id] = 0;
                     nodeData.activationProgress = 0;
                     // TODO: Reset visual feedback
                      nodeData.mesh.traverse(child => {
                           if(child.isMesh && child.material.emissive) {
                                child.material.emissive.setHex(0x000000); 
                                child.material.emissiveIntensity = 0;
                           }
                      });
                 }
            }
        });

        // Check if all nodes were activated this frame
        if (allNodesActivated) {
             console.log("[Nodes] All nodes activated! Forcing enemy to sleep.");
             // <<< PLAY Sound Here >>>
             const deactivateSound = window.loadedSounds?.deactivateNodeSound;
             if (deactivateSound) {
                if(deactivateSound.isPlaying) deactivateSound.stop(); // Stop if playing
                deactivateSound.play(); // Play from enemy position
                console.log("[SOUND] Played node deactivation sound from enemy position.");
             } else {
                console.warn("[SOUND] Deactivate node sound not loaded for final playback.");
             }
             // <<< END PLAY Sound >>>
             
             enemyState.currentState = EnemyAIState.SLEEPING;
             enemyState.patrolTimer = 0; // Reset timers
             enemyState.sleepTimer = 0;
             enemyState.statusText = "Deactivated"; 
             enemyState.speedMultiplier = 1.0; // Reset speed multiplier
             playAppropriateMusic(false); // Start fade to normal music immediately
             despawnDeactivationNodes();
             triggerScreenShake(1.2, 1.5); // <<< Increased Duration (was 0.7)

             // --- NEW: Regenerate Player Health ---
             if (window.playerState) {
                 window.playerState.health = window.playerState.maxHealth;
                 window.updatePlayerHealthUI(); // Use through window object
                 console.log("[Health] Player health fully regenerated after enemy deactivation!");
             }
             // ---------------------------------

             // Stop movement/scan sounds, pause animation, dim light etc.
             if (movementSound && enemyState.isMovingSoundPlaying) movementSound.stop();
             if (scanningSound && enemyState.isScanningSoundPlaying) scanningSound.stop();
             enemyState.isMovingSoundPlaying = false;
             enemyState.isScanningSoundPlaying = false;
             if (enemyState.spotLight) enemyState.spotLight.intensity = 0.1;
             if (enemyState.actions.walk) enemyState.actions.walk.timeScale = 0;
             enemyMesh.traverse((child) => {
                  if (child.isMesh) child.visible = false;
             });
             // Reset music fade flags (although fade just started)
             enemyState.isFadingToSleepMusic = true; // Mark as fading to sleep
             enemyState.isFadingToAwakeMusic = false;
        }
    }
    // --- END NODE LOGIC ---

    // --- Update Node-to-Enemy Connection Lines --- <<< NEW SECTION FOR LOGS
    // console.log("[Enemy Lines Debug] Checking if lines should be updated..."); // <<< COMMENT OUT LOG
    if (enemyState.deactivationNodes.length > 0 && enemyState.mesh) {
        // const finalLocalPos = enemyState.mesh.position; // <<< ALREADY CALCULATED ABOVE
        // console.log(`[Enemy Lines Debug] Calling updateNodeToEnemyLines with enemy local pos: ${JSON.stringify(finalLocalPos)}`); // <<< COMMENT OUT LOG
        updateNodeToEnemyLines(finalLocalPos); // Pass enemy's local pos
    }
    // ---------------------------------------------

    // --- NEW: Proximity-Based Player Detection (Overrides some states if player gets too close) ---
    if (playerMesh && enemyState.currentState !== EnemyAIState.SLEEPING) {
        playerMesh.getWorldPosition(_playerWorldPos); // Ensure player world position is up-to-date
        const distanceToPlayerSq = _enemyWorldPos.distanceToSquared(_playerWorldPos);

        if (distanceToPlayerSq < ENEMY_PROXIMITY_ALERT_RADIUS * ENEMY_PROXIMITY_ALERT_RADIUS) {
            if (enemyState.currentState !== EnemyAIState.HUNTING) {
                // Don't interrupt if already hunting, but can pull out of other states like PATROLLING, SCANNING, SEARCHING_AREA
                // or even TARGETING_NODE if the player is closer than the node and this becomes higher priority.
                // For now, let's make it interrupt anything but SLEEPING.
                console.log(`ENEMY STATE: Player detected by proximity! Switching to HUNTING. Current state: ${enemyState.currentState}`);
                
                // Stop any ongoing sounds from previous states
                if (scanningSound && enemyState.isScanningSoundPlaying) {
                    scanningSound.stop();
                    enemyState.isScanningSoundPlaying = false;
                }
                if (movementSound && enemyState.isMovingSoundPlaying && enemyState.currentState === EnemyAIState.SCANNING) { // e.g. if was scanning (not moving)
                    movementSound.stop(); // Should be stopped anyway but ensure
                    enemyState.isMovingSoundPlaying = false;
                }

                enemyState.currentState = EnemyAIState.HUNTING;
                enemyState.timeInSpotlight = 0; // Reset spotlight timer, though not directly used for this detection
                enemyState.timeSincePlayerSeen = 0; // Player is currently "seen" by proximity
                enemyState.lastKnownPlayerWorldPos.copy(_playerWorldPos);
                enemyState.statusText = "Hunting (Proximity Alert)";
                enemyState.speedMultiplier = 1.5; // Slightly increased speed for proximity hunt initial engagement
                
                triggerScreenShake(0.5, 0.8); // Moderate shake
                playAppropriateMusic(true); // Ensure danger music

                if (enemyState.actions.walk) {
                    enemyState.actions.walk.timeScale = 1; // Ensure walking
                    if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) {
                        enemyState.actions.walk.fadeIn(FADE_DURATION);
                    } else {
                        enemyState.actions.walk.weight = 1.0;
                    }
                }
                // Play detection sounds (uses the same cooldown mechanism)
                const nowSeconds = performance.now() / 1000;
                if (nowSeconds - enemyState.lastDetectionSoundTime > DETECTION_SOUND_COOLDOWN) {
                    const roarSound = window.loadedSounds?.enemyRoarSound;
                    if (roarSound && !roarSound.isPlaying && roarSound.context.state === 'running') {
                        if (roarSound.parent !== enemyState.mesh) enemyState.mesh.add(roarSound);
                        roarSound.play();
                        enemyState.lastDetectionSoundTime = nowSeconds;
                        console.log(`[Enemy Sound] Proximity: Played Roar. Time: ${nowSeconds.toFixed(1)}`);
                    }
                    if (window.loadedSounds?.alarmSirenSound && !window.loadedSounds.alarmSirenSound.isPlaying && window.loadedSounds.alarmSirenSound.context.state === 'running') {
                        window.loadedSounds.alarmSirenSound.play();
                        console.log(`[Enemy Sound] Proximity: Played Siren. Time: ${nowSeconds.toFixed(1)}`);
                    }
                }
            }
        } else {
            // If player was previously hunted due to proximity and moves out of radius,
            // the normal HUNTING logic (timeSincePlayerSeen) will take over.
            // Reset speed multiplier if it was set by proximity and now out of range, ONLY if not actively hunting via spotlight.
            if (enemyState.speedMultiplier > 1.0 && enemyState.currentState !== EnemyAIState.HUNTING && enemyState.currentState !== EnemyAIState.TARGETING_NODE) {
                 // Check if not hunting due to spotlight before resetting.
                 // This is a bit tricky as isPlayerInSpotlight isn't directly telling us *why* we are hunting.
                 // For now, if we exit proximity, and we are NOT in hunting/targeting_node, reset multiplier.
                 enemyState.speedMultiplier = 1.0;
            }
        }
    }
    // --- END Proximity Detection ---
}

function getFibonacciPatrolPoint(planetRadius) {
    // Implement Fibonacci lattice patrol logic here
    // This is a placeholder and should be replaced with the actual implementation
    return null; // Placeholder return, actual implementation needed
} 

// <<< NEW FUNCTION: Spawn Deactivation Nodes >>>
function spawnDeactivationNodes() {
    // <<< ADD Prerequisite Logs >>>
    console.log("[Node Spawn] Attempting to spawn nodes...");
    console.log(`[Node Spawn] Prerequisite Check: homePlanetRef valid? ${!!homePlanetRef}`);
    console.log(`[Node Spawn] Prerequisite Check: techApertureModelProto loaded? ${!!techApertureModelProto}`);
    console.log(`[Node Spawn] Prerequisite Check: planetsStateRef valid? ${!!planetsStateRef}`); // Added planetsState check
    // <<< END Prerequisite Logs >>>

    if (!homePlanetRef || !techApertureModelProto || !planetsStateRef) { // Added planetsState check
        console.error("Cannot spawn nodes: Missing prerequisite(s). Check logs above.");
        return;
    }
    console.log(`[Nodes] Spawning ${NODES_REQUIRED} deactivation nodes (forced random positions)...`);
    despawnDeactivationNodes(); // Clear any existing nodes first

    const planetRadius = homePlanetRef.geometry.parameters.radius;
    // console.log(`[Enemy Radius Check] spawnDeactivationNodes using geometry radius: ${planetRadius}`); // <<< REMOVE Log radius
    const nodeVerticalOffset = -0.4; // <<< Bring closer to surface (less negative)
    const nodeScale = config.PURPLE_TREE_SCALE; // <<< Restore original scale

    const placedNodePositions = []; // <<< Store positions of nodes placed in THIS spawn event
    const maxPlacementAttempts = 50; // <<< Limit attempts to avoid infinite loops

    for (let i = 0; i < NODES_REQUIRED; i++) {
        let randomLocalSurfacePos;
        let placementAttempts = 0;
        let positionValid = false;

        // <<< Add Retry Loop for Position Generation >>>
        do {
            // Get random LOCAL position ON the surface
            randomLocalSurfacePos = getRandomPositionOnPlanet(homePlanetRef, planetsStateRef); 
            placementAttempts++;

            // Check distance against previously placed nodes in this batch
            let tooClose = false;
            for (const placedPos of placedNodePositions) {
                if (randomLocalSurfacePos.distanceToSquared(placedPos) < MIN_NODE_DISTANCE * MIN_NODE_DISTANCE) {
                    tooClose = true;
                    break; // Too close to this one, no need to check others
                }
            }

            if (!tooClose) {
                positionValid = true; // Found a valid spot
            }
            
        } while (!positionValid && placementAttempts < maxPlacementAttempts);
        // <<< End Retry Loop >>>

        if (!positionValid) {
            console.warn(`[Nodes] Could not find a valid position for node ${i + 1} after ${maxPlacementAttempts} attempts. Spawning anyway, might overlap.`);
            // If it failed, we still use the last generated randomLocalSurfacePos
        }

        // <<< Log the received position >>>
        console.log(`[Nodes]   Node ${i+1} randomLocalSurfacePos (Attempt ${placementAttempts}):`, JSON.stringify(randomLocalSurfacePos));

        console.log(`[Nodes] Spawning node ${i + 1} at local position (approx):`, randomLocalSurfacePos); 
        const nodeMesh = techApertureModelProto.clone(true);
        nodeMesh.scale.set(nodeScale, nodeScale, nodeScale);

        // <<< Attach Node Spawn Loop Sound >>>
        let nodeSpawnSoundInstance = null; 
        const nodeSpawnSoundBuffer = window.loadedSounds?.nodeSpawnLoopSound?.buffer;
        if (nodeSpawnSoundBuffer && enemyAudioListenerRef) { // Check buffer AND listener ref
             // <<< Create NEW instance instead of cloning >>>
             nodeSpawnSoundInstance = new THREE.PositionalAudio(enemyAudioListenerRef);
             nodeSpawnSoundInstance.setBuffer(nodeSpawnSoundBuffer);
             // Copy settings from prototype (adjust if needed)
             nodeSpawnSoundInstance.setLoop(true); 
             nodeSpawnSoundInstance.setRefDistance(10); 
             nodeSpawnSoundInstance.setRolloffFactor(1.0);
             // --------------------------------------------
             nodeMesh.add(nodeSpawnSoundInstance); 
              if (!nodeSpawnSoundInstance.isPlaying) {
                  nodeSpawnSoundInstance.play();
              }
              console.log(`[Node Sound] Attached and playing spawn sound for node ${i + 1}`);
         } else {
             console.warn(`[Node Sound] Node spawn loop sound buffer or listener missing for node ${i + 1}`);
         }
         // <<< END Attach Node Spawn Loop Sound >>>

        // <<< ADD Animation Setup Back >>>
        let nodeMixer = null;
        if (techApertureModelAnimations && techApertureModelAnimations.length > 0) {
            nodeMixer = new THREE.AnimationMixer(nodeMesh);
            const clip = techApertureModelAnimations[0]; 
            const action = nodeMixer.clipAction(clip);
            action.setLoop(THREE.LoopPingPong); // Ensure PingPong loop is set
            action.play();
            console.log(`[Node Anim] Setup animation '${clip.name}' for node ${i + 1}`);
        } else {
            console.warn("[Node Anim] Tech Aperture model has no animations to play.");
        }
        // <<< END Animation Setup >>>
        
        // --- Position and Align using LOCAL Coordinates ---
        // 1. Calculate LOCAL surface normal (direction from planet center to the local surface point)
        const localSurfaceNormal = _vector3.copy(randomLocalSurfacePos).normalize(); 
        
        // 2. Calculate final LOCAL position DIRECTLY
        const finalRadius = planetRadius + nodeVerticalOffset; // e.g., 60 + (-2.8) = 57.2
        const finalLocalPos = _vector3_2.copy(localSurfaceNormal).multiplyScalar(finalRadius); // Direction * final radius

        // 3. Set Alignment based on LOCAL surface normal 
        // (Quaternion is orientation, doesn't matter if normal is local or world if model & parent are aligned)
        _alignmentQuaternion.setFromUnitVectors(_modelUp, localSurfaceNormal);
        nodeMesh.quaternion.copy(_alignmentQuaternion);
        
        // 4. Set mesh position directly to the calculated LOCAL position
        nodeMesh.position.copy(finalLocalPos); 
        
        placedNodePositions.push(finalLocalPos.clone()); // <<< Add successful position to list for next check

        // 5. Add mesh to the parent (planet)
        homePlanetRef.add(nodeMesh); 
        // --------------------------------------------------
        
        // <<< ADD BoxHelper for the FIRST node >>>
        if (i === 0) {
            const boxHelper = new THREE.BoxHelper(nodeMesh, 0xffff00); // Yellow
            homePlanetRef.add(boxHelper); // Add helper to the same parent
            nodeMesh.userData.boxHelper = boxHelper; 
            console.log("[Nodes] Added BoxHelper for first node.");
        }
        // <<< END BoxHelper >>>

        // --- Create RIPPLE effect for this node --- <<< MOVED DEFINITIONS INSIDE LOOP
        const rippleRadius = 4.0; 
        const rippleGeometry = new THREE.CircleGeometry(rippleRadius, 64); // Define GEOMETRY here
        
        // Define SHADERS here (can reuse constants if defined outside loop)
        const rippleVertexShader = `
          varying vec2 vUv;
          uniform float uTime;
          uniform float uFrequency;
          uniform float uAmplitude;

          void main() {
            vUv = uv;
            vec3 pos = position;
            
            float dist = distance(vUv, vec2(0.5)); 
            float sineFactor = sin(dist * uFrequency - uTime * 5.0); // <<< Faster time multiplier
            float displacement = sineFactor * uAmplitude * smoothstep(0.1, 0.45, dist) * (1.0 - smoothstep(0.45, 0.5, dist));
            pos.z += displacement;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `;
        const rippleFragmentShader = `
          varying vec2 vUv;
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uFrequency;

          void main() {
            float dist = distance(vUv, vec2(0.5));
            float sineFactor = sin(dist * uFrequency - uTime * 5.0); // <<< Faster time multiplier
            float pulseFactor = 0.5 + 0.5 * sineFactor; // Remap sine to [0, 1] range
            
            // Fade out alpha towards the edge
            float edgeAlpha = smoothstep(0.5, 0.4, dist);
            
            // Modulate alpha by the pulse factor for transparency in valleys
            float finalAlpha = edgeAlpha * pulseFactor; 
            
            // Keep the intensity calculation for brightness variation
            float intensity = 0.1 + 0.9 * pulseFactor; // <<< Wider contrast range [0.1, 1.0]
            
            gl_FragColor = vec4(uColor * intensity, finalAlpha); // Use finalAlpha
          }
        `;
        
        // <<< Define Uniforms Object Separately >>>
        const rippleUniforms = {
            uTime: { value: 0.0 },
            uColor: { value: new THREE.Color(0x0055ff) }, // Blue base color
            uFrequency: { value: 8.0 }, // <<< Lower frequency for bigger gap
            uAmplitude: { value: 0.3 }  // <<< Increase amplitude for more displacement
        };
        
        const rippleMaterial = new THREE.ShaderMaterial({ // Define MATERIAL here
            vertexShader: rippleVertexShader,
            fragmentShader: rippleFragmentShader,
            uniforms: rippleUniforms, // <<< Use the separate object
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true // <<< CHANGE to true
        });

        // Now create the Mesh using the defined geometry and material
        const indicatorCircle = new THREE.Mesh(rippleGeometry, rippleMaterial);
        indicatorCircle.name = `node_ripple_${i}`;
        console.log(`[Nodes Debug] Created indicatorCircle (ripple mesh) for node ${i+1}`); // Log remains valid

        // Rotation logic
        const circleNormal = new THREE.Vector3(0, 0, 1);
        const circleAlignQuat = new THREE.Quaternion().setFromUnitVectors(circleNormal, localSurfaceNormal);
        indicatorCircle.quaternion.copy(circleAlignQuat);

        // Positioning logic
        const CIRCLE_VERTICAL_OFFSET = 0.8; // <<< Adjust offset to be between previous values
        const circlePosition = finalLocalPos.clone().addScaledVector(localSurfaceNormal, CIRCLE_VERTICAL_OFFSET);
        indicatorCircle.position.copy(circlePosition);

        homePlanetRef.add(indicatorCircle); // Add ripple mesh to planet
        // --- END RIPPLE Creation ---

        // Add node data to state
        enemyState.deactivationNodes.push({
            id: nodeMesh.uuid, 
            mesh: nodeMesh,
            indicatorCircle: indicatorCircle, // Store ripple mesh reference
            mixer: nodeMixer, 
            spawnSound: nodeSpawnSoundInstance, 
            isActivated: false,
            activationProgress: 0.0, 
            beingActivated: false 
        });
        enemyState.activationTimers[nodeMesh.uuid] = 0; // Initialize timer
    }
    console.log(`[Nodes] Finished spawning ${enemyState.deactivationNodes.length} / ${NODES_REQUIRED} nodes.`);
}

// <<< NEW FUNCTION: Despawn Deactivation Nodes >>>
function despawnDeactivationNodes() {
    if (enemyState.deactivationNodes.length === 0) return; // Nothing to despawn
    
    console.log("[Nodes] Despawning all deactivation nodes...");
    enemyState.deactivationNodes.forEach(nodeData => {
        // Stop any playing sounds
        if (nodeData.spawnSound && nodeData.spawnSound.isPlaying) {
            nodeData.spawnSound.stop();
            console.log(`[Node Sound] Stopped spawn sound for node ${nodeData.id}`);
        }

        // Remove indicator circle if it exists
        if (nodeData.indicatorCircle) {
            if (nodeData.indicatorCircle.parent) {
                nodeData.indicatorCircle.parent.remove(nodeData.indicatorCircle);
            }
            if (nodeData.indicatorCircle.geometry) {
                nodeData.indicatorCircle.geometry.dispose();
            }
            if (nodeData.indicatorCircle.material) {
                nodeData.indicatorCircle.material.dispose();
            }
            nodeData.indicatorCircle = null;
        }

        // Remove the node mesh and clean up its resources
        if (nodeData.mesh) {
            if (nodeData.mesh.parent) {
                nodeData.mesh.parent.remove(nodeData.mesh);
            }
            // Clean up all geometries and materials
            nodeData.mesh.traverse(child => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }

        // Clean up animation mixer if it exists
        if (nodeData.mixer) {
            nodeData.mixer.stopAllAction();
            nodeData.mixer = null;
        }
    });

    // Clear all node data
    enemyState.deactivationNodes = [];
    enemyState.activationTimers = {};
    console.log("[Nodes] All nodes and resources cleaned up.");
} 

// <<< ADD BACK MISSING FUNCTION >>>
/**
 * Removes all existing node-to-enemy connection lines from the scene and disposes their geometry.
 */
function removeAllNodeLines() {
    if (enemyState.nodeToEnemyLines.length === 0) return;

    // console.log(`[Enemy Lines Debug] Removing ${enemyState.nodeToEnemyLines.length} old lines.`); // Optional log
    enemyState.nodeToEnemyLines.forEach(line => {
        if (line.parent) {
            line.parent.remove(line);
        }
        if (line.geometry) {
            line.geometry.dispose();
        }
        // Material is shared, so we don't dispose it here
    });
    enemyState.nodeToEnemyLines = []; // Clear the array
}
// <<< END ADD BACK >>>

// <<< NEW DYNAMIC LINE FUNCTION >>>
function updateNodeToEnemyLines(enemyLocalPos) {
    // console.log("[Enemy Lines Debug] updateNodeToEnemyLines called."); // <<< COMMENT OUT LOG
    removeAllNodeLines(); // Clear previous lines first

    if (enemyState.deactivationNodes.length === 0 || !homePlanetRef || !enemyLocalPos) {
        // console.log(`[Enemy Lines Debug] Skipping line creation (Nodes: ${enemyState.deactivationNodes.length}, Planet: ${!!homePlanetRef}, EnemyPos: ${!!enemyLocalPos})`); // <<< COMMENT OUT LOG
        return; // No nodes, planet, or enemy position to draw to
    }

    // <<< ADD BACK Line Material Definition >>>
    const lineMaterial = new THREE.LineDashedMaterial({ // Shared material
        color: 0x0055ff, // Blue
        linewidth: 2, // Thinner dashed lines
        scale: 1,
        dashSize: 0.5, // Smaller dashes
        gapSize: 0.3,  // Smaller gaps
        depthTest: true // Render on top <<< CHANGE TO TRUE
    });
    // <<< END ADD BACK >>>

    // console.log(`[Enemy Lines Debug] Looping through ${enemyState.deactivationNodes.length} nodes to create lines.`); // <<< COMMENT OUT LOG
    enemyState.deactivationNodes.forEach(nodeData => {
        if (!nodeData.mesh || nodeData.isActivated) {
            // console.log(`[Enemy Lines Debug] Skipping line for node ${nodeData.id} (Mesh: ${!!nodeData.mesh}, Activated: ${nodeData.isActivated})`); // <<< COMMENT OUT LOG
            return; // Skip inactive or broken nodes
        }

        // --- START Arc Calculation ---
        const nodeLocalPos = nodeData.mesh.position;
        const startDir = nodeLocalPos.clone().normalize();
        const endDir = enemyLocalPos.clone().normalize();

        // Calculate the angle between the vectors
        const angle = startDir.angleTo(endDir);

        const arcPointsLocal = []; // Make sure this is initialized here

        if (Math.abs(angle) < 0.001 || Math.abs(angle - Math.PI) < 0.001) {
            // Vectors are collinear or anti-parallel, create a simple straight line
            // (This case might need refinement depending on desired visual)
            arcPointsLocal.push(nodeLocalPos.clone());
            arcPointsLocal.push(enemyLocalPos.clone());
            // console.warn(`[Enemy Lines Debug] Node ${nodeData.id}: Using straight line due to near collinear points.`); // <<< COMMENT OUT LOG
        } else {
            // Calculate the rotation axis (cross product)
            const axis = new THREE.Vector3().crossVectors(startDir, endDir).normalize();

            // Define the number of segments for the arc
            const segments = 20; // Adjust for smoothness
            const planetRadius = homePlanetRef.geometry.parameters.radius;
            const LINE_VERTICAL_OFFSET = 1.5; // <<< Define offset height

            // Generate points along the arc using Quaternion rotation
            const q = new THREE.Quaternion();
            arcPointsLocal.push(nodeLocalPos.clone()); // <<< Start with actual node position
            for (let i = 1; i < segments; i++) { // <<< Loop from 1 to segments-1
                const t = i / segments; // Interpolation factor (0 to 1)
                q.setFromAxisAngle(axis, angle * t); // Rotate by fraction of angle

                // Rotate the start direction vector
                const pointDir = startDir.clone().applyQuaternion(q);
                const surfaceNormal = pointDir.clone(); // Normalized direction is the normal

                // Scale back to planet radius to get position on surface
                const pointOnSurface = pointDir.multiplyScalar(planetRadius);
                const finalPoint = pointOnSurface.addScaledVector(surfaceNormal, LINE_VERTICAL_OFFSET); // <<< Add offset
                arcPointsLocal.push(finalPoint);
            }
            arcPointsLocal.push(enemyLocalPos.clone()); // <<< End with actual enemy position
        }
        // --- END Arc Calculation ---

        // <<< ADD Log to check calculated points >>>
        // console.log(`[Enemy Lines Debug] Node ${nodeData.id}: Calculated ${arcPointsLocal.length} points for arc.`); // <<< COMMENT OUT LOG
        if (arcPointsLocal.length > 0) {
            // Optionally log first/last point for sanity check (can be verbose)
            // console.log(`  Start: ${JSON.stringify(arcPointsLocal[0])}, End: ${JSON.stringify(arcPointsLocal[arcPointsLocal.length - 1])}`);
        } else {
             console.warn(`[Enemy Lines Debug] Node ${nodeData.id}: arcPointsLocal is EMPTY!`); // <<< Keep this important warning
        }
        // <<< END Log >>>

        try { // Wrap geometry/line creation in try...catch
            // <<< ADD BACK: Create BufferGeometry directly from the calculated points >>>
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(arcPointsLocal);
            
            // --- Manual line distance calculation --- 
            const positions = lineGeometry.attributes.position.array;
            const count = lineGeometry.attributes.position.count; // Use count property
            const distances = [];
            distances[0] = 0;
            for (let i = 1; i < count; i++) {
                const x1 = positions[(i - 1) * 3];
                const y1 = positions[(i - 1) * 3 + 1];
                const z1 = positions[(i - 1) * 3 + 2];
                const x2 = positions[i * 3];
                const y2 = positions[i * 3 + 1];
                const z2 = positions[i * 3 + 2];
                distances[i] = distances[i - 1] + Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2));
            }
            lineGeometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(distances), 1));
            // --- END Manual Calculation ---

            // Create the THREE.Line object
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.computeLineDistances(); 
            line.frustumCulled = false; 

            // Add line to scene and state
            homePlanetRef.add(line);
            enemyState.nodeToEnemyLines.push(line); // Store reference
            // console.log(`[Enemy Lines Debug] Successfully created and added line for node ${nodeData.id}`); // <<< COMMENT OUT LOG

        } catch (error) {
            console.error(`[Nodes Line Error] Failed to create line for node ${nodeData.id}:`, error);
        }
    });
} 

// NEW function to alert enemy to node activation
export function alertEnemyToNodeActivation(nodeWorldPosition, nodeId) { // Added nodeId parameter
    if (!enemyState || !enemyState.isInitialized || enemyState.currentState === EnemyAIState.SLEEPING) {
        return; // Don't react if not initialized or sleeping
    }

    // Allow alert to interrupt SEARCHING_AREA state
    if (enemyState.currentState === EnemyAIState.HUNTING && enemyState.timeSincePlayerSeen < (config.HUNT_GIVE_UP_TIME / 2) ) {
         console.log("[Enemy Alert] Already actively hunting player, ignoring node alert for now.");
        return;
    }
    
    console.log("ENEMY STATE: Alerted to node activation. Switching to TARGETING_NODE.");
    console.log("ENEMY STATE: Entered TARGETING_NODE"); // Log entry
    enemyState.currentState = EnemyAIState.TARGETING_NODE;
    enemyState.priorityTargetNodePosition = nodeWorldPosition.clone();
    enemyState.priorityTargetNodeId = nodeId; // Store the node ID
    enemyState.scanTimer = 0; // Reset scan timer if it was scanning
    enemyState.patrolTimer = 0; // Reset patrol timer
    enemyState.speedMultiplier = 2.0; // << SET SPEED MULTIPLIER

    // Ensure danger music is playing
    playAppropriateMusic(true);

    // Stop scanning sound if it was playing
    const scanningSound = window.loadedSounds?.enemyScanningSound;
    if (scanningSound && enemyState.isScanningSoundPlaying) {
        scanningSound.stop();
        enemyState.isScanningSoundPlaying = false;
    }
     // Ensure walk animation is playing
    if (enemyState.actions.walk) {
        enemyState.actions.walk.timeScale = 1;
        if (enemyState.actions.walk?.getEffectiveWeight() === 0.0) {
            enemyState.actions.walk.fadeIn(0.3); // General fade duration
        } else {
            enemyState.actions.walk.weight = 1.0;
        }
    }
}