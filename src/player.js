import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { createSphere } from './planets.js';
import { startRollingSound, stopRollingSound, setRollingSoundLoop, setRollingSoundVolume } from './resources.js'; // Import sound functions
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Use full URL

// Module-level variables for player state
let playerSphere = null;
let playerVelocity = new THREE.Vector3();
const keyState = { 
    'ArrowUp': false, 
    'ArrowDown': false, 
    'ArrowLeft': false, 
    'ArrowRight': false,
    ' ': false // Spacebar
};

// Path Trail variables
let pathPoints = [];
let pathLine = null;
let needsPathUpdate = false;

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

// Initialize Player
function initPlayer(homePlanet, audioListener) {
    console.log("Player INIT: Creating player mesh...");
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
    
    // Define player state object early
    const playerState = {
        mesh: null, // Will be set once model loaded
        velocity: new THREE.Vector3(),
        targetLookDirection: new THREE.Vector3(0, 0, 1), // Initial forward (World Z for simplicity, will be corrected)
        isRollingSoundPlaying: false,
        isRollingSoundFadingOut: false,
        rollingFadeStartTime: 0,
    };

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
            const playerMesh = playerModelProto.clone(true); // This is the visual model
            playerMesh.scale.set(config.PLAYER_MODEL_SCALE, config.PLAYER_MODEL_SCALE, config.PLAYER_MODEL_SCALE);
            // playerMesh.name = 'player'; // Keep name on parent for clarity?

            // Ensure shadows on visual model
            playerMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            // ----------------------------------------

            // --- Apply Visual Offset to CHILD mesh ---
            playerMesh.translateY(-0.5); // Reduced offset from -1.2 to bring player up slightly
            // ----------------------------------------

            // --- Add Child to Parent ---
            playerRoot.add(playerMesh); // Add visual model to the physics root
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
            playerState.mesh = playerRoot; // Assign PARENT to state
            console.log('[DEBUG] playerState after PARENT mesh assignment:', playerState);
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

            // Initialize Path Trail using PARENT object
            initializePathTrail(homePlanet, playerRoot); // Pass the PARENT

        }, 
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the player GLTF:', error);
            // Maybe fallback to sphere?
            console.log("Player INIT: Falling back to sphere geometry due to load error.");
            playerState.mesh = createSphere(config.PLAYER_RADIUS, 0xff0000, playerLocalPosition, 'player_fallback');
            homePlanet.add(playerState.mesh);
            initializePathTrail(homePlanet, playerState.mesh);
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
function initializePathTrail(parentObject, playerMeshRef) {
    if (!parentObject || !playerMeshRef) {
        console.error("initializePathTrail: Missing parentObject or playerMeshRef");
        return;
    }
    const pathMaterial = new THREE.LineDashedMaterial({ 
        color: 0xffffff, 
        linewidth: 1, 
        scale: 1, 
        dashSize: config.MIN_PATH_DISTANCE * 0.6, // Adjust dash based on min dist
        gapSize: config.MIN_PATH_DISTANCE * 0.4
    });
    const pathGeometry = new THREE.BufferGeometry();
    // Get initial player position for first point
    const initialWorldPos = new THREE.Vector3();
    playerMeshRef.getWorldPosition(initialWorldPos);
    const initialLocalPos = parentObject.worldToLocal(initialWorldPos);
    pathPoints.push(initialLocalPos.clone()); // Start with current position
    
    pathGeometry.setFromPoints(pathPoints);
    pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.computeLineDistances();
    parentObject.add(pathLine); 
    console.log("Player INIT: Path trail initialized and added.");
}

// Event Handlers
function handleKeyDown(event) {
    if (event.key in keyState) {
        console.log(`[DEBUG] KeyDown detected: ${event.key}`);
        keyState[event.key] = true;
        
        // *** NEW: Resume Audio Context on first key press ***
        if (audioListenerRef && audioListenerRef.context.state === 'suspended') {
            console.log("Resuming audio context...");
            audioListenerRef.context.resume();
        }
    }
}

function handleKeyUp(event) {
    if (event.key in keyState) {
        console.log(`[DEBUG] KeyUp detected: ${event.key}`);
        // console.log(`Key Up: ${event.key}`);
        keyState[event.key] = false;
    }
}

