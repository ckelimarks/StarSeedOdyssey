import * as THREE from 'https://esm.sh/three@0.128.0';
import {
    ROCKET_RADIUS,
    ROCKET_HEIGHT,
    ROCKET_COLOR,
    ROCKET_TRAVEL_DURATION,
    ROCKET_LANDING_LINGER // Add linger duration
} from './config.js';
import { rocketLaunchSound, playImpactSound, inventory, updateInventoryDisplay } from './resources.js'; // Import sound object, impact function, inventory, and UI update

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

// --- New state for landing sequence ---
let isLandingSequence = false; // Is the rocket in the post-arrival linger phase?
let landingStartTime = 0;     // When did the rocket arrive (alpha = 1.0)?
let impactSoundPlayedThisTrip = false; // Flag to play impact sound only once
let isApproachingLanding = false; // NEW: Flag for camera state change
let finalWorldPos = new THREE.Vector3(); // Store final position for re-parenting
let finalWorldQuat = new THREE.Quaternion(); // Store final orientation for re-parenting
let finalPlanetWorldPos = new THREE.Vector3(); // Store planet position at landing
let finalPlanetWorldQuat = new THREE.Quaternion(); // Store planet orientation at landing

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

// NEW: Reset Rocket Function
function resetRocket() {
    if (!rocketMesh) return;
    console.log("Resetting rocket...");
    
    // Stop any lingering sounds associated with the rocket
    if (rocketLaunchSound && rocketLaunchSound.isPlaying) {
        console.log("Stopping rocket launch sound during reset.");
        rocketLaunchSound.stop();
    }
    // Optionally reset impact sound state too if needed, but likely not necessary

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
    if (rocketLaunchSound && rocketLaunchSound.buffer) {
        if (rocketLaunchSound.isPlaying) rocketLaunchSound.stop();
        rocketLaunchSound.setVolume(0.6); // Reset volume
        rocketLaunchSound.play();
        console.log("Played rocket launch sound.");
    } else {
        console.warn("Rocket launch sound not ready or buffer missing.");
    }
    targetPlanet.mesh.getWorldPosition(_targetPos);
    rocketMesh.lookAt(_targetPos);
    
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

    // --- Audio Fade Out Logic (using linear alpha) ---
    if (rocketLaunchSound && rocketLaunchSound.isPlaying) {
        // Calculate time since launch (based on the rocket module's launchTime)
        const timeSinceLaunch = (performance.now() - launchTime) / 1000;
        const fadeStartTime = 8.0; // CHANGE: Start fading after 6 seconds
        const fadeDuration = 1.0;  // Fade out over 1 second
        let volume = 0.6; // Base volume (adjust if initial volume is different)

        if (timeSinceLaunch > fadeStartTime) {
            const fadeProgress = Math.min(1.0, (timeSinceLaunch - fadeStartTime) / fadeDuration);
            volume = Math.max(0, 0.6 * (1.0 - fadeProgress));
        } else {
             volume = 0.6; // Maintain full volume before fade starts
        }
        
        rocketLaunchSound.setVolume(volume);
        if (volume < 0.01) {
             // console.log("Stopping faded rocket sound."); // Reduce logging noise
             rocketLaunchSound.stop();
        }
    }

    // --- Earlier Impact Sound Trigger (using elapsedTime / linear alpha) ---
    const impactSoundTriggerTime = ROCKET_TRAVEL_DURATION - 1.0;
    if (elapsedTime >= impactSoundTriggerTime && !impactSoundPlayedThisTrip) {
        console.log(`Elapsed time ${elapsedTime.toFixed(2)}s >= trigger time ${impactSoundTriggerTime.toFixed(2)}s. Playing impact sound.`);
        playImpactSound();
        impactSoundPlayedThisTrip = true;
        if (rocketLaunchSound && rocketLaunchSound.isPlaying) {
             rocketLaunchSound.setVolume(0);
             rocketLaunchSound.stop();
        }
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
        
        // --- Final Audio Handling ---
        if (rocketLaunchSound && rocketLaunchSound.isPlaying) {
            console.log("Stopping rocket launch sound explicitly on arrival.")
            rocketLaunchSound.stop(); 
            rocketLaunchSound.setVolume(0.6); // Reset for next time
        }
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
    rocketMesh
}; 