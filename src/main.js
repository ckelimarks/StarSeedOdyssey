import * as THREE from 'https://esm.sh/three@0.128.0';
import Stats from 'https://esm.sh/three@0.128.0/examples/jsm/libs/stats.module.js'; // Import Stats
// --- Post-Processing Imports ---
import { EffectComposer } from 'https://esm.sh/three@0.128.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.128.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.128.0/examples/jsm/postprocessing/UnrealBloomPass.js';
// -----------------------------

// Import configurations and constants
import * as config from './config.js';

// Import modules
import { initScene } from './scene.js';
import { initPlayer, updatePlayer, updatePathTrail, keyState, pathPoints } from './player.js';
import { initPlanets, updateOrbits } from './planets.js';
import { 
    initResources, 
    updateResources, 
    inventory, 
    updateInventoryDisplay, 
    createInventoryUI, 
    playRocketLaunchSound, 
    loadAudio,
    playTerraformReadySound, 
    playInventoryFullSound // <<< Import Inventory Full Sound Player
} from './resources.js';
import { initRocket, updateRocket, launchRocket, isRocketActive, isRocketStationed, placeRocketOnPad, hideRocketFromPad, rocketMesh } from './rocket.js';
import { updateCamera } from './camera.js';
import { initPal, updatePal, palMesh } from './pal.js'; // ADDED Pal import and palMesh export

console.log("main.js: Script start");

// Module-level variables for core components
let scene, camera, renderer, audioListener;
let composer; // NEW: For post-processing
let homePlanet;
let planetsState = {}; // Populated by initPlanets
let stats; // Declare stats globally

// --- Mini-Map Components ---
let mapScene, mapCamera, mapRenderer;
let mapContainer;
let mapPlanet;
let mapPlayer, mapPal, mapRocket;
let mapPathTrail; // NEW: For player path
const MAP_PLANET_RADIUS = 50; // Radius for the map sphere
const MAP_DOT_RADIUS = 1.5;   // Radius for the player/pal/rocket dots
const MAP_CONE_HEIGHT = MAP_DOT_RADIUS * 3; // Height for the rocket cone
const MAP_CAMERA_DISTANCE = MAP_PLANET_RADIUS * 2.5; // How far camera is from map center
// -------------------------

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
let debugEnableTerraformButton = null; // NEW: Reference for enable terraform button debug
let boostMeterFillElement = null; // NEW
let boostStatusElement = null; // NEW

// --- NEW: Pal State ---
let isPalInitialized = false;
// -------------------

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

// --- NEW: Temp vectors for mini-map ---
const _mapTargetPos = new THREE.Vector3();
const _mapCamPos = new THREE.Vector3();
const _mapPlayerWorldPos = new THREE.Vector3();
const _mapPalWorldPos = new THREE.Vector3();
const _mapRocketWorldPos = new THREE.Vector3();
const _mapHomePlanetWorldPos = new THREE.Vector3(); // Store home planet world pos
const _mapPlayerUp = new THREE.Vector3(); // Store player's up vector
const _mapTargetUp = new THREE.Vector3(); // For orienting map objects
const _mapOrientationQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
// --------------------------------------

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
        // --- NEW: Detailed Logging ---
        const currentDisabledState = terraformButton.disabled;
        console.log(`[Terraform Btn Update] Called for ${planetName}. Requested enabled: ${enabled}. Current button disabled state: ${currentDisabledState}`);
        // ---------------------------

        // --- Play sound and trigger pulse on transition to enabled ---
        if (currentDisabledState === true && enabled === true) { // Use stored current state
            console.log(`[Terraform Btn Update] State Transition: DISABLED -> ENABLED. Adding 'pulse-ready' class.`);
            playTerraformReadySound();

            // Add pulse class
            terraformButton.classList.add('pulse-ready');

            // Remove class after animation finishes (3 iterations)
            // Use 'animationend' event listener with { once: true }
            const handleAnimationEnd = () => {
                // --- NEW: Check if class still exists before removing ---
                if (terraformButton.classList.contains('pulse-ready')) {
                    console.log("[Terraform Btn Update] 'animationend' event fired. Removing 'pulse-ready' class.");
                    terraformButton.classList.remove('pulse-ready');
                } else {
                     console.log("[Terraform Btn Update] 'animationend' event fired, but 'pulse-ready' class was already removed.");
                }
            };
            // Remove any previous listener before adding a new one to be safe
            terraformButton.removeEventListener('animationend', handleAnimationEnd); 
            terraformButton.addEventListener('animationend', handleAnimationEnd, { once: true }); 

        } else if (enabled === true && currentDisabledState === false) { // Use stored current state
             console.log(`[Terraform Btn Update] State Check: Button ALREADY ENABLED. No pulse.`);
        } else if (enabled === false) {
             console.log(`[Terraform Btn Update] State Check: Button requested DISABLED.`);
             // Ensure pulse class is removed if button becomes disabled during pulse
             if (terraformButton.classList.contains('pulse-ready')) {
                 console.log(`[Terraform Btn Update] Disabling button while pulsing. Removing 'pulse-ready' class.`);
                 terraformButton.classList.remove('pulse-ready');
                 // We might also want to remove the specific animationend listener added earlier
                 // but since it's {once: true}, it might clean itself up. Let's leave it for now.
             }
        }
        // -------------------------------------------
        terraformButton.disabled = !enabled; // State change happens *after* the check
        terraformButton.textContent = `Terraform ${planetName}`;
        terraformButton.style.cursor = enabled ? 'pointer' : 'default';
        terraformButton.style.backgroundColor = enabled ? '#4CAF50' : '#cccccc';
        terraformButton.style.color = enabled ? 'white' : '#666666';
    } else {
        console.warn("Terraform Button element not found.");
    }
}