// --- Player Update Function (Called from main loop) ---
function updatePlayer(deltaTime, camera, homePlanet, planetsState) {
    const playerState = window.playerState; // Access global player state
    
    // Early exit checks with warnings
    if (!playerState) { 
        // console.warn('updatePlayer exiting: playerState is not available on window yet.');
        return; // Exit if player state isn't ready
    }
    const playerMesh = playerState.mesh;
    if (!playerMesh) {
        // console.warn('updatePlayer exiting: playerState.mesh is null or undefined (model likely still loading).');
        return; // Exit if mesh isn't loaded
    }
     if (!homePlanet) {
        // console.warn('updatePlayer exiting: homePlanet is missing.');
         return;
     }
     if (!planetsState) {
        // console.warn('updatePlayer exiting: planetsState is missing.');
         return;
     }

    const homePlanetRadius = homePlanet.geometry.parameters.radius;
    if (!homePlanetRadius) {
        console.error("updatePlayer: Missing radius from home planet!");
        return;
    }

    // Get current world positions
    playerMesh.getWorldPosition(_playerWorldPos);
    homePlanet.getWorldPosition(_homePlanetWorldPos);

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
    let accelerationDirection = new THREE.Vector3();
    let isMovingByKey = false; 
    if (keyState['ArrowUp']) { 
        accelerationDirection.copy(tangentForward); 
        isMovingByKey = true; 
        console.log("[DEBUG] KeyState Check: ArrowUp detected, Accel:", accelerationDirection);
    } 
    else if (keyState['ArrowDown']) { 
        accelerationDirection.copy(tangentForward).negate(); 
        isMovingByKey = true; 
        console.log("[DEBUG] KeyState Check: ArrowDown detected, Accel:", accelerationDirection);
    } 
    else if (keyState['ArrowLeft']) { 
        accelerationDirection.copy(tangentRight); // Use POSITIVE tangentRight for LEFT
        isMovingByKey = true; 
        console.log("[DEBUG] KeyState Check: ArrowLeft detected, Accel:", accelerationDirection);
    } 
    else if (keyState['ArrowRight']) { 
        accelerationDirection.copy(tangentRight).negate(); // Use NEGATIVE tangentRight for RIGHT
        isMovingByKey = true; 
        console.log("[DEBUG] KeyState Check: ArrowRight detected, Accel:", accelerationDirection);
    } 

    // Apply acceleration and friction to playerState.velocity
    if (accelerationDirection.lengthSq() > 0) {
        playerState.velocity.add(accelerationDirection.multiplyScalar(config.ACCELERATION * deltaTime));
        if (playerState.velocity.length() > config.MAX_VELOCITY) {
            playerState.velocity.normalize().multiplyScalar(config.MAX_VELOCITY);
        }
    } else {
        playerState.velocity.multiplyScalar(1.0 - (1.0 - config.FRICTION) * deltaTime * 60); // Apply frame-rate independent friction more robustly
    }
    
    // Stop completely if velocity is very low to prevent jittering
    if (playerState.velocity.lengthSq() < 1e-8) { // Use a small threshold (e.g., 0.0001 * 0.0001)
        playerState.velocity.set(0, 0, 0);
    }

    // --- REVISED: Handle Rolling Sound with Fade Out --- 
    const now = performance.now();
    // Use the existing isMovingByKey calculated earlier

    // 1. Update Fade Out if it's happening
    if (playerState.isRollingSoundFadingOut) {
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

    // 2. Check Key State to Start Sound or Initiate/Cancel Fade
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
    // --- END REVISED Sound Logic ---
    
    // --- Apply Gravity & Clamp to Surface ---
    // Gravity pulls towards the planet's center (in world space)
    const gravityDirection = _vector3.copy(_homePlanetWorldPos).sub(_playerWorldPos).normalize();
    playerState.velocity.add(gravityDirection.multiplyScalar(config.GRAVITY_CONSTANT * deltaTime));

    // Project velocity onto tangent plane to prevent "sticking" when moving fast horizontally
    const tangentVelocity = playerState.velocity.clone().sub(
        planetUp.clone().multiplyScalar(playerState.velocity.dot(planetUp))
    );
    const radialVelocity = playerState.velocity.clone().sub(tangentVelocity); // Velocity towards/away from center

    // Apply friction ONLY to tangent velocity
    tangentVelocity.multiplyScalar(Math.pow(config.FRICTION, deltaTime)); // Frame-rate independent friction

    // Recombine velocities
    playerState.velocity.copy(tangentVelocity).add(radialVelocity);

    // Update world position based on final velocity
    const deltaPosition = playerState.velocity.clone().multiplyScalar(deltaTime);
    _playerWorldPos.add(deltaPosition);

    // Clamp player to the surface of the home planet (adjust position radially)
    const directionFromCenter = _vector3.copy(_playerWorldPos).sub(_homePlanetWorldPos);
    const distanceFromCenter = directionFromCenter.length();
    const targetDistance = homePlanetRadius + config.PLAYER_RADIUS; // Target distance from center

    if (Math.abs(distanceFromCenter - targetDistance) > 1e-4) { // Small threshold
        directionFromCenter.normalize().multiplyScalar(targetDistance);
        _playerWorldPos.copy(_homePlanetWorldPos).add(directionFromCenter);
    }

    // Convert final world position back to LOCAL position relative to the planet
    playerMesh.position.copy(homePlanet.worldToLocal(_playerWorldPos.clone()));

    // --- Update Player Orientation --- 
    const upDir = planetUp.clone().normalize(); // Use normalized planetUp directly

    // --- Determine Target Look Direction based on VELOCITY ---
    let targetForwardDir = playerState.targetLookDirection.clone(); // Start with the last direction
    const VELOCITY_LOOK_THRESHOLD_SQ = 0.01 * 0.01; // Square of velocity magnitude threshold
    
    if (playerState.velocity.lengthSq() > VELOCITY_LOOK_THRESHOLD_SQ) {
        // Player is moving significantly
        const tangentVelocity = playerState.velocity.clone().sub(
            upDir.clone().multiplyScalar(playerState.velocity.dot(upDir))
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

    // --- Path Trail Update ---
    updatePathTrail(playerMesh); // Pass the mesh itself
}

// Update Path Trail Geometry
function updatePathTrail(playerMesh) {
    if (!needsPathUpdate || !pathLine || pathPoints.length < 2) return;

    const positions = pathPoints.flatMap(p => [p.x, p.y, p.z]);
    pathLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pathLine.computeLineDistances(); 
    pathLine.geometry.attributes.position.needsUpdate = true;
    pathLine.geometry.computeBoundingSphere();
    needsPathUpdate = false;

    // Update path trail based on the player's current position
    const currentWorldPos = playerMesh.getWorldPosition(_playerWorldPos);
    const currentLocalPos = homePlanet.worldToLocal(currentWorldPos);
    pathPoints.push(currentLocalPos.clone());
    pathLine.geometry.setFromPoints(pathPoints);
    pathLine.computeLineDistances();
    pathLine.geometry.attributes.position.needsUpdate = true;
    pathLine.geometry.computeBoundingSphere();
    needsPathUpdate = true;
}

// Export keyState and functions together at the end
export { initPlayer, updatePlayer, updatePathTrail, keyState }; 