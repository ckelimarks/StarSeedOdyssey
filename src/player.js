import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { createSphere } from './planets.js';
import { 
    startRollingSound, 
    stopRollingSound,
    setRollingSoundLoop, 
    setRollingSoundVolume,
    playBoostBurstSound,
    playBoostRiseSound,
    stopBoostRiseSound,
    playPlayerJumpSound,
    playPlayerLandSound, // ADDED Land Sound Import
    inventory, // << IMPORT inventory
    playSlowdownSound, // <<< IMPORT Slowdown Sound Player
    updateInventoryDisplay, // <<< ADD import for inventory display update
    seedModelProto, // <<< ADD import for seed model
    mossyLogModelProto, // <<< ADD import for mossy log model
    seedModelLoadPromise, // Add this import
    mossyLogModelLoadPromise, // Add this import
    seedGems // Add seedGems to imports
} from './resources.js'; // Import sound functions
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Use full URL

// Module-level variables for player state
let playerSphere = null;
// let playerVelocity = new THREE.Vector3(); // <<< REMOVE Unused module-level velocity
const keyState = { 
    'ArrowUp': false, 
    'ArrowDown': false, 
    'ArrowLeft': false, 
    'ArrowRight': false,
    ' ': false, // Spacebar
    'Shift': false, // NEW: Track Shift key
    'l': false, // CHANGED: Use lowercase 'l' for launch key state
    'b': false, // NEW: Added 'B' key state
    'p': false, // NEW: Added 'P' key state
    'P': false // NEW: Added 'P' key state
};
let bKeyPressedLastFrame = false; // NEW: Track B key state for toggling

// Path Trail variables
let pathPoints = []; // REVERTED: Back to pathPoints
let pathLine = null; // KEEP: pathLine (ensure it's LineSegments)
// --- Define Material ONCE at module level --- 
let pathMaterial = new THREE.LineDashedMaterial({ 
    color: 0xffffff, 
    linewidth: 3, // INCREASED from 2
    scale: 1, 
    // --- Adjust dash/gap ratio ---
    dashSize: config.MIN_PATH_DISTANCE * 0.7, // Was 0.6
    gapSize: config.MIN_PATH_DISTANCE * 0.3, // Was 0.4
    // -----------------------------
    // depthTest: false // REMOVED: Test without forcing it on top
});
// -------------------------------------------
let pathGeometry = null; // ADDED: Module-level geometry
let pathTrailNeedsUpdate = false; // KEEP: pathTrailNeedsUpdate
const PATH_TRAIL_MAX_POINTS = 1500; // Max points STORED (for long mini-map trail)
const MAIN_TRAIL_DRAW_POINTS = 300; // NEW: Max points DRAWN for main trail
const PATH_TRAIL_MIN_DISTANCE_SQ = config.MIN_PATH_DISTANCE * config.MIN_PATH_DISTANCE; // Use squared distance
let lastPathTrailPosition = new THREE.Vector3(Infinity, Infinity, Infinity); // Initialize far away

// Temporary vectors for calculations within this module
const _tempMatrix = new THREE.Matrix4();
const _playerWorldPos = new THREE.Vector3();
const _homePlanetWorldPos = new THREE.Vector3();
const _vector3 = new THREE.Vector3(); // General purpose temp vector
const _tempQuat = new THREE.Quaternion(); // NEW: For orientation calculations
const _origin = new THREE.Vector3(0, 0, 0); // NEW: For lookAt matrix

// NEW: Player Model Prototype
let playerModelProto = null;

// NEW: Store Audio Listener reference
let audioListenerRef = null;

// NEW: Sound state
let isRollingSoundPlaying = false;
let isRollingSoundFadingOut = false;
let rollingFadeStartTime = 0;
let wasFueledLastFrame = true; // Assume starting with fuel

// --- NEW: Speech Bubble State ---
let speechBubbleState = {
    canvas: null,
    context: null,
    texture: null,
    sprite: null,
    isVisible: false,
    // Default position offset (adjust later)
    // Increase Y component multiplier from 3 to 6 for even higher
    offset: new THREE.Vector3(0, config.PLAYER_RADIUS * 1.5 * 6, 0)
};
// -----------------------------

// --- Boost Trail --- (NEW)
let boostTrailPoints = [];
let boostTrailMesh = null;

// <<< ADD Flag for Audio Context Resume >>>
let audioContextResumed = false;
// -----------------------------------------