// --- NEW: Boost Meter UI Update ---
function updateBoostMeterUI() {
    if (!boostMeterFillElement || !boostStatusElement || !window.playerState) {
        return; // Exit if elements or player state aren't ready
    }

    const now = performance.now();
    const playerState = window.playerState; // Get reference

    // Check if currently boosting (by checking if boostStartTime is set)
    if (playerState.boostStartTime > 0) {
        // --- Currently Boosting: Show Remaining Duration ---
        const boostElapsedTime = (now - playerState.boostStartTime) / 1000;
        const remainingDuration = Math.max(0, config.BOOST_MAX_DURATION - boostElapsedTime);
        const fillPercentage = (remainingDuration / config.BOOST_MAX_DURATION) * 100;

        boostMeterFillElement.style.width = `${fillPercentage}%`;
        boostMeterFillElement.style.backgroundColor = '#00aaff'; // Active boost color (blue)
        boostStatusElement.textContent = `Boost: ${remainingDuration.toFixed(1)}s`;
        boostStatusElement.style.color = 'white'; 

    } else {
        // --- Not Boosting: Show Cooldown Progress ---
        const timeSinceLastBoost = (now - playerState.lastBoostTime) / 1000;
        const cooldownDuration = config.BOOST_COOLDOWN_DURATION;
        
        if (timeSinceLastBoost >= cooldownDuration) {
            // Cooldown complete
            boostMeterFillElement.style.width = '100%';
            boostMeterFillElement.style.backgroundColor = '#00ff88'; // Ready color (green)
            boostStatusElement.textContent = 'Ready';
            boostStatusElement.style.color = 'black'; // Text color when ready
        } else {
            // Still on cooldown
            const cooldownProgress = timeSinceLastBoost / cooldownDuration;
            const fillPercentage = cooldownProgress * 100;
            boostMeterFillElement.style.width = `${fillPercentage}%`;
            boostMeterFillElement.style.backgroundColor = '#888888'; // Cooldown color (grey)
            
            const timeLeft = cooldownDuration - timeSinceLastBoost;
            boostStatusElement.textContent = `Wait ${timeLeft.toFixed(1)}s`;
            boostStatusElement.style.color = '#ffcc00'; // Cooldown text color (yellow)
        }
    }
}
// --- END NEW Boost Meter UI ---

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
    playInventoryFullSound(); // <<< Play sound here
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

// --- NEW: Debug Action to Enable Terraform Button ---
function handleDebugEnableTerraformButton() {
    const targetPlanetName = 'Infernia'; // Hardcoded target
    console.log(`DEBUG: Forcefully enabling Terraform button for ${targetPlanetName}...`);
    // Directly call the update function to enable it, triggering sound/pulse if needed
    updateTerraformButton(true, targetPlanetName); 
}

