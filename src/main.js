import * as THREE from 'https://esm.sh/three@0.128.0';

// Import configurations and constants
import * as config from './config.js';

// Import modules
import { initScene } from './scene.js';
import { initPlayer, updatePlayerMovement, updatePathTrail, keyState } from './player.js';
import { initPlanets, updateOrbits } from './planets.js';
import { initResources, updateResources, inventory, updateInventoryDisplay, createInventoryUI, playRocketLaunchSound } from './resources.js';
import { initRocket, updateRocket, launchRocket, isRocketActive, isRocketStationed, placeRocketOnPad, hideRocketFromPad, rocketMesh } from './rocket.js';
import { updateCamera } from './camera.js';

console.log("main.js: Script start");

// Module-level variables for core components
let scene, camera, renderer, audioListener;
let playerSphere, homePlanet;
let planetsState = {}; // Populated by initPlanets

// --- State for Pending Launch ---
let isLaunchPending = false;
let launchPendingStartTime = 0;
let pendingLaunchTarget = null;
let pendingLaunchPayload = 0;
let pendingLaunchFuelCost = 0; // Store cost calculated at trigger time

// --- NEW: Terraforming & Camera State ---
const isTerraforming = {}; // Store planet name -> boolean
const terraformStartTime = {}; // Store planet name -> start time
let cameraFocusTarget = null; // Store the mesh the camera should focus on
let isCameraFocusingPlanet = false; // Flag to override default camera logic
let isCameraInTerraformPosition = false; // NEW: Flag to track camera arrival

// UI Element References
let seedBankElement = null;
let terraformButton = null;
let launchPromptElement = null;
let missionStatusElement = null; // NEW: Reference for mission status message
let debugFillButton = null; // NEW: Reference for debug button
let debugInstantTerraformButton = null; // NEW: Reference for instant terraform button

// Temp vectors for calculations
const _tempPlayerPos = new THREE.Vector3();
const _launchPadLocalPos = new THREE.Vector3(); // Store LOCAL pad position
const _launchPadWorldPos = new THREE.Vector3(); // For launch pad world coordinates (calculated in animate)
const _launchPadNormal = new THREE.Vector3();   // For launch pad orientation (calculated in animate)
const _vec3 = new THREE.Vector3(); // Generic temporary vector
const _worldUp = new THREE.Vector3(0, 1, 0); // Define World Up vector
const _tempColor = new THREE.Color(); // For color lerp

// Temp vectors specific to camera focus
const _planetFocusWorldPos = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const terraformViewOffset = new THREE.Vector3(); // NEW: Store the calculated camera offset

// --- Debug Counter ---
let spacebarPressCount = 0; 

// --- UI Update Functions ---
function updateSeedBankUI(planetName, delivered, required) {
    if (seedBankElement) {
        // Basic display, assumes only one target planet UI for now
        seedBankElement.textContent = `${planetName} Seeds: ${delivered} / ${required}`;
    } else {
        console.warn("Seed Bank UI element not found.");
    }
}

function updateTerraformButton(enabled, planetName) {
    if (terraformButton) {
        terraformButton.disabled = !enabled;
        terraformButton.textContent = `Terraform ${planetName}`;
        terraformButton.style.cursor = enabled ? 'pointer' : 'default';
        // Maybe change style when enabled
        terraformButton.style.backgroundColor = enabled ? '#4CAF50' : '#cccccc'; // Green when enabled
        terraformButton.style.color = enabled ? 'white' : '#666666';
    } else {
        console.warn("Terraform Button element not found.");
    }
}

// --- Terraform Action ---
function handleTerraformClick() {
    const targetPlanetName = 'Infernia'; // Hardcoded for now
    const planetData = planetsState[targetPlanetName];

    // Check conditions
    if (planetData && planetData.seedsDelivered >= planetData.seedsRequired && !isTerraforming[targetPlanetName] && !isCameraFocusingPlanet) { 
        console.log(`TERRAFORMING ${targetPlanetName}! Initiating camera move.`);
        
        // Calculate and store the view offset relative to the planet
        const planetRadius = planetData.mesh.geometry.parameters.radius || 50;
        planetData.mesh.getWorldPosition(_planetFocusWorldPos); // Get planet pos NOW
        terraformViewOffset.subVectors(camera.position, _planetFocusWorldPos); // Vector from planet to camera
        terraformViewOffset.normalize().multiplyScalar(planetRadius * 3.5); // Scale offset (adjust multiplier as needed, e.g., 3.5)
        // Optional: Add some height relative to the planet-camera vector? 
        // This is trickier; might be better to adjust the initial offset calculation or the lookAt slightly.
        // Let's stick to the direct offset for now.

        // Set camera focus state initially
        cameraFocusTarget = planetData.mesh;
        isCameraFocusingPlanet = true;
        isCameraInTerraformPosition = false; // Reset arrival flag
        updateTerraformButton(false, targetPlanetName); // Disable button
        console.log(`TerraformClick: Camera focus set to ${targetPlanetName}. Waiting for camera arrival.`);

    } else { // Provide feedback on why it failed
        if (isTerraforming[targetPlanetName]) {
            console.warn("Terraform clicked, but already in progress.");
        } else {
            console.warn("Terraform clicked but conditions not met.");
        }
    }
}