// Initialize Player
function initPlayer(scene, homePlanet, audioListener) {
    console.log("Player INIT: Creating player mesh...");
    if (!scene) {
        throw new Error("Player INIT: scene is required.");
    }
    if (!homePlanet) {
        throw new Error("Player INIT: homePlanet is required.");
    }
    if (!audioListener) {
        console.warn("Player INIT: Audio Listener not provided.");
    } else {
        audioListenerRef = audioListener; // Store reference
    }
    
    // Get home planet radius directly for initial placement
    const homePlanetRadius = homePlanet.geometry.parameters.radius;
    if (!homePlanetRadius) {
        throw new Error(`Player INIT: Could not get radius from home planet geometry: ${homePlanet.name}`);
    }
    
    // Create player state object
    const playerState = {
        mesh: null,
        visualMesh: null,
        velocity: new THREE.Vector3(),
        targetLookDirection: new THREE.Vector3(),
        isRollingSoundPlaying: false,
        isJumping: false,
        jumpStartTime: 0,
        jumpHeight: 0,
        jumpPeakReached: false,
        jumpStartPosition: new THREE.Vector3(),
        jumpStartVelocity: new THREE.Vector3(),
        jumpGravity: -9.8,
        jumpInitialVelocity: 5,
        jumpMaxHeight: 2,
        jumpDuration: 0.5,
        jumpCooldown: 0.5,
        lastJumpTime: 0,
        health: config.PLAYER_MAX_HEALTH,
        maxHealth: config.PLAYER_MAX_HEALTH,
        inventory: {
            seeds: config.INITIAL_SEEDS,
            fuel: config.INITIAL_FUEL
        },
        // --- NEW Boost State ---
        // Initialize so boost is available immediately
        lastBoostTime: performance.now() - (config.BOOST_COOLDOWN_DURATION * 1000 + 100), 
        boostStartTime: 0, // ADDED: Timestamp when current boost started
        isRiseSoundPlaying: false, // Is the continuous rise sound playing?
        wasBoostingLastFrame: false, // Track boost state change for burst sound
        // -----------------------
        wasFueledLastFrame: true, // NEW: Track fuel state for sound trigger
        boostTrail: null, // NEW: Added boostTrail reference
    };

    // Assign health and maxHealth after object creation
    playerState.health = 3; // Default numeric value
    playerState.maxHealth = config?.PLAYER_MAX_HEALTH ?? 3; // Read from config OR use default 3
    console.log(`[Player INIT DEBUG] Assigned health: ${playerState.health}, maxHealth: ${playerState.maxHealth} from config: ${config?.PLAYER_MAX_HEALTH}`);

    // Player initial position is LOCAL to the home planet
    const playerLocalPosition = new THREE.Vector3(0, homePlanetRadius + config.PLAYER_RADIUS, 0);
    
    // --- Load Player Model --- 
    const loader = new GLTFLoader();
    loader.load(
        'models/ai_robot/ai_robot.gltf', 
        function (gltf) { // Success callback
            console.log('Player (AI Robot) GLTF model loaded.');
            playerModelProto = gltf.scene;
            
            // --- Refactor: Create Parent Wrapper (playerRoot) ---
            const playerRoot = new THREE.Object3D();
            playerRoot.name = 'playerRoot'; // Name the parent
            playerRoot.position.copy(playerLocalPosition); // Position the PARENT
            // -------------------------------------------------

            // --- Create Visual Model (playerMesh) ---
            const visualMesh = playerModelProto.clone(true); // <<< Use different variable name
            visualMesh.scale.set(config.PLAYER_MODEL_SCALE, config.PLAYER_MODEL_SCALE, config.PLAYER_MODEL_SCALE);
            // visualMesh.name = 'playerVisual'; // Optional name change

            // Ensure shadows on visual model
            visualMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            // ----------------------------------------

            // --- Apply Visual Offset to CHILD mesh ---
            visualMesh.translateY(-0.5); // Apply offset to visual mesh
            // ----------------------------------------

            // --- Add Child to Parent ---
            playerRoot.add(visualMesh); // Add visual model to the physics root
            // --------------------------

            // --- Apply Initial Orientation to PARENT ---
            // Store initial position OF PARENT
            const initialPosition = playerRoot.position.clone(); 
            const planetCenter = homePlanet.position.clone(); 
            
            const up = initialPosition.clone().sub(planetCenter).normalize();
            
            let worldForward = new THREE.Vector3(0, 0, 1);
            if (Math.abs(up.z) > 0.999) { 
                worldForward.set(1, 0, 0);
            }
            
            const right = new THREE.Vector3().crossVectors(worldForward, up).normalize();
            if (right.lengthSq() < 0.0001) {
                 console.warn("Player INIT: Could not calculate 'right' vector, falling back.");
                 let fallbackWorldAxis = new THREE.Vector3(0, 1, 0);
                 if (Math.abs(up.y) > 0.999) fallbackWorldAxis.set(1, 0, 0);
                 right.crossVectors(fallbackWorldAxis, up).normalize();
            }

            const forward = new THREE.Vector3().crossVectors(up, right).normalize(); 
            
            _tempMatrix.lookAt(_origin, forward, up); 
            _tempQuat.setFromRotationMatrix(_tempMatrix);
            playerRoot.quaternion.copy(_tempQuat); // Apply rotation to PARENT
            
            // Restore position OF PARENT
            playerRoot.position.copy(initialPosition);
            
            // Apply 180-degree Y-axis flip to PARENT
            const flipAxis = new THREE.Vector3(0, 1, 0);
            const flipAngle = Math.PI;
            const flipQuat = new THREE.Quaternion().setFromAxisAngle(flipAxis, flipAngle);
            playerRoot.quaternion.multiply(flipQuat); // Apply flip to PARENT
            // --- END Orientation on PARENT ---

            // --- Add Parent to Scene ---
            homePlanet.add(playerRoot); // Add the PARENT to the planet
            console.log('[DEBUG] playerRoot (parent) before assignment:', playerRoot);
            playerState.mesh = playerRoot; // Assign PARENT to state.mesh
            playerState.visualMesh = visualMesh; // <<< ASSIGN visual mesh to state.visualMesh
            console.log('[DEBUG] playerState after PARENT and VISUAL mesh assignment:', playerState);
            console.log(`Player INIT: Player root added as child of ${homePlanet.name}`);
            // -------------------------

            // --- DEBUG: Add Axes Helper to PARENT (Optional) ---
            if (config.DEBUG_SHOW_PLAYER_AXES) {
                const axesHelper = new THREE.AxesHelper(3); // Slightly larger helper on parent
                playerRoot.add(axesHelper);
            }
            // --- END DEBUG ---

            playerRoot.matrixWorldNeedsUpdate = true; // Ensure parent's world matrix is updated
            
            console.log("Player INIT: Set initial orientation on PARENT and applied flip.");

            // Initialize Path Trail using PARENT object AND VISUAL MESH REFERENCE
            initializePathTrail(homePlanet, playerState); // <<< Pass the whole state object

            // --- NEW: Initialize Boost Trail --- 
            const trailGeo = new THREE.BufferGeometry();
            const trailMat = new THREE.MeshBasicMaterial({
                color: config.BOOST_TRAIL_COLOR, // Base color, vertex colors will modify alpha
                side: THREE.DoubleSide, // Render both sides
                transparent: true,
                vertexColors: true, // Use vertex colors for alpha gradient
                // depthWrite: false // Optional: Prevents trail writing to depth buffer if needed
            });
            boostTrailMesh = new THREE.Mesh(trailGeo, trailMat);
            boostTrailMesh.name = 'boostTrail';
            boostTrailMesh.visible = false; // Start hidden
            scene.add(boostTrailMesh); // Add to the main scene
            console.log("Player INIT: Boost trail initialized.");
            // --- END NEW Boost Trail Init ---

            // --- NEW: Initialize Speech Bubble ---
            if (playerState.mesh) { // Keep attaching to parent root for now
                 initSpeechBubble(playerState.mesh); 
            } else {
                console.error("Player INIT Error: Cannot initialize speech bubble, player mesh not found.");
            }
            // -----------------------------------

        }, 
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the player GLTF:', error);
            // Maybe fallback to sphere?
            console.log("Player INIT: Falling back to sphere geometry due to load error.");
            playerState.mesh = createSphere(config.PLAYER_RADIUS, 0xff0000, playerLocalPosition, 'player_fallback');
            playerState.visualMesh = playerState.mesh; // Fallback uses same mesh for both
            homePlanet.add(playerState.mesh);
            initializePathTrail(homePlanet, playerState); // Pass state object for fallback
        }
    );
    // --- End Load Player Model ---

    // Setup Controls
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    console.log("Player INIT: Controls initialized.");
    
    return playerState; // Return the state object
}