// --- Initialize the application ---
async function init() {
    console.log("Main INIT: Starting initialization...");

    try {
        // --- Step 0: Get UI Containers ---
        mapContainer = document.getElementById('map-container');
        if (!mapContainer) {
            console.warn("Map container element not found. Mini-map will not be initialized.");
            // Optionally throw an error or handle gracefully
        }
        // ---------------------------------

        // --- Step 1: Initialize Scene, Camera, Renderer, Lights ---
        const sceneObjs = initScene();
        scene = sceneObjs.scene;
        camera = sceneObjs.camera;
        renderer = sceneObjs.renderer;
        audioListener = sceneObjs.audioListener;

        // --- Step 1.1: Initialize Post-Processing ---
        composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.3,    // strength
            0.4,    // radius
            0.85    // threshold
        );
        composer.addPass(bloomPass);
        console.log("Main INIT: Post-processing composer and passes initialized.");
        // -------------------------------------------

        // --- Step 1.5: Load Audio Asynchronously and Wait ---
        console.log("Main INIT: Loading audio...");
        try {
            const loadedSounds = await loadAudio(audioListener); // Get the returned object
            console.log("Main INIT: Audio loaded successfully.");
            
            // Store for global access if needed by other modules (like player.js for rolling sound)
            window.loadedSounds = loadedSounds; 

            // Start ambient sound now using the returned reference
            if (loadedSounds.ambientSound && loadedSounds.ambientSound.buffer && !loadedSounds.ambientSound.isPlaying) {
                 if (loadedSounds.ambientSound.context.state === 'running') {
                     console.log("Main INIT: Starting ambient sound.");
                     loadedSounds.ambientSound.play();
                 } else {
                    console.warn("Main INIT: Ambient sound loaded, but audio context not running, cannot play.");
                 } 
            } else {
                 // This condition should ideally not be met now if loading was successful
                 console.warn("Main INIT: Ambient sound object or buffer not ready after loadAudio resolved? (Using returned object)");
            }
        } catch (error) {
            console.error("Main INIT: Failed to load audio. Gameplay might be affected.", error);
            // Decide how to proceed - maybe show an error message?
        }
        // -------------------------------------------------------

        // --- Step 2: Initialize Stats (Performance Monitor) ---
        stats = new Stats();
        stats.domElement.style.position = 'absolute';
        stats.domElement.style.top = '0px';
        stats.domElement.style.right = '0px'; // Position top-right
        stats.domElement.style.left = 'auto'; // Override default left positioning
        document.body.appendChild(stats.dom);
        console.log("Main INIT: Stats initialized.");

        // --- Step 3: Initialize Planets ---
        const planetObjs = initPlanets(scene);
        planetsState = planetObjs.planets;
        homePlanet = planetObjs.homePlanet;
        if (!homePlanet) {
            throw new Error("Main INIT: Home planet mesh not found after initPlanets!");
        }
        // Store home planet world position (assuming it doesn't move)
        homePlanet.getWorldPosition(_mapHomePlanetWorldPos);
        console.log("Main INIT: Planets initialized.");

        // --- Calculate Launch Pad Position (LOCAL coordinates) ---
        const homePlanetRadius = homePlanet.geometry.parameters.radius;
        const northPoleDir = new THREE.Vector3(0, 1, 0);
        const rotationAxis = new THREE.Vector3(0, 0, 1); // Rotate around World Z
        // Calculate small angle based on desired offset along the surface
        const angle = config.LAUNCH_PAD_OFFSET.x / homePlanetRadius; 
        const offsetQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angle);
        const launchPadDir = northPoleDir.clone().applyQuaternion(offsetQuat);
        // Place it slightly above the surface for visibility
        _launchPadLocalPos.copy(launchPadDir).multiplyScalar(homePlanetRadius + 0.1); 
        console.log(`Main INIT: Calculated _launchPadLocalPos: (${_launchPadLocalPos.x.toFixed(2)}, ${_launchPadLocalPos.y.toFixed(2)}, ${_launchPadLocalPos.z.toFixed(2)})`);
        // -------------------------------------------------------

        // --- Step 4: Initialize Resources ---
        initResources(scene, homePlanet, planetsState, audioListener);
        console.log("Main INIT: Resources initialized.");

        // --- Step 5: Initialize Player ---
        // Make playerState globally accessible (consider alternatives later if needed)
        window.playerState = initPlayer(scene, homePlanet, audioListener);
        console.log("Main INIT: Player initialized.");

        // --- Step 6: Initialize Rocket ---
        initRocket(scene, homePlanet);
        console.log("Main INIT: Rocket initialized.");

        // --- Step 6.5: Initialize Mini-Map ---
        if (mapContainer) {
            console.log("Main INIT: Initializing Mini-Map...");
            mapScene = new THREE.Scene();

            // Map Renderer
            mapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Use alpha if bg is transparent
            mapRenderer.setSize(mapContainer.clientWidth, mapContainer.clientHeight);
            mapRenderer.setPixelRatio(window.devicePixelRatio);
            mapRenderer.setClearColor(0x000000, 0); // Transparent background
            mapContainer.appendChild(mapRenderer.domElement);

            // Map Camera (Perspective)
            const mapAspect = mapContainer.clientWidth / mapContainer.clientHeight;
            mapCamera = new THREE.PerspectiveCamera(50, mapAspect, 1, 1000);
            mapCamera.position.set(0, MAP_CAMERA_DISTANCE, 0); // Initial position above
            mapCamera.lookAt(mapScene.position); // Look at center

            // Map Planet (Wireframe)
            const mapPlanetGeo = new THREE.SphereGeometry(MAP_PLANET_RADIUS, 8, 6); // Reduced segments
            const mapPlanetMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5 }); // Make slightly transparent
            mapPlanet = new THREE.Mesh(mapPlanetGeo, mapPlanetMat);
            mapScene.add(mapPlanet);

            // Map Player Dot
            const mapPlayerGeo = new THREE.SphereGeometry(MAP_DOT_RADIUS, 8, 8);
            const mapPlayerMat = new THREE.MeshBasicMaterial({ color: 0x00aaff }); // Blue
            mapPlayer = new THREE.Mesh(mapPlayerGeo, mapPlayerMat);
            mapPlayer.visible = false; // Initially hidden
            mapScene.add(mapPlayer);

            // Map Pal Dot
            const mapPalGeo = new THREE.SphereGeometry(MAP_DOT_RADIUS, 8, 8);
            const mapPalMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green
            mapPal = new THREE.Mesh(mapPalGeo, mapPalMat);
            mapPal.visible = false; // Initially hidden
            mapScene.add(mapPal);

            // Map Rocket Cone
            const mapRocketGeo = new THREE.ConeGeometry(MAP_DOT_RADIUS * 0.8, MAP_CONE_HEIGHT, 8); // radius, height, segments
            const mapRocketMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            mapRocket = new THREE.Mesh(mapRocketGeo, mapRocketMat);
            mapRocket.visible = false;
            mapScene.add(mapRocket);

            // --- NEW: Map Path Trail Line ---
            const mapPathGeo = new THREE.BufferGeometry();
            const mapPathPositions = new Float32Array(config.MAX_PATH_POINTS * 3);
            mapPathGeo.setAttribute('position', new THREE.BufferAttribute(mapPathPositions, 3));
            // --- TEMPORARY: Use LineBasicMaterial ---
            const mapPathMat = new THREE.LineBasicMaterial({ 
                color: 0x00aaff, // NEW: Blue color to match player dot
                depthTest: false // KEEP: Don't hide behind sphere
            });
            // ----------------------------------------
            mapPathTrail = new THREE.Line(mapPathGeo, mapPathMat); 
            // -------------------------------------------
            mapPathTrail.frustumCulled = false; // Prevent disappearing
            mapScene.add(mapPathTrail);
            // -------------------------------

            console.log("Main INIT: Mini-Map initialized.");
        }
        // --------------------------------------

        // --- Step 7: Create UI ---
        createInventoryUI();
        // Add other UI elements
        seedBankElement = document.createElement('div');
        seedBankElement.id = 'seed-bank';
        seedBankElement.style.position = 'absolute';
        seedBankElement.style.bottom = '60px';
        seedBankElement.style.left = '10px';
        seedBankElement.style.color = 'white';
        seedBankElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
        seedBankElement.style.fontSize = '14px';
        seedBankElement.style.textShadow = '1px 1px 2px black';
        seedBankElement.textContent = 'Target Seeds: 0 / 0'; // Initial text
        document.body.appendChild(seedBankElement);

        terraformButton = document.createElement('button');
        terraformButton.id = 'terraform-button';
        terraformButton.style.position = 'absolute';
        terraformButton.style.bottom = '80px';
        terraformButton.style.left = '10px';
        terraformButton.style.padding = '8px 12px';
        terraformButton.style.border = 'none';
        terraformButton.style.borderRadius = '4px';
        terraformButton.style.fontFamily = 'Helvetica, Arial, sans-serif';
        terraformButton.addEventListener('click', handleTerraformClick);
        updateTerraformButton(false, 'Infernia'); // Initial state (disabled)
        document.body.appendChild(terraformButton);
        
        // Get reference to launch prompt from resources.js UI
        launchPromptElement = document.getElementById('launch-prompt');
        
        // Create Mission Status Message Area
        missionStatusElement = document.createElement('div');
        missionStatusElement.id = 'mission-status';
        missionStatusElement.style.position = 'absolute';
        missionStatusElement.style.bottom = '10px'; // Positioned at the very bottom
        missionStatusElement.style.left = '10px';
        missionStatusElement.style.color = '#ffcc00'; // Yellow/gold color
        missionStatusElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
        missionStatusElement.style.fontSize = '16px';
        missionStatusElement.style.fontWeight = 'bold';
        missionStatusElement.style.textShadow = '1px 1px 2px black';
        missionStatusElement.textContent = 'Mission: Terraform Infernia'; // Initial message
        document.body.appendChild(missionStatusElement);

        // NEW: Create Boost Meter UI
        const boostMeterContainer = document.createElement('div');
        boostMeterContainer.style.position = 'absolute';
        boostMeterContainer.style.bottom = '10px';
        boostMeterContainer.style.right = '10px';
        boostMeterContainer.style.width = '150px';
        boostMeterContainer.style.height = '20px';
        boostMeterContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
        boostMeterContainer.style.border = '1px solid #888';
        boostMeterContainer.style.borderRadius = '3px';
        boostMeterContainer.style.overflow = 'hidden';

        boostMeterFillElement = document.createElement('div');
        boostMeterFillElement.style.width = '0%'; // Start empty (will update)
        boostMeterFillElement.style.height = '100%';
        boostMeterFillElement.style.backgroundColor = '#00aaff'; // Boost color
        boostMeterFillElement.style.transition = 'width 0.1s linear'; // Smooth fill transition

        boostStatusElement = document.createElement('div');
        boostStatusElement.style.position = 'absolute';
        boostStatusElement.style.top = '0';
        boostStatusElement.style.left = '0';
        boostStatusElement.style.width = '100%';
        boostStatusElement.style.height = '100%';
        boostStatusElement.style.display = 'flex';
        boostStatusElement.style.alignItems = 'center';
        boostStatusElement.style.justifyContent = 'center';
        boostStatusElement.style.color = 'white';
        boostStatusElement.style.fontSize = '12px';
        boostStatusElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
        boostStatusElement.style.textShadow = '1px 1px 1px black';

        boostMeterContainer.appendChild(boostMeterFillElement);
        boostMeterContainer.appendChild(boostStatusElement);
        document.body.appendChild(boostMeterContainer);
        // ---------------------------
        
        // --- Create Debug Buttons (Moved to Bottom Right) ---
        debugFillButton = document.createElement('button');
        debugFillButton.textContent = 'Debug: Fill Resources';
        debugFillButton.style.position = 'absolute';
        debugFillButton.style.bottom = '100px'; // Stacked above others
        debugFillButton.style.right = '10px';
        debugFillButton.style.fontFamily = 'Helvetica, Arial, sans-serif';
            debugFillButton.addEventListener('click', handleDebugFillResources);
        document.body.appendChild(debugFillButton);

        debugInstantTerraformButton = document.createElement('button');
        debugInstantTerraformButton.textContent = 'Debug: Trigger Terraform';
        debugInstantTerraformButton.style.position = 'absolute';
        debugInstantTerraformButton.style.bottom = '70px'; // Stacked above enable btn
        debugInstantTerraformButton.style.right = '10px';
        debugInstantTerraformButton.style.fontFamily = 'Helvetica, Arial, sans-serif';
            debugInstantTerraformButton.addEventListener('click', handleDebugInstantTerraform);
        document.body.appendChild(debugInstantTerraformButton);

        debugEnableTerraformButton = document.createElement('button');
        debugEnableTerraformButton.textContent = 'Debug: Enable Terraform Btn';
        debugEnableTerraformButton.style.position = 'absolute';
        debugEnableTerraformButton.style.bottom = '40px'; // Above boost meter
        debugEnableTerraformButton.style.right = '10px';
        debugEnableTerraformButton.style.fontFamily = 'Helvetica, Arial, sans-serif';
        debugEnableTerraformButton.addEventListener('click', handleDebugEnableTerraformButton);
        document.body.appendChild(debugEnableTerraformButton);
        // -----------------------------------------------------

        console.log("Main INIT: UI created.");

        // --- Step 7.5: Place Rocket on Pad Initially ---
        if (rocketMesh) { // Ensure rocket mesh is loaded before placing
             placeRocketOnPad(_launchPadLocalPos);
             console.log("Main INIT: Explicitly called placeRocketOnPad.");
        } else {
             console.warn("Main INIT: rocketMesh not available immediately after initRocket. Will be placed in animate loop.");
        }
        // ----------------------------------------------

        // --- Step 8: Start Animation Loop ---
        console.log("Main INIT: Starting animation loop.");
        animate(); 

        console.log("Main INIT: Initialization complete.");

    } catch (error) {
        console.error("Main INIT: Critical error during initialization!", error);
        // Display error to user?
        document.body.innerHTML = `<div style="color: red; padding: 20px;">Initialization Failed: ${error.message}<br><pre>${error.stack}</pre></div>`;
    }
}

