import * as THREE from 'https://esm.sh/three@0.128.0';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import {
    ROCKET_RADIUS,
    ROCKET_HEIGHT,
    ROCKET_COLOR,
    ROCKET_TRAVEL_DURATION,
    ROCKET_LANDING_LINGER // Add linger duration
} from './config.js';
import { playRocketLaunchSound, playImpactSound, inventory, updateInventoryDisplay } from './resources.js'; // Import sound object, impact function, inventory, and UI update
import { createRocketTrailEmitter, updateParticlesCPU } from './particle_effects.js'; // <<< NEW IMPORT

let sceneRef = null;
let rocketMesh = null;
let homePlanetRef = null; // Store reference to home planet
let rocketEmitterState = null; // <<< NEW: State for particle emitter
let rocketFlameLight = null; // <<< NEW: Light for the flame
// let rocketVelocity = new THREE.Vector3(); // No longer needed

// --- New State Variables for Lerp Travel ---
let isActive = false;        // Is the rocket currently launched and travelling?
let isStationed = false;     // Is the rocket visible on the launch pad, ready?
let targetPlanet = null;     // Reference to the target planet object {mesh, config}
let launchPosition = new THREE.Vector3(); // World position where launch started
let launchTime = 0;          // Timestamp when launch began
let payloadSeeds = 0;      // NEW: Seeds carried by this rocket

// --- New state for landing sequence ---
let isLandingSequence = false; // Is the rocket in the post-arrival linger phase?
let landingStartTime = 0;     // When did the rocket arrive (alpha = 1.0)?
let impactSoundPlayedThisTrip = false; // Flag to play impact sound only once
let isApproachingLanding = false; // NEW: Flag for camera state change
let finalWorldPos = new THREE.Vector3(); // Store final position for re-parenting
let finalWorldQuat = new THREE.Quaternion(); // Store final orientation for re-parenting
let finalPlanetWorldPos = new THREE.Vector3(); // Store planet position at landing
let finalPlanetWorldQuat = new THREE.Quaternion(); // Store planet orientation at landing
let isPreLaunching = false; // <<< NEW: Flag for pre-launch effects

// --- Temporary Vectors ---
const _targetPos = new THREE.Vector3(); // Planet Center
const _surfaceTargetPos = new THREE.Vector3(); // Point on planet surface
const _currentPos = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _alignQuaternion = new THREE.Quaternion();
const _landingNormal = new THREE.Vector3(); // Surface normal at landing point
const _rocketUp = new THREE.Vector3(0, 0, 1); // Rocket's local "up" (Z) after rotation
const _tempQuat = new THREE.Quaternion();
const _vec3_rocket_dist = new THREE.Vector3(); // Temp vector for distance calc
const _tempPlanetInverseQuat = new THREE.Quaternion(); // For local transform calculation
const _tempLocalPos = new THREE.Vector3(); // For local transform calculation

// --- Easing Function ---
function easeOutQuad(t) {
    return t * (2 - t);
}

// --- GLTF Loader ---
const loader = new GLTFLoader();
// -----------------

// NEW: Reset Rocket Function
function resetRocket() {
    if (!rocketMesh) return;
    console.log("Resetting rocket...");
    
    // REMOVED block that tried to stop rocketLaunchSound directly
    // The sound is not looped and will stop on its own.

    // State flags
    isActive = false;
    isLandingSequence = false;
    isApproachingLanding = false;
    isStationed = false; // Mark as not on pad until placed
    
    // Clear travel data
    targetPlanet = null;
    payloadSeeds = 0;
    launchTime = 0;
    landingStartTime = 0;
    impactSoundPlayedThisTrip = false;

    // Visual state & parenting
    rocketMesh.visible = false; 
    if (sceneRef && rocketMesh.parent === sceneRef) {
        sceneRef.remove(rocketMesh); // Remove from scene if it's there
    }
    if (homePlanetRef && rocketMesh.parent !== homePlanetRef) {
        homePlanetRef.add(rocketMesh); // Re-attach to home planet
    }
    // Position/rotation will be set by placeRocketOnPad later
    console.log("Rocket reset and re-attached to home planet.");
    stopRocketEffects(); // <<< NEW: Ensure effects are off on reset
    isPreLaunching = false; // <<< NEW: Ensure prelaunch flag is off
}