// NEW: Separate function to initialize path trail
function initializePathTrail(parentObject, playerState) {
    if (!parentObject || !playerState) {
        console.error("initializePathTrail: Missing parentObject or playerState");
        return;
    }
    // --- Make sure pathLine/Material/Geometry are initialized before use ---
    if (!pathGeometry) pathGeometry = new THREE.BufferGeometry();
    if (!pathLine) {
        // Use the module-level pathMaterial
        pathLine = new THREE.LineSegments(pathGeometry, pathMaterial); 
        pathLine.frustumCulled = false;
    }
    // ------------------------------------------------------------------

    // Get initial player position for first point
    const initialWorldPos = new THREE.Vector3();
    playerState.visualMesh.getWorldPosition(initialWorldPos);
    const initialLocalPos = parentObject.worldToLocal(initialWorldPos);
    pathPoints.length = 0; // Clear any previous points
    pathPoints.push(initialLocalPos.clone()); // Start with current position
    lastPathTrailPosition.copy(initialWorldPos); // Set initial last position
    
    // --- Update geometry and add line --- (CORRECT NAME)
    pathGeometry.setFromPoints(pathPoints); // Set initial geometry
    pathLine.computeLineDistances(); // Compute distances for dashes
    if (!pathLine.parent) { // Only add if not already added
        parentObject.add(pathLine); // Add the line to the parent (planet)
        console.log("Player INIT: Path trail line added to parent.");
    } else {
        console.log("Player INIT: Path trail line already added.");
    }
    pathTrailNeedsUpdate = true; // Mark for update in next frame
    // ----------------------------------
}

// Event Handlers
function handleKeyDown(event) {
    const key = event.key;
    keyState[key] = true;
    
    // <<< ADD: Attempt to resume AudioContext on first key press >>>
    if (!audioContextResumed && audioListenerRef?.context) { // Check flag and listener
        if (audioListenerRef.context.state === 'suspended') {
            console.log("Resuming audio context...");
            audioListenerRef.context.resume().then(() => {
                console.log("AudioContext resumed successfully!");
                audioContextResumed = true; // Set flag only on successful resume
            }).catch(err => {
                console.error("Error resuming AudioContext:", err);
                // Keep flag false so we might retry on next key press?
            });
        } else {
            // Context already running or in a different state, mark as handled
            console.log(`AudioContext already in state: ${audioListenerRef.context.state}. Marking as resumed.`);
            audioContextResumed = true; 
        }
    }
    // <<< END AudioContext Resume Logic >>>

    // --- Handle Boost Input (Shift Key) --- 
    if (key === 'Shift') {
        keyState['Shift'] = true;
    }

    // --- Handle Planting (P Key) ---
    if (key === 'p' || key === 'P') {
        plantSeed();
    }
}

function handleKeyUp(event) {
    const key = event.key;
    // Normalize 'L' to 'l'
    const normalizedKey = (key === 'L') ? 'l' : key;

    // Use event.key for Shift detection
    // Check against the normalized key
    if (key === 'Shift' || keyState.hasOwnProperty(normalizedKey)) { 
        keyState[normalizedKey] = false; // Use normalized key
    }
}