// Get the delta time for physics updates
const clock = new THREE.Clock();

// --- Function to update mini-map ---
function updateMiniMap() {
    if (!mapScene || !mapRenderer || !homePlanet || !window.playerState?.mesh) {
        return; // Not ready yet
    }

    const mainPlanetRadius = homePlanet.geometry.parameters.radius; // Get actual radius

    // Update Player Dot
    if (window.playerState.mesh) {
        window.playerState.mesh.getWorldPosition(_mapPlayerWorldPos);
        // Position relative to home planet center, normalize, scale to map radius
        _mapTargetPos.subVectors(_mapPlayerWorldPos, _mapHomePlanetWorldPos).normalize().multiplyScalar(MAP_PLANET_RADIUS);
        mapPlayer.position.copy(_mapTargetPos);
        mapPlayer.visible = true;

        // Update Map Camera Position & Orientation
        // Use player's relative position for camera offset
        _mapCamPos.copy(_mapTargetPos).normalize().multiplyScalar(MAP_CAMERA_DISTANCE);
        mapCamera.position.copy(_mapCamPos);

        // Get player's up vector in world space to orient camera
        _mapPlayerUp.set(0, 1, 0).applyQuaternion(window.playerState.mesh.quaternion).normalize();
        mapCamera.up.copy(_mapPlayerUp); // Set camera's up direction

        mapCamera.lookAt(mapScene.position); // Look at map center (0,0,0)

    } else {
        mapPlayer.visible = false;
    }

    // Update Pal Dot
    if (palMesh && palMesh.parent) { // Check if pal exists and is added to scene graph
        palMesh.getWorldPosition(_mapPalWorldPos);
        _mapTargetPos.subVectors(_mapPalWorldPos, _mapHomePlanetWorldPos).normalize().multiplyScalar(MAP_PLANET_RADIUS);
        mapPal.position.copy(_mapTargetPos);
        mapPal.visible = true;
    } else {
        mapPal.visible = false;
    }

    // Update Rocket Cone
    let rocketVisible = false;
    if (rocketMesh) {
         if (isRocketActive()) { // Flying
             rocketMesh.getWorldPosition(_mapRocketWorldPos);
             _mapTargetPos.subVectors(_mapRocketWorldPos, _mapHomePlanetWorldPos).normalize();
             rocketVisible = true;
         } else if (isRocketStationed()) { // On pad
              _launchPadWorldPos.copy(_launchPadLocalPos).applyMatrix4(homePlanet.matrixWorld);
              _mapTargetPos.subVectors(_launchPadWorldPos, _mapHomePlanetWorldPos).normalize();
              rocketVisible = true;
         }
    }

    mapRocket.visible = rocketVisible;
    if (rocketVisible) {
        mapRocket.position.copy(_mapTargetPos).multiplyScalar(MAP_PLANET_RADIUS + MAP_CONE_HEIGHT * 0.5); // Position on sphere + half height offset
        // Orient the cone to point outwards
        _mapTargetUp.copy(_mapTargetPos); // Direction from center is the up vector
        _mapOrientationQuat.setFromUnitVectors(_yAxis, _mapTargetUp); // Rotate default Y+ up to point outwards
        mapRocket.quaternion.copy(_mapOrientationQuat);
    }

    // --- NEW: Update Map Path Trail ---
    if (mapPathTrail && pathPoints) {
        // --- DEBUG LOGGING ---
        console.log(`[Map Path Debug] pathPoints.length: ${pathPoints.length}`);
        // ---------------------

        // --- Calculate drawable segments and starting index --- 
        const numAvailablePoints = pathPoints.length;
        const maxDrawableVertices = Math.min(numAvailablePoints, config.MAX_PATH_POINTS); // How many vertices fit in config
        const numDrawableSegments = Math.floor(maxDrawableVertices / 2);
        const startIndexInPathPoints = Math.max(0, numAvailablePoints - numDrawableSegments * 2); // Index in pathPoints to start reading from
        const numMapVerticesToDraw = numDrawableSegments * 2; // Vertices to actually draw in the map buffer
        // -----------------------------------------------------

        // --- DEBUG LOGGING ---
        console.log(`[Map Path Debug] numDrawableSegments: ${numDrawableSegments}, startIndexInPathPoints: ${startIndexInPathPoints}, numMapVerticesToDraw: ${numMapVerticesToDraw}`);
        // ---------------------

        // --- Create a new array with the exact size needed ---
        // const numMapVertices = numDrawableSegments * 2; // OLD calculation
        const mapPositionsData = new Float32Array(numMapVerticesToDraw * 3); 
        let mapPointIndex = 0; // Index for the new array (mapPositionsData)
        // ----------------------------------------------------

        // --- Loop over the DRAWABLE segments using the calculated start index --- 
        for (let i = 0; i < numDrawableSegments; i++) {
            const p1_index = startIndexInPathPoints + i * 2;
            const p2_index = startIndexInPathPoints + i * 2 + 1;

            // Boundary check (shouldn't be needed with correct logic, but safe)
            if (p1_index >= pathPoints.length || p2_index >= pathPoints.length) {
                console.warn(`[Map Path Debug] Index out of bounds: p1=${p1_index}, p2=${p2_index}, length=${pathPoints.length}`);
                continue;
            }

            const p1_local = pathPoints[p1_index];
            const p2_local = pathPoints[p2_index];
        // -----------------------------------------------------------------------

            if (!p1_local || !p2_local) continue; // Skip if points are missing

            // --- Convert local path points back to WORLD space --- 
            const p1_world = _vec3.copy(p1_local).applyMatrix4(homePlanet.matrixWorld);
            const p2_world = _vec3.copy(p2_local).applyMatrix4(homePlanet.matrixWorld);
            // ------------------------------------------------------

            // Calculate map position for p1 (relative to map center, using WORLD pos)
            _mapTargetPos.copy(p1_world).sub(_mapHomePlanetWorldPos).normalize().multiplyScalar(MAP_PLANET_RADIUS);
            mapPositionsData[mapPointIndex++] = _mapTargetPos.x;
            mapPositionsData[mapPointIndex++] = _mapTargetPos.y;
            mapPositionsData[mapPointIndex++] = _mapTargetPos.z;

            // Calculate map position for p2 (relative to map center, using WORLD pos)
            _mapTargetPos.copy(p2_world).sub(_mapHomePlanetWorldPos).normalize().multiplyScalar(MAP_PLANET_RADIUS);
            mapPositionsData[mapPointIndex++] = _mapTargetPos.x;
            mapPositionsData[mapPointIndex++] = _mapTargetPos.y;
            mapPositionsData[mapPointIndex++] = _mapTargetPos.z;

            // --- DEBUG LOGGING (first segment only) ---
            if (i === 0) {
                console.log(`[Map Path Debug] First segment drawn: p1_map(${_mapTargetPos.x.toFixed(1)}, ${_mapTargetPos.y.toFixed(1)}, ${_mapTargetPos.z.toFixed(1)}) (reading from pathPoints index ${p1_index})`);
            }
            // -----------------------------------------
        }

        // --- Get the attribute reference ---
        const mapPositionsAttribute = mapPathTrail.geometry.attributes.position;

        // --- Copy the calculated data into the attribute's array --- 
        mapPositionsAttribute.array.set(mapPositionsData);
        // ---------------------------------------------------------

        // --- Mark the attribute for update --- 
        mapPositionsAttribute.needsUpdate = true; 
        // -----------------------------------

        // --- Set Draw Range (using calculated vertex count) ---
        mapPathTrail.geometry.setDrawRange(0, numMapVerticesToDraw); 
        // ----------------------

        // --- Compute distances ONLY if using Dashed Material ---
        // mapPathTrail.computeLineDistances(); // REMOVED for LineBasicMaterial
        // -----------------------------------------------------
        
        mapPathTrail.geometry.computeBoundingSphere(); // Update bounding sphere

    } else {
        // Clear the line if pathPoints is empty or null
        // --- Simplify clearing logic ---
        if (mapPathTrail && mapPathTrail.geometry.drawRange.count > 0) { // Check if already drawing something
            mapPathTrail.geometry.setDrawRange(0, 0); // Draw nothing
            mapPathTrail.geometry.attributes.position.needsUpdate = true; // Need to update buffer when clearing
            console.log("[Map Path Debug] Clearing map path trail.");
        }
        // ------------------------------
    }
    // -------------------------------
}
// -------------------------------------

