import * as THREE from 'https://esm.sh/three@0.128.0';

// Import configurations and constants
import * as config from './config.js';

// Import modules
import { initScene } from './scene.js';
import { initPlayer, updatePlayerMovement, updatePathTrail, keyState } from './player.js';
import { initPlanets, updateOrbits } from './planets.js';
import { initResources, updateResources, inventory, hasResources, spendResources, createInventoryUI } from './resources.js';
import { initRocket, updateRocket, launchRocket, isRocketActive, isRocketStationed, placeRocketOnPad, hideRocketFromPad, rocketMesh } from './rocket.js';
import { updateCamera } from './camera.js';

console.log("main.js: Script start");

// Module-level variables for core components
let scene, camera, renderer, audioListener;
let playerSphere, homePlanet;
let planetsState = {}; // Populated by initPlanets

// UI Element References
let seedBankElement = null;
let terraformButton = null;

// Temp vectors for calculations
const _tempPlayerPos = new THREE.Vector3();
const _launchPadLocalPos = new THREE.Vector3(); // Store LOCAL pad position
const _launchPadWorldPos = new THREE.Vector3(); // For launch pad world coordinates (calculated in animate)
const _launchPadNormal = new THREE.Vector3();   // For launch pad orientation (calculated in animate)
const _vec3 = new THREE.Vector3(); // Generic temporary vector
const _worldUp = new THREE.Vector3(0, 1, 0); // Define World Up vector
// const _tangent = new THREE.Vector3();  // No longer needed

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
    if (planetsState[targetPlanetName] && planetsState[targetPlanetName].seedsDelivered >= planetsState[targetPlanetName].seedsRequired) {
        console.log(`TERRAFORMING ${targetPlanetName}! (Implement visual effect)`);
        // TODO: Add actual terraforming effect (e.g., change planet color/texture)
        // Example: Change color temporarily
        planetsState[targetPlanetName].mesh.material.color.set(0x00ff00); // Turn green
        // Disable button again after terraforming?
        updateTerraformButton(false, targetPlanetName);
        // Reset delivered seeds? Or mark as terraformed?
        // planetsState[targetPlanetName].seedsDelivered = 0; // Reset if needed
    } else {
        console.warn("Terraform clicked but conditions not met.");
    }
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
        // 1. Start at North Pole in local space
        _launchPadLocalPos.set(0, homePlanet.geometry.parameters.radius, 0); 
        // 2. Rotate slightly away from the player spawn point (e.g., around X-axis)
        const offsetAngle = Math.PI / 16; // Small angle offset
        const rotationAxis = new THREE.Vector3(1, 0, 0); // Rotate around X
        const offsetQuaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, offsetAngle);
        _launchPadLocalPos.applyQuaternion(offsetQuaternion); // Apply the rotation

        console.log(`Launch Pad Local Position Stored (Offset): ${_launchPadLocalPos.x.toFixed(2)}, ${_launchPadLocalPos.y.toFixed(2)}, ${_launchPadLocalPos.z.toFixed(2)}`);

        // --- Step 3: Initialize Player ---
        playerSphere = initPlayer(homePlanet, audioListener); // Pass audioListener

        // --- Step 4: Initialize Resources (Previously Gems) ---
        initResources(scene, homePlanet, planetsState, audioListener); // Already passing listener here
        createInventoryUI(); // Creates AND updates inventory display

        // --- Step 5: Initialize Rocket ---
        initRocket(scene, homePlanet);

        // --- Step 6: Initialize UI Elements & State ---
        seedBankElement = document.getElementById('seed-bank-display');
        terraformButton = document.getElementById('terraform-button');
        
        if (terraformButton) {
            terraformButton.addEventListener('click', handleTerraformClick);
        } else {
            console.error("Terraform button not found during init.");
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

    const deltaTime = clock.getDelta(); // Time since last frame in seconds

    // --- Update Game Logic ---
    updateOrbits(planetsState, deltaTime);
    updatePlayerMovement(camera, homePlanet, planetsState);
    updateResources(scene, playerSphere, homePlanet, audioListener); // Handles collection & inventory UI update
    const landingInfo = updateRocket(deltaTime); // Check if rocket landed
    updatePathTrail();

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
        } else {
            console.error(`Landed planet ${landingInfo.name} not found in state!`);
        }
    }

    // --- Handle Stationed Rocket Visibility ---
    if (!isRocketActive()) { 
        // Place rocket on pad if it's not active and not already stationed
        if (!isRocketStationed()) {
            // *** NEW: Re-parent rocket back to home planet before placing ***
            if (rocketMesh && rocketMesh.parent !== homePlanet) {
                console.log("Re-parenting rocket to home planet.");
                // Find the current parent (likely the scene) and remove the rocket
                const currentParent = rocketMesh.parent;
                if(currentParent) {
                    currentParent.remove(rocketMesh);
                } else {
                     console.warn("Rocket mesh had no parent before re-parenting attempt?");
                }
                // Add rocket back to the home planet
                homePlanet.add(rocketMesh);
            }
            // Now place it (position/rotation relative to homePlanet, sets visible=true)
            placeRocketOnPad(_launchPadLocalPos);
        }
        // Note: Hiding logic removed, launch check prevents launch if no resources
    }

    // --- Handle Rocket Launch Input ---
    if (keyState[' '] && isRocketStationed() && !isRocketActive()) {
        keyState[' '] = false; // Consume key press immediately
        
        playerSphere.getWorldPosition(_tempPlayerPos);
        rocketMesh.getWorldPosition(_vec3); 
        const distanceToRocketSq = _tempPlayerPos.distanceToSquared(_vec3);
        const requiredDistSq = config.LAUNCH_TRIGGER_DISTANCE * config.LAUNCH_TRIGGER_DISTANCE;
        
        if (distanceToRocketSq < requiredDistSq) {
            console.log("Player near stationed rocket, attempting launch...");

            // Determine payload and cost
            const seedsToSend = Math.min(inventory.seeds, config.ROCKET_MAX_PAYLOAD);
            
            if (seedsToSend > 0) {
                const fuelCost = seedsToSend * config.FUEL_COST_PER_SEED;
                console.log(`Attempting to launch ${seedsToSend} seeds (Cost: ${fuelCost} fuel)...`);

                // Check resources
                if (hasResources(seedsToSend, fuelCost)) {
                    // Spend resources (this also updates inventory UI)
                    if (spendResources(seedsToSend, fuelCost)) {
                         // Define target planet
                        const targetPlanetName = 'Infernia'; // Hardcoded target
                        const targetPlanetData = planetsState[targetPlanetName]; 

                        if (targetPlanetData?.mesh && targetPlanetData?.config) {
                            console.log(`Main: Launching rocket towards ${targetPlanetData.config.name} with ${seedsToSend} seeds.`);
                            // Launch the rocket, passing payload
                            if(launchRocket(targetPlanetData, seedsToSend)) {
                                // Successful launch initiation
                                hideRocketFromPad(); // Hide immediately after successful launch command
                            } else {
                                console.error("Launch Error: launchRocket function failed internally.");
                                // Ideally refund resources here
                            }
                        } else {
                            console.error(`Launch Error: Target planet '${targetPlanetName}' not found or incomplete.`);
                            // Ideally refund resources here
                        }
                    } else {
                         console.error("Launch Error: Failed to spend resources even after checking."); // Should not happen
                    }
                } else {
                    console.warn(`Launch cancelled: Insufficient resources. Need ${seedsToSend} seeds, ${fuelCost} fuel. Have ${inventory.seeds} seeds, ${inventory.fuel} fuel.`);
                    // Provide feedback to player (e.g., sound effect, UI message)
                }
            } else {
                 console.log("Launch cancelled: No seeds available to send.");
                 // Feedback
            }
        } else {
             // Feedback if player presses space but isn't close enough
             // console.log("Player pressed space, but not close enough to launch rocket.");
        }
    }
    // Prevent sticky space key if launch conditions not met
    else if (keyState[' ']) { keyState[' '] = false; }

    // --- Update Camera ---
    if (isRocketActive()) {
        updateCamera(camera, rocketMesh, homePlanet); 
    } else {
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