// --- Player Update Function (Called from main loop) ---
export function updatePlayer(deltaTime, camera, homePlanet, planetsState) {
    if (!playerState.mesh || !homePlanet || !homePlanet.geometry?.parameters?.radius) {
        // console.log("Player update skipped: mesh or planet not ready");
        return; // Exit if player mesh isn't loaded yet or planet data missing
    }

    const now = performance.now(); // Get current time for boost calculations
    const homePlanetRadius = homePlanet.geometry.parameters.radius;
    const playerMesh = playerState.mesh;
    const playerVelocity = playerState.velocity;

    // --- IMMEDIATE Fuel Check & Braking/Boost Cancel ---
    const hasFuel = inventory.fuel > 1e-6; // Use small threshold to avoid floating point issues
    if (!hasFuel) {
        // --- Play Sound on Transition ---
        if (playerState.wasFueledLastFrame) {
            playSlowdownSound(); // Play sound when fuel first runs out
            stopRollingSound(); // <<< Stop rolling sound explicitly
            playerState.isRollingSoundPlaying = false; // Ensure state reflects stop
            playerState.isRollingSoundFadingOut = false;
        }
        // ------------------------------

        // Fuel is depleted: Apply brakes and cancel boost
        // playerVelocity.multiplyScalar(0.4); // REMOVED immediate velocity reduction
        if (playerState.boostStartTime > 0) {
            console.log("[FUEL DEPLETED] Cancelling active boost.");
            playerState.boostStartTime = 0; // Stop boost
            playerState.lastBoostTime = now; // Trigger cooldown immediately
            if (playerState.isRiseSoundPlaying) {
                stopBoostRiseSound(); // Stop boost sound
                playerState.isRiseSoundPlaying = false;
            }
        }
    }
    // --- END IMMEDIATE Fuel Check ---

    // --- Update wasFueledLastFrame state AFTER the check ---
    playerState.wasFueledLastFrame = hasFuel;
    // -----------------------------------------------------

    // --- Fuel Check & Speed Adjustment ---
    const currentMaxVelocity = hasFuel ? config.MAX_VELOCITY : config.MAX_VELOCITY * 0.4; // Reduce to 40% if no fuel
    const currentAcceleration = hasFuel ? config.ACCELERATION : config.ACCELERATION * 0.4; // Reduce acceleration to 40% too
    const currentBoostMaxVelocity = hasFuel ? config.BOOST_MAX_VELOCITY : currentMaxVelocity; // No boost speed without fuel
    const currentBoostAcceleration = hasFuel ? config.BOOST_ACCELERATION : currentAcceleration; // No boost accel without fuel
    const canBoost = hasFuel && (now - playerState.lastBoostTime) > config.BOOST_COOLDOWN_DURATION * 1000 && playerState.boostStartTime === 0;
    // -----------------------------------

    // Get world positions
    playerMesh.getWorldPosition(_playerWorldPos);
    homePlanet.getWorldPosition(_homePlanetWorldPos); // Usually 0,0,0 but good practice

    // Calculate the up vector (normal to planet surface) using WORLD positions
    const planetUp = _vector3.copy(_playerWorldPos).sub(_homePlanetWorldPos).normalize();
    
    // --- Calculate Tangents based on Camera (World Space) --- 
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    let tangentForward = cameraForward.clone().sub(
        planetUp.clone().multiplyScalar(cameraForward.dot(planetUp))
    );
    // Handle gimbal lock / pole singularity for tangent forward
    if (tangentForward.lengthSq() < config.POLE_THRESHOLD) { 
             const worldX = new THREE.Vector3(1, 0, 0);
        tangentForward = worldX.clone().sub(
                  planetUp.clone().multiplyScalar(worldX.dot(planetUp))
             );
        if (tangentForward.lengthSq() < config.POLE_THRESHOLD) {
                  const worldZ = new THREE.Vector3(0, 0, 1);
             tangentForward = worldZ.clone().sub(
                       planetUp.clone().multiplyScalar(worldZ.dot(planetUp))
                  );
        }
    }
    tangentForward.normalize();

    const tangentRight = new THREE.Vector3().crossVectors(planetUp, tangentForward).normalize();
    
    // --- Calculate Movement Delta (using playerState.velocity) --- 
    let accelerationVector = new THREE.Vector3();
    let isMovingByKey = false; 
    if (keyState['ArrowUp']) { 
        // --- Apply currentAcceleration --- 
        accelerationVector.addScaledVector(tangentForward, currentAcceleration * deltaTime);
        isMovingByKey = true; 
    } 
    if (keyState['ArrowDown']) { 
        // --- Apply currentAcceleration --- 
        accelerationVector.addScaledVector(tangentForward.negate(), currentAcceleration * deltaTime);
        isMovingByKey = true; 
    } 
    if (keyState['ArrowLeft']) { 
        // --- Apply currentAcceleration --- 
        accelerationVector.addScaledVector(tangentRight, currentAcceleration * deltaTime); // Use POSITIVE tangentRight for LEFT
        isMovingByKey = true; 
    } 
    if (keyState['ArrowRight']) { 
        // --- Apply currentAcceleration --- 
        accelerationVector.addScaledVector(tangentRight.negate(), currentAcceleration * deltaTime); // Use NEGATIVE tangentRight for RIGHT
        isMovingByKey = true; 
    } 

    // Apply acceleration directly to velocity
    if (accelerationVector.lengthSq() > 0) {
        playerVelocity.add(accelerationVector); // Apply the scaled acceleration
    }

    // --- Apply Friction Conditionally ---
    const currentFriction = hasFuel ? config.FRICTION : config.OUT_OF_FUEL_FRICTION;
    playerVelocity.multiplyScalar(1.0 - (1.0 - currentFriction) * deltaTime * 60);
    // --- End Conditional Friction ---

    // --- REVISED Boost Logic ---
    const wantsToBoost = keyState['Shift'];
    const timeSinceLastBoost = (now - playerState.lastBoostTime) / 1000;
    const isBoostOnCooldown = timeSinceLastBoost < config.BOOST_COOLDOWN_DURATION;
    
    // Determine if boosting THIS frame
    let isBoosting = false;
    if (wantsToBoost) {
        if (playerState.wasBoostingLastFrame) {
            // Continue boosting (ignore cooldown while active)
            isBoosting = true;
        } else if (!isBoostOnCooldown) {
            // Start boosting this frame (only if not on cooldown)
            isBoosting = true;
        } 
        // else: wants to boost, but wasn't boosting and is on cooldown -> remain false
    } 
    // else: wantsToBoost is false -> remain false

    // --- NEW: Check Boost Duration Limit ---
    if (isBoosting && playerState.boostStartTime > 0) { // Only check if already boosting and start time is set
        const boostElapsedTime = (now - playerState.boostStartTime) / 1000;
        if (boostElapsedTime > config.BOOST_MAX_DURATION) {
            console.log(`[BOOST] Duration limit (${config.BOOST_MAX_DURATION}s) reached. Forcing boost off.`);
            isBoosting = false; // Force boost off
            // We'll handle sound stop and cooldown start below in the standard boost logic
        }
    }
    // -------------------------------------
    
    // Apply acceleration and friction to playerState.velocity
    if (accelerationVector.lengthSq() > 0) {
        // Use boost constants if boosting is active
        let currentAcceleration;
        if (isBoosting) {
            // Apply reduced acceleration if also jumping
            currentAcceleration = playerState.isJumping
                ? config.BOOST_ACCELERATION * config.BOOST_JUMP_ACCELERATION_MULTIPLIER
                : config.BOOST_ACCELERATION;
        } else {
            currentAcceleration = config.ACCELERATION;
        }

        // Calculate Max Velocity (REMOVED boost-jump reduction logic)
        const currentMaxVelocity = isBoosting ? config.BOOST_MAX_VELOCITY : config.MAX_VELOCITY;
        
        playerVelocity.add(accelerationVector.multiplyScalar(currentAcceleration * deltaTime));
        if (playerVelocity.length() > currentMaxVelocity) {
            playerVelocity.normalize().multiplyScalar(currentMaxVelocity);
        }
    } else {
        // Apply friction (no change needed here)
        playerVelocity.multiplyScalar(1.0 - (1.0 - config.FRICTION) * deltaTime * 60); 
    }
    
    // Stop completely if velocity is very low (no change needed here)
    if (playerVelocity.lengthSq() < 1e-8) {
        playerVelocity.set(0, 0, 0);
    }

    // --- REVISED Boost Sound & Cooldown Trigger Logic ---
    if (isBoosting) {
        if (!playerState.wasBoostingLastFrame) {
            // Boost just started this frame
            playBoostBurstSound(playerMesh); 
            playerState.boostStartTime = now; // <<< Record boost start time
            console.log("[BOOST] Boost Activated! Duration timer started.");
        }
        if (!playerState.isRiseSoundPlaying) {
            // Start the rise sound if not already playing
            playBoostRiseSound(playerMesh); 
            playerState.isRiseSoundPlaying = true;
        }
    } else {
        // Not boosting THIS frame
        if (playerState.wasBoostingLastFrame) {
            // Boost just STOPPED this frame (either by key release or duration limit)
            if (playerState.isRiseSoundPlaying) { 
                 stopBoostRiseSound();
                 playerState.isRiseSoundPlaying = false;
            }
            playerState.lastBoostTime = now; // Start cooldown
            playerState.boostStartTime = 0; // Reset boost start time
            console.log("[BOOST] Boost Deactivated. Cooldown started.");
        }
    }
    // --- END Boost Sound & Cooldown Logic ---
    
    // --- Handle Jump Input (before position calculation) ---
    if (keyState[' '] && !playerState.isJumping && playerState.isGrounded) { // Only jump if grounded
        // Check if boosting *at the moment of jump initiation*
        const isBoostingAtJumpStart = keyState['Shift']; // Check Shift key state now
        const initialVelocity = isBoostingAtJumpStart 
            ? config.JUMP_INITIAL_VELOCITY * config.BOOST_JUMP_INITIAL_VELOCITY_MULTIPLIER
            : config.JUMP_INITIAL_VELOCITY;
            
        playerState.verticalVelocity = initialVelocity; // Use calculated initial velocity
        playerState.isJumping = true;
        playerState.isGrounded = false; // Player is no longer grounded
        keyState[' '] = false; // Consume jump input
        
        playPlayerJumpSound();
        
        console.log(`[JUMP] Jump initiated! Initial VVel: ${initialVelocity.toFixed(2)} (Boosting: ${isBoostingAtJumpStart})`); // Debug log
    }
    // -------------------------------------------------------

    // --- Handle Rolling Sound with Fade Out --- 
    // Reuse 'now' calculated earlier for boost checks

    // 1. Update Fade Out if it's happening (Only if fueled)
    if (hasFuel && playerState.isRollingSoundFadingOut) { // <<< Added hasFuel check
        const elapsedFadeTime = (now - playerState.rollingFadeStartTime) / 1000; // in seconds
        if (elapsedFadeTime >= config.ROLLING_SOUND_FADE_DURATION) {
            // Fade complete
            stopRollingSound(); // Actually stop the sound
            playerState.isRollingSoundPlaying = false;
            playerState.isRollingSoundFadingOut = false;
            console.log("[SOUND] Fade complete, sound stopped.");
        } else {
            // Still fading: calculate volume
            const fadeProgress = elapsedFadeTime / config.ROLLING_SOUND_FADE_DURATION;
            const currentVolume = config.ROLLING_SOUND_BASE_VOLUME * (1.0 - fadeProgress);
            setRollingSoundVolume(currentVolume);
            // console.log(`[SOUND] Fading out, volume: ${currentVolume.toFixed(2)}`);
        }
    }

    // 2. Check Key State to Start Sound or Initiate/Cancel Fade (Only if fueled)
    if (hasFuel) { // <<< Added hasFuel check wrapper
        if (isMovingByKey) {
            // Player wants to move
            if (playerState.isRollingSoundFadingOut) {
                // Was fading out, but player pressed keys again: Cancel fade!
                console.log("[SOUND] Movement started during fade out, cancelling fade.");
                playerState.isRollingSoundFadingOut = false;
                // Ensure sound is playing at full volume (startRollingSound might handle this)
                 startRollingSound(); // Restart to ensure loop/volume is correct
                 playerState.isRollingSoundPlaying = true; // Ensure state is correct
            } else if (!playerState.isRollingSoundPlaying) {
                // Was not playing and not fading: Start normally
                 console.log("[SOUND] Keys pressed, starting rolling sound.");
                 startRollingSound();
                 playerState.isRollingSoundPlaying = true;
            }
            // If already playing and not fading, do nothing.
    
            } else {
            // Player is NOT pressing movement keys
            if (playerState.isRollingSoundPlaying && !playerState.isRollingSoundFadingOut) {
                // Was playing, but keys released: Initiate fade out
                console.log("[SOUND] Keys released, initiating fade out.");
                playerState.isRollingSoundFadingOut = true;
                playerState.rollingFadeStartTime = now;
                // Assuming startRollingSound sets loop = true, we might need this if the sound shouldn't loop during fade:
                // setRollingSoundLoop(false); 
            }
            // If already fading or not playing, do nothing.
        }
    } else if (playerState.isRollingSoundPlaying || playerState.isRollingSoundFadingOut) {
        // Ensure sound stops and state resets if fuel runs out mid-play/fade
        stopRollingSound();
        playerState.isRollingSoundPlaying = false;
        playerState.isRollingSoundFadingOut = false;
    }
    // --- END Handle Rolling Sound with Fade Out ---
    
    // --- Apply Gravity (if jumping) ---
    if (playerState.isJumping) {
        // Use stronger gravity if boosting
        const currentGravity = isBoosting ? config.BOOST_JUMP_GRAVITY : config.JUMP_GRAVITY;
        playerState.verticalVelocity += currentGravity * deltaTime;
        console.log(`[JUMP] Applying gravity (${currentGravity.toFixed(1)}). VVel: ${playerState.verticalVelocity.toFixed(3)}`); // Debug log
    } else {
        playerState.verticalVelocity = 0; // Ensure vertical velocity is zeroed if not jumping
    }
    // ---------------------------------
    
    // --- Update Boost Trail --- 
    // Check isBoosting state calculated earlier
    if (isBoosting) {
        boostTrailMesh.visible = true;
        const currentPos = _playerWorldPos; 
        const right = _vector3.set(1,0,0).applyQuaternion(playerMesh.quaternion).normalize(); 
        const trailWidth = config.BOOST_TRAIL_WIDTH; 
        const edge1 = currentPos.clone().add(right.clone().multiplyScalar(trailWidth / 2));
        const edge2 = currentPos.clone().sub(right.clone().multiplyScalar(trailWidth / 2));
        boostTrailPoints.unshift(edge1, edge2);
        const maxPoints = config.BOOST_TRAIL_LENGTH * 2; 
        if (boostTrailPoints.length > maxPoints) {
            boostTrailPoints.length = maxPoints; 
        }
        updateBoostTrailGeometry(); 
    } else {
        if (boostTrailMesh.visible) { 
            boostTrailMesh.visible = false;
            boostTrailPoints = []; 
            updateBoostTrailGeometry(); 
        }
    }
    // --- END Boost Trail Update ---

    // --- Calculate Displacement --- 
    // Horizontal displacement from velocity
    const horizontalDeltaPosition = playerVelocity.clone().multiplyScalar(deltaTime); 
    // Vertical displacement from jump physics
    const verticalDisplacement = planetUp.clone().multiplyScalar(playerState.verticalVelocity * deltaTime);
    // Combine displacements
    const totalDisplacement = horizontalDeltaPosition.add(verticalDisplacement); 
    // ----------------------------

    // Update world position based on final velocity
    _playerWorldPos.add(totalDisplacement);

    // --- Apply Landing Detection & Surface Clamping --- 
    const directionFromCenter = _vector3.copy(_playerWorldPos).sub(_homePlanetWorldPos);
    let currentDistance = directionFromCenter.length();
    const targetDistance = homePlanetRadius + config.PLAYER_RADIUS; // Target distance includes player radius

    // Landing Check
    const landingThreshold = 0.1; // How close to surface to count as landing
    if (playerState.isJumping && playerState.verticalVelocity <= 0 && (currentDistance - targetDistance) < landingThreshold) {
        console.log(`[JUMP] Landing detected. Dist: ${currentDistance.toFixed(3)}, VVel: ${playerState.verticalVelocity.toFixed(3)}`); // Debug log
        playerState.isJumping = false;
        playerState.verticalVelocity = 0;
        playerState.isGrounded = true;
        playPlayerLandSound(); // <<< PLAY LAND SOUND HERE >>>
        currentDistance = targetDistance; // Force snap distance for clamping
    } else if (!playerState.isJumping) {
        // Ensure grounded state if not jumping (e.g., initial state or sliding)
        if (!playerState.isGrounded && (currentDistance - targetDistance) < landingThreshold * 2) { // Wider threshold for just sliding onto ground
             console.log("[JUMP] Grounded state set while not jumping (sliding).")
             playerState.isGrounded = true; 
        }
        // Force snap to surface if not jumping
        currentDistance = targetDistance; 
    }
    
    // Clamp player to the surface 
    if (!playerState.isJumping) { 
        directionFromCenter.normalize().multiplyScalar(targetDistance);
        _playerWorldPos.copy(_homePlanetWorldPos).add(directionFromCenter);
    }
    // --- End Landing/Clamping ---

    // Convert final world position back to LOCAL position relative to the planet
    playerMesh.position.copy(homePlanet.worldToLocal(_playerWorldPos.clone()));

    // --- Update Player Orientation --- 
    const upDir = planetUp.clone().normalize(); // Use normalized planetUp directly

    // --- Determine Target Look Direction based on VELOCITY ---
    let targetForwardDir = playerState.targetLookDirection.clone(); // Start with the last direction
    const VELOCITY_LOOK_THRESHOLD_SQ = 0.01 * 0.01; // Square of velocity magnitude threshold
    
    if (playerVelocity.lengthSq() > VELOCITY_LOOK_THRESHOLD_SQ) {
        // Player is moving significantly
        const tangentVelocity = playerVelocity.clone().sub(
            upDir.clone().multiplyScalar(playerVelocity.dot(upDir))
        );
        
        if (tangentVelocity.lengthSq() > 1e-6) {
             // Use the normalized tangent velocity as the target direction
             targetForwardDir.copy(tangentVelocity).normalize();
             // Store this potentially new direction
             playerState.targetLookDirection.copy(targetForwardDir); 
        } // else: Velocity is mostly radial, keep last targetForwardDir
        
    } // else: Player is stopped or moving very slowly, keep last targetForwardDir
    
    // --- Fallback if targetForwardDir is still zero (e.g., initial state before moving) ---
    if (targetForwardDir.lengthSq() < 1e-6) {
        targetForwardDir = cameraForward.clone().sub(
            upDir.clone().multiplyScalar(cameraForward.dot(upDir))
        ).normalize();
         // Re-check for pole singularity after fallback
        if (targetForwardDir.lengthSq() < config.POLE_THRESHOLD) {
            const worldX = new THREE.Vector3(1, 0, 0);
            targetForwardDir = worldX.clone().sub(
                upDir.clone().multiplyScalar(worldX.dot(upDir))
            ).normalize();
             if (targetForwardDir.lengthSq() < config.POLE_THRESHOLD) {
                const worldZ = new THREE.Vector3(0, 0, 1);
                targetForwardDir = worldZ.clone().sub(
                    upDir.clone().multiplyScalar(worldZ.dot(upDir))
                ).normalize();
            }
        }        
        playerState.targetLookDirection.copy(targetForwardDir); // Update state with fallback
    }
    // --- End Determine Target Look Direction ---

    // Set orientation using Quaternion from lookAt matrix
    if (targetForwardDir.lengthSq() > config.POLE_THRESHOLD) { 
        // Calculate the raw lookAt quaternion
        _tempMatrix.lookAt(_origin, targetForwardDir, upDir);
        const _rawLookAtQuat = _tempQuat.clone().setFromRotationMatrix(_tempMatrix); // Use clone to avoid modifying _tempQuat

        // Apply 180-degree Y-axis rotation (Flip)
        const flipAxis = _vector3.set(0, 1, 0); // Y-axis
        const flipAngle = Math.PI; // 180 degrees
        const flipQuat = new THREE.Quaternion().setFromAxisAngle(flipAxis, flipAngle);
        
        // Calculate the final target quaternion: Raw lookAt * Flip
        const _targetQuat = _rawLookAtQuat.multiply(flipQuat);

        // Smoothly rotate towards the target quaternion
        if (!playerMesh.quaternion.equals(_targetQuat)) { // Avoid unnecessary calculations if already there
            const step = config.PLAYER_ROTATION_SPEED * deltaTime;
            playerMesh.quaternion.rotateTowards(_targetQuat, step);
        }

    } // else: maintain current orientation if targetForwardDir calculation failed
    
    // --- End Orientation Logic ---

    // --- Update Camera ---
    // (Keep existing camera logic)
    // ... existing camera update code ...

    // --- Update Path Trail ---
    updatePathTrail(playerState, homePlanet);
    // ------------------------

    // --- NEW: Speech Bubble Toggle Logic ---
    if (speechBubbleState.sprite) { // Check if sprite exists
        if (keyState['b'] && !bKeyPressedLastFrame) {
            // 'B' key was just pressed
            speechBubbleState.isVisible = !speechBubbleState.isVisible; // Toggle visibility state
            speechBubbleState.sprite.visible = speechBubbleState.isVisible; // Update sprite visibility
            console.log(`Speech Bubble toggled: ${speechBubbleState.isVisible ? 'Visible' : 'Hidden'}`);
        }
    }
    // -------------------------------------

    // --- Update Rolling Sound ---
    const isMoving = playerVelocity.lengthSq() > config.VELOCITY_THRESHOLD_SQ;

    // --- Store boost state for next frame --- (This MUST be the last step for boost logic)
    playerState.wasBoostingLastFrame = isBoosting;

    // --- Update last frame key states --- (MUST be at the very end)
    bKeyPressedLastFrame = keyState['b']; // Update B key state for next frame
}