function animate() {
    stats.begin(); // START FPS counter
    
    // Request next frame
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    const now = performance.now();

    // --- Initialize Pal (once player is ready) ---
    if (!isPalInitialized && window.playerState?.mesh && homePlanet) {
        initPal(window.playerState.mesh, homePlanet); // Pass player mesh and parent (planet)
        isPalInitialized = true;
    }
    // --------------------------------------------

    // --- Update Game Logic ---
    updateOrbits(planetsState, deltaTime);
    
    // --- Log Player State Before Update ---
    if (window.playerState && window.playerState.mesh) {
        // console.log('Player Mesh Position:', window.playerState.mesh.position);
    } else {
        // console.log('Player state or mesh not ready yet.');
    }
    // ------------------------------------
    
    updatePlayer(deltaTime, camera, homePlanet, planetsState);
    if (typeof updatePathTrail === 'function') { 
        updatePathTrail(window.playerState?.mesh, homePlanet);
    }
    // Check if player mesh exists before updating resources (it's loaded async)
    if (window.playerState?.mesh) {
        updateResources(scene, window.playerState.mesh, homePlanet, audioListener, deltaTime);
    }
    const landingInfo = updateRocket(deltaTime);
    updatePal(deltaTime, window.playerState?.mesh, homePlanet); // Update call with args

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
    if (isRocketStationed() && !isRocketActive() && !isLaunchPending && window.playerState?.mesh && homePlanet) {
        // Calculate world position of the launch pad
        _launchPadWorldPos.copy(_launchPadLocalPos).applyMatrix4(homePlanet.matrixWorld);
        
        // Check player proximity
        window.playerState.mesh.getWorldPosition(_tempPlayerPos);
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

            // Handle Spacebar Press (Launch Initiation) --> Change to L key
            if (keyState['l']) { // CHANGED FROM keyState['L']
                keyState['l'] = false; // Consume key press

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
        updateCamera(camera, window.playerState.mesh, homePlanet);
    }

    // --- Update UI --- (Moved together)
    updateInventoryDisplay();
    updateBoostMeterUI(); // Call boost meter update

    // --- Update Mini-Map ---
    updateMiniMap(); // Call the map update function
    // -----------------------

    // --- Render Scene --- Render using composer
    if (composer && scene && camera) { // Check composer exists
        stats.end(); // END FPS counter before render
        // Render main scene
        renderer.setRenderTarget(null); // Ensure rendering to canvas
        renderer.clear(); // Clear main renderer (composer might handle this)
        composer.render(deltaTime); // Use composer for main scene

        // Render map scene separately
        if (mapRenderer && mapScene && mapCamera) {
            renderer.clearDepth(); // Clear depth buffer before rendering map on top
            mapRenderer.render(mapScene, mapCamera);
        }
    } else if (renderer && scene && camera) { // Fallback if composer fails?
         console.warn("Composer not ready, attempting direct render.");
         renderer.render(scene, camera);
         if (mapRenderer && mapScene && mapCamera) {
             renderer.clearDepth();
             mapRenderer.render(mapScene, mapCamera);
         }
         stats.end();
    }
}

// Add composer AND map resize to window resize handler
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Resize main renderer and camera
    if (camera && renderer) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        if (composer) {
            composer.setSize(width, height);
        }
    }

    // Resize map renderer and camera
    if (mapContainer && mapRenderer && mapCamera) {
        const mapWidth = mapContainer.clientWidth;
        const mapHeight = mapContainer.clientHeight;

        mapRenderer.setSize(mapWidth, mapHeight);
        mapCamera.aspect = mapWidth / mapHeight;
        mapCamera.updateProjectionMatrix();
    }
}

// Start initialization when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    console.log('Event: DOM fully loaded and parsed. Calling main init()...');
    // Add listener BEFORE init
    window.addEventListener('resize', onWindowResize);
    init();
}); 