function initRocket(scene, homePlanet) {
    sceneRef = scene;
    homePlanetRef = homePlanet; // Store reference
    const geometry = new THREE.CylinderGeometry(0, ROCKET_RADIUS, ROCKET_HEIGHT, 8);
    // *** NEW: Rotate geometry so height aligns with local Z ***
    geometry.rotateX(Math.PI / 2); 

    const material = new THREE.MeshStandardMaterial({
        color: ROCKET_COLOR,
        emissive: 0xffffff, // Make it glow white
        emissiveIntensity: 1.5, // Adjust intensity as needed
        // visible: false // <<< REVERTING: MAKE CONE VISIBLE AGAIN
    });
    rocketMesh = new THREE.Mesh(geometry, material);
    rocketMesh.visible = false; // Start hidden (Parent visibility still controls overall)
    rocketMesh.name = 'rocket';
    rocketMesh.scale.set(5, 5, 5); // Scale the rocket mesh up to make it more visible
    homePlanet.add(rocketMesh); // ADDED to homePlanet
    console.log('Rocket initialized (simplified travel, attached to planet).');

    // --- Load GLTF Model ---
    loader.load(
        'models/rocket/rocket.gltf',
        function (gltf) { // Success
            console.log("Rocket GLTF model loaded.");
            const model = gltf.scene;
            
            // --- Initial Scale (adjust as needed) ---
            // The cone (parent) is already scaled 5x
            // const gltfScale = 0.1; // Start small relative to parent scale
            // model.scale.set(gltfScale, gltfScale, gltfScale);
            model.scale.set(1, 1, 1); // <<< SETTING DEFAULT SCALE (relative to parent)
            console.log("Set Rocket GLTF model scale to default (1, 1, 1) relative to parent cone.");
            // ---------------------------------------
            
            // --- Rotate GLTF to align with cone geometry rotation ---
            model.rotation.x = Math.PI / 2; // Rotate +90 degrees around local X-axis
            console.log("Rotated GLTF model +90 degrees on X-axis.");
            // -----------------------------------------------------
            
            // --- Adjust GLTF Position Relative to Cone --- 
            model.position.z = 0.0; // <<< Resetting model Z offset to 0 relative to cone base
            console.log("Reset GLTF model position Z to 0.0 relative to cone.");
            // -------------------------------------------
            
            // --- Shadows (Optional but good practice) ---
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            // ------------------------------------------
            
            // --- Add GLTF as child of the cone ---
            rocketMesh.add(model);
            console.log("Added Rocket GLTF model as child of the cone mesh.");
            // ------------------------------------
        },
        undefined, // Progress callback (optional)
        function (error) { // Error callback
            console.error("Error loading Rocket GLTF model:", error);
        }
    );
    // ----------------------

    // --- Create Particle Emitter --- <<< NEW
    rocketEmitterState = createRocketTrailEmitter(ROCKET_HEIGHT);
    if (rocketEmitterState?.points) {
        rocketMesh.add(rocketEmitterState.points); // Add particles as child
        console.log("Added particle emitter to rocket mesh.");
    } else {
        console.error("Failed to create or add particle emitter.");
    }
    // ------------------------------

    // --- Create Flame Point Light --- <<< NEW
    rocketFlameLight = new THREE.PointLight(0xffaa00, 0, 15); // Orange, Intensity 0 (off), Distance
    rocketFlameLight.position.set(0, 0, -ROCKET_HEIGHT * 0.9); // <<< Lowered light to match emitter
    rocketMesh.add(rocketFlameLight);
    console.log("Added flame point light to rocket mesh.");
    // -------------------------------
}

// --- NEW: Functions to control effects independently ---
function startRocketEffects() {
    console.log("Starting pre-launch rocket effects...");
    if (rocketEmitterState?.points) rocketEmitterState.points.visible = true;
    if (rocketFlameLight) rocketFlameLight.intensity = 5.0; // Turn light on
    isPreLaunching = true;
}

function stopRocketEffects() {
    console.log("Stopping rocket effects...");
    if (rocketEmitterState?.points) rocketEmitterState.points.visible = false;
    if (rocketFlameLight) rocketFlameLight.intensity = 0; // Turn light off
    isPreLaunching = false; // Ensure flag is reset
}
// -----------------------------------------------------