// Update Path Trail
function updatePathTrail(playerState, homePlanet) {
    // <<< Get visualMesh from playerState >>>
    const visualMesh = playerState?.visualMesh;
    // Add checks for initialized pathLine/Geometry AND visualMesh
    if (!visualMesh || !homePlanet || !pathLine || !pathGeometry) return; 

    // Get VISUAL mesh's current world position
    visualMesh.getWorldPosition(_playerWorldPos); 

    // Check distance from last point
    if (_playerWorldPos.distanceToSquared(lastPathTrailPosition) > PATH_TRAIL_MIN_DISTANCE_SQ) {
        // Convert world position to homePlanet's local space
        const localPos = homePlanet.worldToLocal(_playerWorldPos.clone()); 

        // Add new point to the EXPORTED array (USING CORRECT VAR NAME)
        pathPoints.push(localPos); // CORRECT: Use pathPoints

        // Limit trail length
        if (pathPoints.length > PATH_TRAIL_MAX_POINTS) {
            pathPoints.shift(); // Remove the oldest point
        }

        // Update last position
        lastPathTrailPosition.copy(_playerWorldPos);
        pathTrailNeedsUpdate = true;
    }

    // Update geometry if needed
    if (pathTrailNeedsUpdate) {
        // --- Calculate subset of points to draw for MAIN trail --- 
        const numAvailablePoints = pathPoints.length;
        const numVerticesToDraw = Math.min(numAvailablePoints, MAIN_TRAIL_DRAW_POINTS);
        const startIndex = Math.max(0, numAvailablePoints - numVerticesToDraw);
        const pointsToDraw = pathPoints.slice(startIndex);
        // --------------------------------------------------------

        // Use the calculated slice of points (pointsToDraw)
        pathLine.geometry.setFromPoints(pointsToDraw); // Use the slice
        pathLine.geometry.computeBoundingSphere();
        pathLine.computeLineDistances(); // Still needed for LineSegments
        pathTrailNeedsUpdate = false;
    }
}