// --- NEW: Debug Action ---
function handleDebugFillResources() {
    console.log("DEBUG: Filling resources...");
    inventory.seeds = config.MAX_SEEDS;
    inventory.fuel = config.MAX_FUEL;
    updateInventoryDisplay(); // Update the UI
}

// --- UPDATED: Debug Terraform now triggers the normal sequence ---
function handleDebugInstantTerraform() {
    const targetPlanetName = 'Infernia'; // Hardcoded target
    console.log(`DEBUG: Triggering standard terraform sequence for ${targetPlanetName}...`);
    const planetData = planetsState[targetPlanetName];

    // Ensure seeds are sufficient before triggering (like the real button)
    if (planetData) {
        // Temporarily set seeds to required amount for the debug trigger
        const originalSeeds = planetData.seedsDelivered;
        planetData.seedsDelivered = planetData.seedsRequired; 
        
        handleTerraformClick(); // Call the regular handler

        // Optional: Restore original seed count if you don't want the debug button
        // to permanently fulfill the seed requirement for the UI.
        // planetData.seedsDelivered = originalSeeds; 
    } else {
         console.error(`DEBUG Terraform Trigger Error: Planet ${targetPlanetName} not found.`);
    }

    // Remove the instant logic:
    /*
    if (planetData) {
        // Set state flags
        isTerraforming[targetPlanetName] = false; 
        planetData.seedsDelivered = planetData.seedsRequired; 
        // Instantly change color
        planetData.mesh.material.color.setHex(0x00ff00); 
        // Update UI
        updateSeedBankUI(targetPlanetName, planetData.seedsDelivered, planetData.seedsRequired);
        updateTerraformButton(false, targetPlanetName); 
        // Show success message
        // ...
    } else {
        console.error(`DEBUG Instant Terraform Error: Planet ${targetPlanetName} not found.`);
    }
    */
}

function init() {
    console.log("Main INIT: Starting initialization...");

    try {
        // --- Step 1: Initialize Scene, Camera, Renderer, Lights ---
        const sceneObjs = initScene();
        scene = sceneObjs.scene;
        camera = sceneObjs.camera;
        renderer = sceneObjs.renderer;
        audioListener = sceneObjs.audioListener;

        // --- Step 2: Initialize Planets ---
        const planetObjs = initPlanets(scene);
        planetsState = planetObjs.planets;
        homePlanet = planetObjs.homePlanet;
        if (!homePlanet) {
            throw new Error("Initialization Error: Home planet not found after initPlanets.");
        }

        // --- Store Launch Pad LOCAL Position ---
        _launchPadLocalPos.set(0, homePlanet.geometry.parameters.radius, 0);
        const offsetAngle = Math.PI / 16;
        const rotationAxis = new THREE.Vector3(1, 0, 0);
        const offsetQuaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, offsetAngle);
        _launchPadLocalPos.applyQuaternion(offsetQuaternion);
        console.log(`Launch Pad Local Position Stored: ${_launchPadLocalPos.x.toFixed(2)}, ${_launchPadLocalPos.y.toFixed(2)}, ${_launchPadLocalPos.z.toFixed(2)}`);

        // --- Step 3: Initialize Player ---
        playerSphere = initPlayer(homePlanet, audioListener);

        // --- Step 4: Initialize Resources (Previously Gems) ---
        initResources(scene, homePlanet, planetsState, audioListener);
        createInventoryUI();

        // --- Step 5: Initialize Rocket ---
        initRocket(scene, homePlanet);

        // --- Step 6: Initialize UI Elements & State ---
        seedBankElement = document.getElementById('seed-bank-display');
        terraformButton = document.getElementById('terraform-button');
        launchPromptElement = document.getElementById('launch-prompt');
        missionStatusElement = document.getElementById('mission-status-display');
        debugFillButton = document.getElementById('debug-fill-resources');
        debugInstantTerraformButton = document.getElementById('debug-instant-terraform'); // Get button

        if (!launchPromptElement) {
            console.error("Launch prompt UI element (#launch-prompt) not found!");
        }
        if (!missionStatusElement) {
            console.error("Mission status UI element (#mission-status-display) not found!");
        }
        if (!debugFillButton) { 
            console.error("Debug fill button (#debug-fill-resources) not found!");
        }
        if (!debugInstantTerraformButton) { 
            console.error("Debug instant terraform button (#debug-instant-terraform) not found!");
        }
        
        // Add Event Listeners
        if (terraformButton) {
            terraformButton.addEventListener('click', handleTerraformClick);
        }
        if (debugFillButton) {
            debugFillButton.addEventListener('click', handleDebugFillResources);
        }
        if (debugInstantTerraformButton) {
            debugInstantTerraformButton.addEventListener('click', handleDebugInstantTerraform);
        }
        
        // Initial UI update for seed bank (hardcoded target for now)
        const targetPlanetName = 'Infernia';
        if (planetsState[targetPlanetName]){
             updateSeedBankUI(targetPlanetName, planetsState[targetPlanetName].seedsDelivered, planetsState[targetPlanetName].seedsRequired);
             updateTerraformButton(false, targetPlanetName); // Start disabled
        } else {
            console.error(`Target planet ${targetPlanetName} not found for initial UI setup.`);
            if(seedBankElement) seedBankElement.textContent = "Error: Target planet not found.";
            if(terraformButton) terraformButton.disabled = true;
        }

        console.log("Main INIT: Finished initialization.");
        animate(); // Start the main loop
    } catch (error) {
        console.error("Initialization failed:", error);
        // Handle initialization error appropriately (e.g., display message)
    }
}