// --- New Function: Place rocket on launch pad ---
// localPosition: Local coordinates relative to the planet center
// planetNormal: Local normal vector (direction from center to localPosition)
function placeRocketOnPad(localPosition) { // Removed planetNormal parameter for now
    if (!rocketMesh || isActive) return; // Don't place if already launched

    // Log the inputs
    console.log(`placeRocketOnPad called. Target Local Position: x=${localPosition.x.toFixed(2)}, y=${localPosition.y.toFixed(2)}, z=${localPosition.z.toFixed(2)}`);
    // console.log(`placeRocketOnPad Normal: x=${planetNormal.x.toFixed(2)}, y=${planetNormal.y.toFixed(2)}, z=${planetNormal.z.toFixed(2)}`);

    // Set position directly in parent's (planet's) local space
    // rocketMesh.position.copy(localPosition); // <<< OLD: Directly on surface

    // --- NEW: Add offset along surface normal ---
    const localNormal = localPosition.clone().normalize(); // Get the up direction at this point
    const surfaceOffset = 5.0; // Adjust this value as needed
    const finalPosition = localPosition.clone().addScaledVector(localNormal, surfaceOffset);
    rocketMesh.position.copy(finalPosition);
    console.log(`Applying surface offset: ${surfaceOffset}. Final position: (${finalPosition.x.toFixed(2)}, ${finalPosition.y.toFixed(2)}, ${finalPosition.z.toFixed(2)})`);
    // ----------------------------------------

    // Orient rocket to point straight "up" in local space (along the position vector from center)
    // const localNormal = localPosition.clone().normalize(); // <<< Moved up
    // *** UPDATED: Align the rotated geometry's forward axis (Z) with the local normal ***
    _alignQuaternion.setFromUnitVectors(_rocketUp, localNormal);
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

// Modified Launch Function
// targetPlanetObj: Object containing target { mesh: THREE.Mesh, config: object }
// seedCount: Number of seeds being launched
// fuelCost: Calculated fuel cost for this launch (passed from main.js)
function launchRocket(targetPlanetObj, seedCount, fuelCost) { // Added fuelCost parameter
    // --- Pre-launch Checks ---
    if (!rocketMesh || !isStationed || isActive || !homePlanetRef || !sceneRef) {
        console.warn('Launch Aborted: Rocket/Refs not ready or already active.');
        return false;
    }
    if (!targetPlanetObj || !targetPlanetObj.config || !targetPlanetObj.mesh) {
        console.error('Launch Aborted: Invalid targetPlanetObj provided.');
        return false;
    }
    if (seedCount <= 0) {
        console.warn('Launch Aborted: No seeds selected for payload.');
        return false;
    }
    // Check FUEL
    if (inventory.fuel < fuelCost) {
        console.warn(`Launch Aborted: Insufficient fuel. Needed: ${fuelCost}, Have: ${inventory.fuel}`);
        // TODO: Add user feedback sound/UI flash?
        return false;
    }

    // --- Deduct Fuel & Proceed ---
    console.log(`Sufficient fuel. Deducting ${fuelCost} fuel.`);
    inventory.fuel -= fuelCost;
    updateInventoryDisplay(); // Update UI immediately after spending fuel

    console.log(`Launching rocket with ${seedCount} seeds (cost ${fuelCost} fuel) from pad towards ${targetPlanetObj.config.name}`);

    // --- State Updates & Reparenting ---
    rocketMesh.getWorldPosition(launchPosition);
    homePlanetRef.remove(rocketMesh);
    sceneRef.add(rocketMesh);
    rocketMesh.position.copy(launchPosition);
    
    targetPlanet = targetPlanetObj; 
    payloadSeeds = seedCount;    // Store the actual seed count launched
    launchTime = performance.now();
    isActive = true;
    isStationed = false; 
    isLandingSequence = false; 
    landingStartTime = 0; 
    impactSoundPlayedThisTrip = false; 
    isApproachingLanding = false;

    // --- Sound & Orientation ---
    // RE-APPLY: REMOVE redundant sound playback - sound is played in main.js on initiation
    /* 
    if (rocketLaunchSound && rocketLaunchSound.buffer) {
        if (rocketLaunchSound.isPlaying) rocketLaunchSound.stop();
        rocketLaunchSound.setVolume(0.6); // Reset volume
        rocketLaunchSound.play();
        console.log("Played rocket launch sound."); // THIS LINE SHOULD NOT BE REACHED
    } else {
        console.warn("Rocket launch sound not ready or buffer missing.");
    }
    */
    targetPlanet.mesh.getWorldPosition(_targetPos);
    rocketMesh.lookAt(_targetPos);
    
    // --- NEW: Activate particles and light ---
    if (rocketEmitterState?.points) rocketEmitterState.points.visible = true;
    if (rocketFlameLight) rocketFlameLight.intensity = 5.0; // Turn light on (adjust intensity)
    // -----------------------------------------
    
    isPreLaunching = false; // <<< NEW: Turn off pre-launch state once launched
    return true; // Launch successful
}

// --- Modified Update Function (Lerp Travel & Landing Sequence) ---
function updateRocket(deltaTime) {
    // --- Landing Sequence Handler ---
    if (isLandingSequence) {
        // CONTINUOUSLY update local transform during linger based on stored values
        if (targetPlanet && targetPlanet.mesh) { // Check if target still valid
             try {
                 // Calculate desired local position using STORED planet position
                 _tempLocalPos.subVectors(finalWorldPos, finalPlanetWorldPos).normalize();
                 rocketMesh.position.copy(_tempLocalPos).multiplyScalar(targetPlanet.config.radius);

                 // Calculate desired local quaternion using STORED planet orientation
                 _tempPlanetInverseQuat.copy(finalPlanetWorldQuat).invert(); 
                 rocketMesh.quaternion.copy(_tempPlanetInverseQuat).multiply(finalWorldQuat);
                 
                 // Force matrix updates every frame during linger
                 rocketMesh.updateMatrix(); 
                 rocketMesh.updateMatrixWorld(true); 
            } catch (e) {
                 console.error("Error updating rocket transform during linger:", e);
                 // If error, maybe break linger early? Or just log?
            }
        }

        // Check if linger timer finished
        if (performance.now() - landingStartTime > ROCKET_LANDING_LINGER * 1000) {
            console.log("Landing sequence complete. Triggering reset.");
            const landingInfo = { name: targetPlanet?.config?.name || 'Unknown', payload: payloadSeeds };
            
            resetRocket(); // Call the reset function
            
            return landingInfo; // Return landing info AFTER reset
        }
        return undefined; // Still lingering
    }

    // --- NEW: Update Particle System (Moved Earlier) ---
    if (rocketEmitterState) {
        const isFlying = isActive && !isLandingSequence; // Determine flying state
        // <<< ADD DEBUG LOGS >>>
        // console.log(`[Particle Update] isPreLaunching: ${isPreLaunching}, isFlying: ${isFlying}, Points Visible: ${rocketEmitterState.points?.visible}`); // <<< REMOVING DEBUG LOGS
        // <<< END DEBUG LOGS >>>
        updateParticlesCPU(deltaTime, isPreLaunching, isFlying); // <<< NEW call with separate flags
    }
    // -----------------------------------

    // --- Exit if not actively travelling (AFTER particle update) ---
    if (!isActive || !rocketMesh || !targetPlanet?.mesh) {
        return undefined; 
    }

    const elapsedTime = (performance.now() - launchTime) / 1000; 
    // --- Alpha Calculations ---
    const linearAlpha = Math.min(elapsedTime / ROCKET_TRAVEL_DURATION, 1.0);
    const easedAlpha = easeOutQuad(linearAlpha); // Apply easing for movement

    // --- Target Calculation ---
    targetPlanet.mesh.getWorldPosition(_targetPos); // Get planet center
    // Calculate direction vector from launch towards planet center (for surface point)
    const directionToTarget = _vec3_rocket_dist.subVectors(_targetPos, launchPosition).normalize();
    // Calculate the final surface landing point
    const targetRadius = targetPlanet.config.radius;
    _surfaceTargetPos.copy(_targetPos).addScaledVector(directionToTarget, -targetRadius); // Move from center back towards launch by radius
    // Note: This assumes launch position is representative of approach direction.
    // A more accurate way might be direction from current rocket pos to center, but could cause jitter.
    // Let's stick with this for now.

    // --- Interpolate Position (using eased alpha) ---
    _currentPos.lerpVectors(launchPosition, _surfaceTargetPos, easedAlpha);
    rocketMesh.position.copy(_currentPos);

    // --- Orientation Logic & Camera Flag ---
    const rotationStartAlpha = 0.8; // When to start rotating (linear alpha)
    _landingNormal.subVectors(rocketMesh.position, _targetPos).normalize(); // Normal from center to current pos

    if (linearAlpha > rotationStartAlpha) {
        if (!isApproachingLanding) {
             console.log("Rocket entering landing approach, fixing camera view.");
             isApproachingLanding = true; // Set camera flag
        }
        _tempQuat.setFromUnitVectors(_rocketUp, _landingNormal); // Target orientation
        const rotationAlpha = Math.min(1.0, (linearAlpha - rotationStartAlpha) / (1.0 - rotationStartAlpha));
        rocketMesh.quaternion.slerp(_tempQuat, rotationAlpha); // Slerp towards target orientation
    } else {
        // Before rotation starts, keep looking towards the SURFACE target
        rocketMesh.lookAt(_surfaceTargetPos); 
    }

    // --- Earlier Impact Sound Trigger (using elapsedTime / linear alpha) ---
    const impactSoundTriggerTime = ROCKET_TRAVEL_DURATION - 1.0;
    if (elapsedTime >= impactSoundTriggerTime && !impactSoundPlayedThisTrip) {
        console.log(`Elapsed time ${elapsedTime.toFixed(2)}s >= trigger time ${impactSoundTriggerTime.toFixed(2)}s. Playing impact sound.`);
        playImpactSound();
        impactSoundPlayedThisTrip = true;
    }

    // --- Check for Arrival (using linear alpha for timing, but position uses eased) ---
    if (linearAlpha >= 1.0 && !isLandingSequence) { 
        console.log("Rocket arrived at target planet. Starting landing sequence.");
        
        // 1. Ensure final position/orientation is calculated and set on mesh
        targetPlanet.mesh.getWorldPosition(_targetPos); 
        rocketMesh.position.copy(_surfaceTargetPos);
        _landingNormal.subVectors(rocketMesh.position, _targetPos).normalize(); 
        _tempQuat.setFromUnitVectors(_rocketUp, _landingNormal); 
        rocketMesh.quaternion.copy(_tempQuat); 
        rocketMesh.updateMatrixWorld(true); // Update world matrix based on scene parentage
        
        // 2. Store final world transforms (Rocket and Planet)
        finalWorldPos.copy(rocketMesh.getWorldPosition(new THREE.Vector3())); 
        finalWorldQuat.copy(rocketMesh.getWorldQuaternion(new THREE.Quaternion())); 
        targetPlanet.mesh.updateMatrixWorld(true); 
        finalPlanetWorldPos.copy(targetPlanet.mesh.getWorldPosition(new THREE.Vector3()));
        finalPlanetWorldQuat.copy(targetPlanet.mesh.getWorldQuaternion(new THREE.Quaternion()));

        // 3. Re-parent IMMEDIATELY
        sceneRef.remove(rocketMesh);
        targetPlanet.mesh.add(rocketMesh); 

        // 4. Set INITIAL local transform based on stored values
        try {
            _tempLocalPos.copy(finalWorldPos);
            targetPlanet.mesh.worldToLocal(_tempLocalPos); // Convert world pos to target's local
            rocketMesh.position.copy(_tempLocalPos);

            // Calculate local rotation
            _tempPlanetInverseQuat.copy(targetPlanet.mesh.quaternion).invert(); 
            rocketMesh.quaternion.copy(_tempPlanetInverseQuat).multiply(finalWorldQuat);

            console.log("Local transform calculated and set for landing.");
        } catch(e) {
            console.error("Error setting local transform on landing:", e);
            // Fallback? Or just let it be potentially wrong?
        }

        // 5. Start Landing Sequence Timer
        isLandingSequence = true;
        landingStartTime = performance.now();
        
        // --- NEW: Deactivate particles and light --- 
        // if (rocketEmitterState?.points) rocketEmitterState.points.visible = false; // <<< MOVED TO stopRocketEffects
        // if (rocketFlameLight) rocketFlameLight.intensity = 0; // Turn light off // <<< MOVED TO stopRocketEffects
        stopRocketEffects(); // <<< NEW: Call stop function
        // -----------------------------------------

        if (!impactSoundPlayedThisTrip) {
             console.log("Playing impact sound on immediate arrival (short trip).");
             playImpactSound();
             impactSoundPlayedThisTrip = true;
        }
    }
    
    return undefined; // Return undefined while travelling or lingering
}

function isRocketActive() {
    return isActive;
}

// NEW getter for camera
function isRocketApproachingLanding() {
    return isApproachingLanding;
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
    isRocketApproachingLanding, // NEW Export
    isRocketStationed, // New
    rocketMesh,
    // --- NEW EXPORTS ---
    startRocketEffects,
    stopRocketEffects
    // ------------------
}; 