// Export keyState and functions together at the end
export { initPlayer, updatePathTrail, keyState, pathPoints }; 

// --- NEW: Boost Trail Geometry Update Function ---
function updateBoostTrailGeometry() {
    const geometry = boostTrailMesh.geometry;
    const numSegments = boostTrailPoints.length / 2 - 1;

    if (numSegments <= 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 4));
        geometry.setIndex([]);
        geometry.computeBoundingSphere();
        return;
    }

    const numVertices = (numSegments + 1) * 2;
    const positions = new Float32Array(numVertices * 3);
    const colors = new Float32Array(numVertices * 4); // RGBA
    const indices = [];

    const baseColor = new THREE.Color(config.BOOST_TRAIL_COLOR);

    for (let i = 0; i <= numSegments; i++) {
        const pointIndex = i * 2;
        const p1 = boostTrailPoints[pointIndex];
        const p2 = boostTrailPoints[pointIndex + 1];

        // Interpolate width (tapering)
        const widthFactor = 1.0 - (i / numSegments); // 1.0 at start, 0.0 at end
        const currentWidth = config.BOOST_TRAIL_MIN_WIDTH + (config.BOOST_TRAIL_WIDTH - config.BOOST_TRAIL_MIN_WIDTH) * widthFactor;

        // Recalculate edge points based on interpolated width (simplified: assumes center is average of p1, p2)
        const center = p1.clone().add(p2).multiplyScalar(0.5);
        const dir = p1.clone().sub(p2).normalize();
        const edge1 = center.clone().add(dir.clone().multiplyScalar(currentWidth / 2));
        const edge2 = center.clone().sub(dir.clone().multiplyScalar(currentWidth / 2));

        positions[pointIndex * 3] = edge1.x;
        positions[pointIndex * 3 + 1] = edge1.y;
        positions[pointIndex * 3 + 2] = edge1.z;
        
        positions[(pointIndex + 1) * 3] = edge2.x;
        positions[(pointIndex + 1) * 3 + 1] = edge2.y;
        positions[(pointIndex + 1) * 3 + 2] = edge2.z;

        // Interpolate alpha
        const alpha = 1.0 - (i / numSegments); // 1.0 at start, 0.0 at end

        colors[pointIndex * 4] = baseColor.r;
        colors[pointIndex * 4 + 1] = baseColor.g;
        colors[pointIndex * 4 + 2] = baseColor.b;
        colors[pointIndex * 4 + 3] = alpha;

        colors[(pointIndex + 1) * 4] = baseColor.r;
        colors[(pointIndex + 1) * 4 + 1] = baseColor.g;
        colors[(pointIndex + 1) * 4 + 2] = baseColor.b;
        colors[(pointIndex + 1) * 4 + 3] = alpha;

        // Add indices for the quad (two triangles)
        if (i < numSegments) {
            const idx1 = pointIndex;       // Current Edge 1
            const idx2 = pointIndex + 1;   // Current Edge 2
            const idx3 = pointIndex + 2;   // Next Edge 1
            const idx4 = pointIndex + 3;   // Next Edge 2

            indices.push(idx1, idx2, idx3); // Triangle 1
            indices.push(idx2, idx4, idx3); // Triangle 2
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere(); // Important for visibility checks

    // Mark attributes for update
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.index.needsUpdate = true;
} 

// --- NEW: Rolling Sound Handling ---
function handleRollingSound(isMoving, playerState) {
    const sound = window.loadedSounds?.rollingSound; // Get reference from globally stored object
    if (!sound || !sound.buffer) {
        // console.warn("Rolling sound not ready."); // Optional: Add warning if needed
        return;
    }

    const shouldBePlaying = isMoving && playerState.isGrounded; // Condition remains the same

    // --- Add Rolling Sound Debug Logs ---
    // console.log(`[Rolling Sound DEBUG] isMoving: ${isMoving}, isGrounded: ${playerState.isGrounded}, shouldBePlaying: ${shouldBePlaying}, sound.isPlaying: ${sound.isPlaying}, context.state: ${sound.context.state}`);
    // ----------------------------------

    if (shouldBePlaying && !sound.isPlaying) {
        if (sound.context.state === 'running') {
             // console.log("SOUND: Starting rolling sound."); // Optional: Log sound start
            sound.play();
        } else {
            console.warn("Cannot start rolling sound - audio context not running.");
        }
    } else if (!shouldBePlaying && sound.isPlaying) {
         // console.log("SOUND: Stopping rolling sound."); // Optional: Log sound stop
        sound.stop();
    }

    // Optional: Adjust playback rate based on speed?
    // if (sound.isPlaying && playerState.velocity) {
    //     const speed = playerState.velocity.length();
    //     const maxSpeed = config.MAX_SPEED; // Assuming a max speed config
    //     const playbackRate = 1.0 + (speed / maxSpeed) * 0.5; // Example: 1.0 to 1.5 rate
    //     sound.setPlaybackRate(Math.max(0.5, Math.min(playbackRate, 2.0))); // Clamp rate
    // }
}
// ---------------------------------

/**
 * Creates a speech bubble sprite with a basic shape.
 * @param {THREE.Object3D} parentMesh The mesh to attach the bubble to.
 * @returns {object} The speechBubbleState object containing references.
 */
function initSpeechBubble(parentMesh) {
    const canvas = document.createElement('canvas');
    const width = 256;
    const height = 128;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    speechBubbleState.canvas = canvas;
    speechBubbleState.context = context;

    // --- Draw Bubble Shape ---
    context.fillStyle = 'white';
    context.strokeStyle = 'black';
    context.lineWidth = 4;
    const borderRadius = 20;
    const tailWidth = 30;
    const tailHeight = 30;

    context.beginPath();
    // Main rounded rectangle
    context.moveTo(borderRadius, 0);
    context.lineTo(width - borderRadius, 0);
    context.quadraticCurveTo(width, 0, width, borderRadius);
    context.lineTo(width, height - tailHeight - borderRadius);
    context.quadraticCurveTo(width, height - tailHeight, width - borderRadius, height - tailHeight);
    // Tail start
    context.lineTo(width / 2 + tailWidth / 2, height - tailHeight);
    context.lineTo(width / 2, height); // Point of tail
    context.lineTo(width / 2 - tailWidth / 2, height - tailHeight);
    // Continue rounded rectangle
    context.lineTo(borderRadius, height - tailHeight);
    context.quadraticCurveTo(0, height - tailHeight, 0, height - tailHeight - borderRadius);
    context.lineTo(0, borderRadius);
    context.quadraticCurveTo(0, 0, borderRadius, 0);
    context.closePath();
    context.fill();
    context.stroke();
    // ----------------------

    // --- Add Placeholder Text ---
    context.fillStyle = 'black';
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Adjust text position slightly within the bubble main area
    // Replace "Hello!" with a math formula
    context.fillText('∑(n=1 to ∞) = π²/12', width / 2, (height - tailHeight) / 2);
    // -------------------------

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    speechBubbleState.texture = texture;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false, // Render on top
        sizeAttenuation: true // Default, size depends on distance
    });

    const sprite = new THREE.Sprite(material);
    sprite.name = "speechBubble";
    
    // Scale the sprite in world units (adjust these values)
    // Multiply base size by 4 for 4x bigger
    const desiredWorldWidth = config.PLAYER_RADIUS * 2.5 * 4; 
    const aspect = width / height;
    sprite.scale.set(desiredWorldWidth, desiredWorldWidth / aspect, 1);
    
    // Position relative to parent (using offset from state)
    sprite.position.copy(speechBubbleState.offset);

    sprite.visible = speechBubbleState.isVisible; // Start hidden
    parentMesh.add(sprite);
    speechBubbleState.sprite = sprite;

    console.log("Speech bubble initialized and added to parent.");
    return speechBubbleState;
}