// Get the delta time for physics updates
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    const now = performance.now();

    // --- Update Game Logic ---
    updateOrbits(planetsState, deltaTime);
    updatePlayerMovement(camera, homePlanet, planetsState);
    updateResources(scene, playerSphere, homePlanet, audioListener, deltaTime);
    const landingInfo = updateRocket(deltaTime);
    updatePathTrail();

    // --- Handle Terraforming Color Lerp ---
    for (const planetName in isTerraforming) {
        if (isTerraforming[planetName]) {
            console.log(`ColorLerp: Running for ${planetName}`);
            const planetData = planetsState[planetName];
            if (planetData) {
                 if (!terraformStartTime[planetName]) {
                     console.warn(`ColorLerp: Start time not set for ${planetName}, skipping lerp.`);
                     continue; 
                 }
                const elapsedTime = (now - terraformStartTime[planetName]) / 1000;
                const alpha = Math.min(elapsedTime / config.TERRAFORM_DURATION, 1.0);
                console.log(`ColorLerp: ${planetName} alpha = ${alpha.toFixed(2)}`);
                
                const targetColor = 0x00ff00; 
                planetData.mesh.material.color.lerpColors(planetData.originalColor, _tempColor.setHex(targetColor), alpha);
                
                if (alpha >= 1.0) {
                    console.log(`ColorLerp: Terraforming color complete for ${planetName}.`);
                    isTerraforming[planetName] = false; 
                    // Show message
                    if (missionStatusElement) {
                        missionStatusElement.textContent = `${planetName} Terraformed Successfully!`;
                        missionStatusElement.style.color = '#00ee00'; 
                        missionStatusElement.style.display = 'block';
                        setTimeout(() => {
                            if (missionStatusElement) missionStatusElement.style.display = 'none';
                        }, 2500); 
                    }
                }
            } else { 
                 isTerraforming[planetName] = false; 
            }
        }
    }

    // --- Handle Pending Rocket Launch ---
    if (isLaunchPending && performance.now() - launchPendingStartTime > config.ROCKET_LAUNCH_DELAY * 1000) {
        console.log("Launch delay complete, attempting actual rocket launch...");
        
        // Call launchRocket - it will check fuel and deduct if successful
        const launchSuccess = launchRocket(pendingLaunchTarget, pendingLaunchPayload, pendingLaunchFuelCost); 

        if (launchSuccess) {
            console.log("launchRocket successful. Deducting seeds.");
            // Deduct seeds ONLY if launch was truly successful (fuel check passed)
            inventory.seeds -= pendingLaunchPayload;
            hideRocketFromPad(); // Hide pad rocket
            updateInventoryDisplay(); // Update UI for seed count
        } else {
            console.warn("launchRocket failed (likely insufficient fuel checked internally). Launch aborted.");
            // No need to refund fuel, as launchRocket didn't deduct it.
            // Consider playing a failure sound here.
        }
        
        // Clear pending state regardless of outcome
        isLaunchPending = false;
        pendingLaunchTarget = null;
        pendingLaunchPayload = 0;
        pendingLaunchFuelCost = 0;
    }

    // --- Handle Rocket Landing ---
    if (landingInfo) {
        console.log(`Main received landing info: ${landingInfo.payload} seeds on ${landingInfo.name}`);
        const landedPlanet = planetsState[landingInfo.name];
        if (landedPlanet) {
            landedPlanet.seedsDelivered += landingInfo.payload;
            // Clamp value just in case
            landedPlanet.seedsDelivered = Math.min(landedPlanet.seedsDelivered, landedPlanet.seedsRequired);
            
            // Update UI
            updateSeedBankUI(landingInfo.name, landedPlanet.seedsDelivered, landedPlanet.seedsRequired);
            
            // Check terraform condition
            const canTerraform = landedPlanet.seedsDelivered >= landedPlanet.seedsRequired;
            updateTerraformButton(canTerraform, landingInfo.name);

            // --- Show Mission Success Message --- 
            if (missionStatusElement) {
                missionStatusElement.textContent = 'Mission Successful'; // Keep this specific to rocket delivery
                missionStatusElement.style.color = '#00ff00'; // Original green
                missionStatusElement.style.display = 'block';
                setTimeout(() => {
                    if (missionStatusElement) missionStatusElement.style.display = 'none';
                }, 1500); // Display for 1.5 seconds
            }

        } else {
            console.error(`Landed planet ${landingInfo.name} not found in state!`);
        }
    }

    // --- Handle Stationed Rocket Visibility ---

    // 1. Initial Placement / Ensure it's on pad if inactive & supposed to be
    if (!isRocketActive() && !isRocketStationed() && rocketMesh && rocketMesh.parent === homePlanet) {
        // If it's inactive, not stationed, but correctly parented to home, ensure it's placed.
        // This handles the initial state after init.
        // console.log("Inactive rocket on home planet but not stationed. Placing on pad..."); // Reduced logging noise
        placeRocketOnPad(_launchPadLocalPos); // This makes it visible and sets isStationed = true
    }
    // 2. Resetting a rocket that got lost in the scene (e.g., after failed landing)
    else if (!isRocketActive() && !isRocketStationed() && rocketMesh && rocketMesh.parent === scene) {
        // If inactive, not stationed, AND parented to the scene, try to reset it.
        console.log("Inactive rocket is in the main scene, not stationed. Resetting to home pad...");
        scene.remove(rocketMesh);
        homePlanet.add(rocketMesh);
        placeRocketOnPad(_launchPadLocalPos);
    }

    // --- Update Launch Pad UI & Handle Launch Input ---
    let showLaunchPrompt = false;
    if (isRocketStationed() && !isRocketActive() && !isLaunchPending && playerSphere && homePlanet) {
        // Calculate world position of the launch pad
        _launchPadWorldPos.copy(_launchPadLocalPos).applyMatrix4(homePlanet.matrixWorld);
        
        // Check player proximity
        playerSphere.getWorldPosition(_tempPlayerPos);
        const distanceToPadSq = _tempPlayerPos.distanceToSquared(_launchPadWorldPos);
        const requiredDistSq = config.LAUNCH_TRIGGER_DISTANCE * config.LAUNCH_TRIGGER_DISTANCE;

        if (distanceToPadSq < requiredDistSq) {
            showLaunchPrompt = true;
            const seedsToLaunch = Math.min(inventory.seeds, config.ROCKET_MAX_PAYLOAD);
            const fuelNeeded = seedsToLaunch * config.FUEL_COST_PER_SEED;

            // Update UI Prompt Text/Style
            if (launchPromptElement) {
                if (seedsToLaunch > 0) {
                    const fuelAvailable = inventory.fuel >= fuelNeeded;
                    launchPromptElement.textContent = `Launch ${seedsToLaunch} seeds (Cost: ${fuelNeeded.toFixed(0)} Fuel) [Space]?`;
                    launchPromptElement.style.color = fuelAvailable ? '#00ff00' : '#ff8800'; // Green if affordable, orange if not
                } else {
                    launchPromptElement.textContent = `Need seeds to launch.`;
                    launchPromptElement.style.color = '#ffcc00'; // Yellow
                }
            }

            // Handle Spacebar Press (Launch Initiation)
            if (keyState[' ']) {
                keyState[' '] = false; // Consume key press

                if (seedsToLaunch > 0) {
                    console.log(`RESOURCE CHECK: seeds=${inventory.seeds}, fuel=${inventory.fuel.toFixed(1)}, neededFuel=${fuelNeeded.toFixed(1)}`);
                    if (inventory.fuel >= fuelNeeded) {
                        console.log(`Launch initiated for ${seedsToLaunch} seeds. Fuel Needed: ${fuelNeeded}. Fuel Available: ${inventory.fuel.toFixed(0)}`);
                        
                        const targetPlanetName = 'Infernia'; 
                        const targetPlanetData = planetsState[targetPlanetName];
                        
                        if (targetPlanetData?.mesh && targetPlanetData?.config) {
                             // --- ADDED Double Check for Pending Launch --- 
                             if (!isLaunchPending) { // Only proceed if not already pending
                                 console.log(`Target valid. Setting pending launch state.`);
                                 // --- Play launch sound immediately --- 
                                 spacebarPressCount++; // Increment counter
                                 console.log(`SOUND TRIGGER: Spacebar press #${spacebarPressCount}`); // Log count
                                 playRocketLaunchSound(); 
                                 // -------------------------------------
                                 pendingLaunchTarget = targetPlanetData;
                                 pendingLaunchPayload = seedsToLaunch;
                                 pendingLaunchFuelCost = fuelNeeded; 
                                 isLaunchPending = true;
                                 launchPendingStartTime = performance.now();
                             } else {
                                console.log("Launch already pending, ignoring rapid spacebar press.");
                             }
                             // ----------------------------------------------
                        } else {
                            console.error(`Launch Error: Target planet '${targetPlanetName}' not found or incomplete.`);
                        }
                    } else {
                        console.warn("Launch attempt ignored: Insufficient fuel.");
                    }
                } else {
                    console.log("Launch attempt ignored: No seeds available.");
                }
            }
        }
    }

    // Update Launch Prompt Visibility
    if (launchPromptElement) {
        launchPromptElement.style.display = showLaunchPrompt ? 'block' : 'none';
    }

    // --- Update Camera ---
    if (isCameraFocusingPlanet && cameraFocusTarget) {
        // --- Direct Camera Control for Planet Focus ---
        cameraFocusTarget.getWorldPosition(_planetFocusWorldPos); 
        _desiredCamPos.addVectors(_planetFocusWorldPos, terraformViewOffset); 
        camera.position.lerp(_desiredCamPos, config.CAMERA_SMOOTH_FACTOR * 0.5); 
        camera.lookAt(_planetFocusWorldPos);

        // --- Check if camera is in position to start terraform ---
        const distSq = camera.position.distanceToSquared(_desiredCamPos);
        const arrivalThresholdSq = 500.0; // INCREASED THRESHOLD SIGNIFICANTLY (was 50.0)
        // Log distance check (Uncommented for debugging)
        console.log(`CameraFocus: distSq = ${distSq.toFixed(2)}, thresholdSq = ${arrivalThresholdSq}`); 
        
        if (!isCameraInTerraformPosition && distSq < arrivalThresholdSq) { 
             console.log(`CameraFocus: Camera arrived at focus point (distSq: ${distSq.toFixed(2)}).`); 
             isCameraInTerraformPosition = true;
             const targetPlanetName = cameraFocusTarget.name;
             if (planetsState[targetPlanetName]) {
                isTerraforming[targetPlanetName] = true;
                terraformStartTime[targetPlanetName] = now; 
                console.log(`CameraFocus: Starting terraforming for ${targetPlanetName}`); // LOG 4
             } else { 
                console.error(`CameraFocus: Cannot start terraform - Planet data for ${targetPlanetName} not found.`);
                isCameraFocusingPlanet = false;
                cameraFocusTarget = null;
                isCameraInTerraformPosition = false;
             }
        }
        
        // --- Check if terraforming is done to release focus ---
        const targetPlanetName = cameraFocusTarget.name; 
        if (planetsState[targetPlanetName] && isTerraforming[targetPlanetName] === false) { 
             if (isCameraFocusingPlanet) { 
                 console.log(`CameraFocus: Terraforming for ${targetPlanetName} completed. Releasing camera focus.`); // LOG 7
                 isCameraFocusingPlanet = false;
                 cameraFocusTarget = null;
                 isCameraInTerraformPosition = false;
             }
        }

    } else if (isRocketActive()) { // Default rocket following
        updateCamera(camera, rocketMesh, homePlanet); 
    } else { // Default player following
        updateCamera(camera, playerSphere, homePlanet);
    }

    // --- Render Scene ---
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Start initialization when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    console.log('Event: DOM fully loaded and parsed. Calling main init()...');
    init();
}); 