// Modify the plantSeed function
async function plantSeed() {
    // Check if we have seeds
    if (inventory.seeds <= 0) {
        console.log("No seeds available to plant.");
        return;
    }

    // Get the planet we're on
    const planet = playerState.mesh.parent;
    if (!planet) {
        console.error("Cannot plant seed: Player not attached to a planet");
        return;
    }

    try {
        // Wait for mossy log model to load
        await mossyLogModelLoadPromise;

        // Create log model
        const logModel = mossyLogModelProto.clone();
        logModel.scale.set(0.4, 0.4, 0.4); // Half the size for initial phase
        
        // Get player's local position on the planet
        const playerLocalPos = playerState.mesh.position.clone();
        
        // Calculate surface normal in local space
        const surfaceNormal = playerLocalPos.clone().normalize();
        
        // Position and align tree to planet surface
        const modelUp = new THREE.Vector3(0, 1, 0);
        const alignmentQuaternion = new THREE.Quaternion();
        alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
        logModel.quaternion.copy(alignmentQuaternion);

        // Calculate final position
        const planetRadius = planet.geometry.parameters.radius;
        const verticalOffset = 0.1;
        const finalPos = playerLocalPos.clone().normalize().multiplyScalar(planetRadius + verticalOffset);
        logModel.position.copy(finalPos);

        // Add to planet
        planet.add(logModel);

        // Start growth timer to middle phase
        setTimeout(() => {
            growToLog(logModel, planet);
        }, config.INITIAL_GROWTH_TIME * 1000); // Convert seconds to milliseconds

        // Deduct from inventory
        inventory.seeds--;
        if (typeof updateInventoryDisplay === 'function') {
            updateInventoryDisplay();
        }

    } catch (error) {
        console.error("Error planting seed:", error);
    }
}

async function growToLog(seedMesh, planet) {
    try {
        // Wait for mossy log model to load
        await mossyLogModelLoadPromise;

        // Create log model
        const logModel = mossyLogModelProto.clone();
        logModel.scale.set(0.8, 0.8, 0.8); // Full size for middle phase
        
        // Copy exact position and rotation from previous model
        logModel.position.copy(seedMesh.position);
        logModel.quaternion.copy(seedMesh.quaternion);

        // Replace seed with log
        planet.remove(seedMesh);
        planet.add(logModel);

        // Start forest growth timer
        setTimeout(() => {
            growToForest(logModel, planet);
        }, config.FINAL_GROWTH_TIME * 1000); // Convert seconds to milliseconds

    } catch (error) {
        console.error("Error growing to log:", error);
    }
}

async function growToForest(logModel, planet) {
    try {
        // Wait for seed model to load
        await seedModelLoadPromise;

        // Get the log's position and normal
        const logPos = logModel.position.clone();
        const surfaceNormal = logPos.clone().normalize();

        // Remove the log model
        planet.remove(logModel);

        // Create a collectible forest at the same position
        const forestItem = seedModelProto.clone(true);
        forestItem.gemType = 'forest';
        
        // Apply scaling
        const treeScale = 0.5; // Match seed model scale
        forestItem.scale.set(treeScale, treeScale, treeScale);

        // Position and Align
        const modelUp = new THREE.Vector3(0, 1, 0);
        const alignmentQuaternion = new THREE.Quaternion();
        alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
        forestItem.quaternion.copy(alignmentQuaternion);

        // Calculate the correct position
        const planetRadius = planet.geometry.parameters.radius;
        const verticalOffset = 0.1;
        const finalPos = surfaceNormal.multiplyScalar(planetRadius + verticalOffset);
        forestItem.position.copy(finalPos);
        forestItem.originalPosition = finalPos.clone();

        // Add to planet
        planet.add(forestItem);

        // Add to seedGems array for collision detection
        const itemData = { 
            gem: forestItem, 
            type: 'seeds',
            seedsToGive: config.SEEDS_PER_FOREST // Store how many seeds this forest gives
        };
        seedGems.push(itemData);

    } catch (error) {
        console.error("Error growing to forest:", error);
    }
}