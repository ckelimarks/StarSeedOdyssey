import * as THREE from 'https://esm.sh/three@0.128.0';
import Stats from 'https://esm.sh/three@0.128.0/examples/jsm/libs/stats.module.js'; // Import Stats
// --- Post-Processing Imports ---
import { EffectComposer } from 'https://esm.sh/three@0.128.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.128.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.128.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // <<< ADDED IMPORT
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
    playInventoryFullSound, // <<< Import Inventory Full Sound Player
    // --- NEW Theme/Success Imports ---
    playThemeMusic,
    playTerraformSuccessSound,
    playAppropriateMusic // <<< ADDED NEW MUSIC FUNCTION
} from './resources.js';
import { 
    initRocket, 
    updateRocket, 
    launchRocket, 
    isRocketActive, 
    isRocketStationed, 
    placeRocketOnPad, 
    hideRocketFromPad, 
    rocketMesh,
    startRocketEffects, // <<< NEW IMPORT
    stopRocketEffects   // <<< NEW IMPORT
} from './rocket.js';
import { updateCamera } from './camera.js';
import { initPal, updatePal, palMesh } from './pal.js'; // ADDED Pal import and palMesh export
import { initEnemy, updateEnemy } from './enemy.js'; // <<< ADDED Enemy import
// <<< Import Aperture Model >>>
import { techApertureModelProto } from './resources.js';

console.log("main.js: Script start");

// Module-level variables for core components
let scene, camera, renderer, audioListener;
let composer; // NEW: For post-processing
let homePlanet;
let planetsState = {}; // Populated by initPlanets
let globalLowPassFilter = null; // <<< NEW: For system view audio effect
let stats; // Declare stats globally

// --- Mini-Map Components ---
let mapScene, mapCamera, mapRenderer;
let mapContainer;
let mapPlanet;
let mapPlayer, mapPal, mapRocket;
let mapPathTrail; // NEW: For player path
let mapEnemy; // <<< NEW: Enemy dot
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

let enemyState = null; // <<< ADDED Enemy state variable
let isDebugCameraActive = false; // NEW: Flag for top-down debug camera view
let isGameOver = false; // <<< NEW: Game Over State Flag
let shakeDuration = 0; // <<< NEW: Screen Shake State
let shakeIntensity = 0;
let shakeTimer = 0;
// let playerHealth = 3; // <<< REMOVED: Use window.playerState.health instead
let playerHitCooldownTimer = 0; // <<< NEW: Invulnerability Timer
const PLAYER_HIT_COOLDOWN_DURATION = 1.0; // <<< NEW: Cooldown duration in seconds

// UI Element References
let seedBankElement = null;
let terraformButton = null;
let launchPromptElement = null;
let missionStatusElement = null; // NEW: Reference for mission status message
let debugFillButton = null; // NEW: Reference for debug button
let debugInstantTerraformButton = null; // NEW: Reference for instant terraform button
let debugEnableTerraformButton = null; // NEW: Reference for enable terraform button debug
let debugFocusVerdantButton = null; // NEW: Reference for focus button
let boostMeterFillElement = null; // NEW
let boostStatusElement = null; // NEW
let enemyStatusElement = null; // <<< ADDED
let planetTooltipElement = null; // <<< NEW: For hover info
let planetOutlineElement = null; // <<< NEW: For CSS outline
let gameOverOverlayElement = null; // <<< NEW: Game Over Screen
let playerHealthElement = null; // <<< NEW: Player Health UI
let damageOverlayElement = null; // <<< NEW: Damage Flash Overlay
// let startOverlayElement = null; // <<< REMOVED: Start Overlay UI

// --- Raycasting & Hover State ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // Normalized device coordinates (-1 to +1)
let hoveredPlanet = null; // Reference to the currently hovered planet { name, mesh }
let intersectablePlanets = []; // Array of meshes/groups to check for intersection
// -------------------------------


let debugNodeSpawned = false;

// --- NEW: Pal State ---
let isPalInitialized = false;
// -------------------

// Temp vectors for calculations
const _tempPlayerPos = new THREE.Vector3();
const _debugPlayerPos = new THREE.Vector3(); // <<< ADDED for debug spawn
const _launchPadLocalPos = new THREE.Vector3(); // Store LOCAL pad position
const _launchPadWorldPos = new THREE.Vector3(); // For launch pad world coordinates (calculated in animate)
const _launchPadNormal = new THREE.Vector3();   // For launch pad orientation (calculated in animate)
const _vec3 = new THREE.Vector3(); // Generic temporary vector
const _vector3_2 = new THREE.Vector3(); // <<< ADD Declaration for second temp vector
const _modelUp = new THREE.Vector3(0, 1, 0); // <<< ADD Declaration for model up vector
const _alignmentQuaternion = new THREE.Quaternion(); // <<< ADD Declaration for alignment quaternion
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
const _mapEnemyWorldPos = new THREE.Vector3(); // <<< NEW: Temp vector for enemy
const _mapPlayerUp = new THREE.Vector3(); // Store player's up vector
const _mapTargetUp = new THREE.Vector3(); // For orienting map objects
const _mapOrientationQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
// --------------------------------------

// --- Audio Filter Transition ---
const FILTER_TRANSITION_DURATION = 2.0; // seconds (Increased from 0.8)
let isFilterTransitioning = false;
let filterTransitionStartTime = 0;
let filterStartFrequency = 20000; // Store the frequency where the transition starts
let filterTargetFrequency = 20000; // Store the frequency to transition to

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
        
        // --- Calculate and store the view offset relative to the planet ---
        const planetRadius = planetData.mesh.geometry.parameters.radius || 50;
        planetData.mesh.getWorldPosition(_planetFocusWorldPos); // Get planet center pos
        
        // <<< CHANGE: Calculate offset based on player-planet direction >>>
        // <<< RESTORE Original Offset Calculation >>>
        if (window.playerState?.visualMesh) {
            window.playerState.visualMesh.getWorldPosition(_tempPlayerPos); // Get player world pos
            terraformViewOffset.subVectors(_tempPlayerPos, _planetFocusWorldPos).normalize(); // Direction from planet to player
        } else {
            // Fallback if player isn't ready: use camera's direction
            console.warn("TerraformClick: Player mesh not found, using camera direction for offset.");
            terraformViewOffset.subVectors(camera.position, _planetFocusWorldPos).normalize(); // Original fallback
        }
        // <<< END RESTORE >>>
        terraformViewOffset.multiplyScalar(planetRadius * 2.5); // <<< INCREASE Multiplier (was 1.8)
        // <<< END CHANGE >>>

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

function handleFocusToggleClick() {
    // Ensure audio context is running and filter exists
    if (!audioListener?.context || !globalLowPassFilter) {
        console.error("Cannot toggle audio filter: Audio context or filter node missing.");
        return;
    }
    const audioCtx = audioListener.context;

    // Resume context if needed
    if (audioCtx.state === 'suspended') {
        console.warn("Audio context is suspended, attempting resume...");
        audioCtx.resume().then(() => {
            console.log("Audio context resumed, re-calling toggle.");
            handleFocusToggleClick();
        }).catch(err => {
            console.error("Failed to resume audio context:", err);
        });
        // Don't revert toggle state here, let the resumed call handle it
        return; 
    }

    // Toggle the main state
    isDebugCameraActive = !isDebugCameraActive;

    // Get target frequency and current time
    // NOTE: Exponential ramp cannot target 0Hz. Use a very small positive value instead.
    const targetFrequency = isDebugCameraActive ? 300 : 20000; 
    const now = audioCtx.currentTime;
    const endTime = now + FILTER_TRANSITION_DURATION;

    // Update button text and add/remove mouse listener
    if (isDebugCameraActive) { 
        if(debugFocusVerdantButton) debugFocusVerdantButton.textContent = 'Player View';
        console.log("Debug Focus: Switched to Solar System View"); 
        document.addEventListener( 'mousemove', onDocumentMouseMove, false );
    } else {
        if(debugFocusVerdantButton) debugFocusVerdantButton.textContent = 'System View'; 
        console.log("Debug Focus: Switched to Player Camera"); 
        document.removeEventListener( 'mousemove', onDocumentMouseMove, false );
        hoveredPlanet = null;
        if (planetOutlineElement) planetOutlineElement.style.display = 'none'; 
        if (planetTooltipElement) planetTooltipElement.style.display = 'none'; 
    }

    // --- Initiate Exponential Ramp ---
    try {
        // Get current value accurately
        const currentFrequency = globalLowPassFilter.frequency.value;
        // Cancel previous ramps and set starting point accurately
        globalLowPassFilter.frequency.cancelScheduledValues(now);
        globalLowPassFilter.frequency.setValueAtTime(currentFrequency, now);
        // Schedule the exponential ramp
        globalLowPassFilter.frequency.exponentialRampToValueAtTime(targetFrequency, endTime);
        console.log(`Audio Filter: Starting EXPONENTIAL ramp from ${currentFrequency.toFixed(0)}Hz to ${targetFrequency}Hz over ${FILTER_TRANSITION_DURATION}s`);
    } catch (e) {
        console.error("Error scheduling exponential ramp:", e);
        // Fallback: Snap to target frequency if ramp fails
        globalLowPassFilter.frequency.setValueAtTime(targetFrequency, now);
    }
    // -------------------------------
}

// --- NEW: Mouse Move Handler for Raycasting ---
function onDocumentMouseMove( event ) {
    // Calculate mouse position in normalized device coordinates
    // (-1 to +1) for both components
    event.preventDefault(); // Prevent default browser actions
    mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}
// --------------------------------------------

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
        // <<< ADD BACK Get Element References >>>
        gameOverOverlayElement = document.getElementById('gameOverOverlay');
        playerHealthElement = document.getElementById('player-health');
        damageOverlayElement = document.getElementById('damage-overlay'); // <<< Get Damage Overlay
        // startOverlayElement = document.getElementById('start-overlay'); // <<< REMOVED Get Start Overlay Element
        console.log(`[Init Debug] gameOverOverlayElement found? ${!!gameOverOverlayElement}`); // Check immediately
        console.log(`[Init Debug] damageOverlayElement found? ${!!damageOverlayElement}`); // <<< Check Damage Overlay
        // console.log(`[Init Debug] startOverlayElement found? ${!!startOverlayElement}`); // <<< REMOVED log
        // ---------------------------------

        // --- Step 1: Initialize Scene, Camera, Renderer, Lights ---
        const sceneObjs = initScene();
        scene = sceneObjs.scene;
        camera = sceneObjs.camera;
        renderer = sceneObjs.renderer;
        audioListener = sceneObjs.audioListener;

        // --- NEW: Create and Connect Global Low Pass Filter ---
        if (audioListener?.context && audioListener?.gain) {
            globalLowPassFilter = audioListener.context.createBiquadFilter();
            globalLowPassFilter.type = 'lowpass';
            // Start with filter effectively off (high frequency)
            globalLowPassFilter.frequency.value = 20000; 
            globalLowPassFilter.Q.value = 1; // Resonance
            
            // Connect listener gain -> filter -> destination
            audioListener.gain.disconnect(); // Disconnect default connection
            audioListener.gain.connect(globalLowPassFilter);
            globalLowPassFilter.connect(audioListener.context.destination);
            
            console.log("Main INIT: Global Low Pass filter created and connected.");
        } else {
            console.error("Main INIT: Could not create/connect filter - AudioListener, context or gain missing.");
        }
        // ----------------------------------------------------

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

        // --- NEW: Add Outline Pass ---
        // outlinePass = new OutlinePass( new THREE.Vector2( window.innerWidth, window.innerHeight ), scene, camera );
        // outlinePass.edgeStrength = 3.0;
        // outlinePass.edgeGlow = 0.5;
        // outlinePass.edgeThickness = 1.0;
        // outlinePass.pulsePeriod = 0;
        // outlinePass.visibleEdgeColor.set('#ffffff');
        // outlinePass.hiddenEdgeColor.set('#190a05');
        // composer.addPass( outlinePass );
        // ---------------------------

        console.log("Main INIT: Post-processing composer and passes initialized.");
        // -------------------------------------------

        // --- Step 1.5: Load Audio Asynchronously and Wait ---
        console.log("Main INIT: Loading audio...");
        try {
            const loadedSounds = await loadAudio(audioListener); // <<< CORRECTED: Call directly
            window.loadedSounds = loadedSounds;
            console.log("Main INIT: Audio loaded successfully.");
            
            // --- Start Ambient Sound --- (Moved after loading finishes)
            // <<< FIX: Use window.loadedSounds reference >>>
            // if (ambientSound && ambientSound.buffer && !ambientSound.isPlaying) { 
            if (window.loadedSounds.ambientSound && window.loadedSounds.ambientSound.buffer && !window.loadedSounds.ambientSound.isPlaying) {
                 // if (ambientSound.context.state === 'running') {
                 if (window.loadedSounds.ambientSound.context.state === 'running') {
                     // <<< Assign global reference AFTER checking loadedSounds >>>
                     // ambientSound = window.loadedSounds.ambientSound; // <<< REMOVE this redundant assignment? Keep for now maybe?
                     // <<< ADD Log before playing >>>
                     // console.log(`[Debug Init Ambient Start] Trying to play ambientSound. Exists: ${!!ambientSound}, Buffer: ${!!ambientSound?.buffer}`);
                     console.log(`[Debug Init Ambient Start] Trying to play ambientSound. Exists: ${!!window.loadedSounds.ambientSound}, Buffer: ${!!window.loadedSounds.ambientSound?.buffer}`);
                     // <<< END Log >>>
                     // ambientSound.play();
                     window.loadedSounds.ambientSound.play(); // <<< FIX: Play using window.loadedSounds
                     console.log("Main INIT: Started ambient sound.");
                 } else {
                    // console.warn("Main INIT: Cannot start ambient sound - AudioContext not running.");
                    console.warn(`Main INIT: Cannot start ambient sound - AudioContext not running. State: ${window.loadedSounds.ambientSound.context.state}`); // <<< Improved Log
                 }
            } else if (window.loadedSounds.ambientSound?.isPlaying) {
                 console.log("Main INIT: Ambient sound already playing.");
            } else {
                 console.warn("Main INIT: Ambient sound object or buffer not ready after loadAudio resolved?", window.loadedSounds.ambientSound);
            }
            // --------------------------------------------------------
            
            // --- Start Initial Music (Moved AFTER ambient sound attempt) --- 
            // playAppropriateMusic(false); // <<< REMOVE from here
            // --------------------------

        } catch (error) {
            console.error("Main INIT: Error loading audio:", error);
            // Handle audio loading error (e.g., show error message, proceed without audio)
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

        // --- Populate intersectable planets list ---
        intersectablePlanets = Object.values(planetsState).map(pData => pData.mesh);
        console.log(`Main INIT: Populated intersectablePlanets list with ${intersectablePlanets.length} objects.`);
        // -------------------------------------------

        // --- Load Purple Planet Model for Verdant Minor ---
        const verdantPlanetGroup = planetsState['Verdant Minor']?.mesh;
        if (verdantPlanetGroup && verdantPlanetGroup instanceof THREE.Object3D) { // Check it's the Object3D group
            const purplePlanetLoader = new GLTFLoader();
            purplePlanetLoader.load(
                'models/purple_planet/scene.gltf', // Corrected filename
                (gltf) => {
                    console.log("Purple Planet model loaded for Verdant Minor.");
                    const loadedModel = gltf.scene;
                    const targetRadius = planetsState['Verdant Minor']?.config?.radius || 25; // Get target radius from config
                    
                    // Scale and Position
                    // Adjust scale to roughly match target radius (needs experimentation based on model size)
                    const scale = 30.0; // Increased from 15.0 (doubled)
                    loadedModel.scale.set(scale, scale, scale);
                    loadedModel.position.set(0, 0, 0); // Position at the center of the group

                    // Shadows
                    loadedModel.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true; // Re-enable cast shadow
                            child.receiveShadow = true;
                        }
                    });

                    // --- Animation Setup --- 
                    if (gltf.animations && gltf.animations.length > 0) {
                        console.log(`[Animation Debug] Found ${gltf.animations.length} animations for Purple Planet model.`);
                        const mixer = new THREE.AnimationMixer(loadedModel); // Mixer targets the loaded model
                        const clip = gltf.animations[0]; 
                        console.log(`[Animation Debug] Playing animation clip: ${clip.name}`);
                        const action = mixer.clipAction(clip);
                        action.play();
                        // Store mixer on the GROUP for later updates
                        verdantPlanetGroup.userData.mixer = mixer; 
                        console.log("Stored animation mixer on Verdant Minor group.");
                    } else {
                        console.log("[Animation Debug] Purple Planet model has no animations.");
                    }
                    // ----------------------

                    // Attach model to the group
                    verdantPlanetGroup.add(loadedModel); 
                    console.log("Attached Purple Planet model to Verdant Minor group.");

                    // --- REMOVE Bounding Box Helper ---
                    // const boxHelper = new THREE.BoxHelper(loadedModel, 0xffff00); // Yellow color
                    // verdantPlanetGroup.add(boxHelper); // Add helper to the same parent as the model
                    // ---------------------------------
                },
                undefined, // Progress callback
                (error) => {
                    console.error('Error loading Purple Planet model:', error);
                }
            );
        } else {
            console.warn("Could not find Verdant Minor planet mesh to attach purple planet model.");
        }
        // --- End Purple Planet Model Loading ---

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

        // Initialize Enemy (Requires planet data)
        enemyState = initEnemy(scene, homePlanet, planetsState, audioListener); // <<< Pass audioListener
        console.log("Main INIT: Enemy initialization requested.");

        // --- Step 6: Initialize Rocket ---
        initRocket(scene, homePlanet);
        console.log("Main INIT: Rocket initialized.");

        // --- Step 6.5: Initialize Mini-Map ---
        if (mapContainer) {
            console.log("Main INIT: Initializing Mini-Map...");
            mapScene = new THREE.Scene();

            // --- NEW: Add Lights to Map Scene ---
            const mapAmbientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft ambient
            mapScene.add(mapAmbientLight);
            const mapDirectionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Directional light
            mapDirectionalLight.position.set(0.5, 1, 1).normalize(); // Position light source
            mapScene.add(mapDirectionalLight);
            // -------------------------------------

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

            // Create Map Sphere (using higher segments for smoothness)
            const mapPlanetGeo = new THREE.SphereGeometry(MAP_PLANET_RADIUS, 32, 16); // <<< Increased segments
            const mapPlanetMat = new THREE.MeshStandardMaterial({ // <<< NEW STANDARD MATERIAL FOR SHADING
                color: 0xffffff, 
                transparent: true, 
                opacity: 0.25, // Slightly less transparent to see shading better
                metalness: 0.1, // Low metalness
                roughness: 0.8  // Mostly rough surface
            });
            mapPlanet = new THREE.Mesh(mapPlanetGeo, mapPlanetMat);
            mapScene.add(mapPlanet);

            // --- NEW: Add faint wireframe overlay ---
            const mapWireframeMat = new THREE.MeshBasicMaterial({
                color: 0x888888, // <<< Changed to grey
                wireframe: true,
                transparent: true,
                opacity: 0.15, // <<< Reduced opacity further
                depthTest: false // Render on top of the solid sphere slightly
            });
            const mapPlanetWireframe = new THREE.Mesh(mapPlanetGeo, mapWireframeMat); // Re-use geometry
            mapScene.add(mapPlanetWireframe);
            // --------------------------------------

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

            // --- NEW: Map Enemy Dot ---
            const mapEnemyGeo = new THREE.BoxGeometry(MAP_DOT_RADIUS * 2, MAP_DOT_RADIUS * 2, MAP_DOT_RADIUS * 2); // NEW Cube
            const mapEnemyMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red
            mapEnemy = new THREE.Mesh(mapEnemyGeo, mapEnemyMat);
            mapEnemy.visible = false; // Initially hidden
            mapScene.add(mapEnemy);
            // --------------------------

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
        // --- Center Styling --- 
        missionStatusElement.style.top = '50%';
        missionStatusElement.style.left = '50%';
        missionStatusElement.style.transform = 'translate(-50%, -50%)';
        missionStatusElement.style.padding = '20px'; // Added padding
        missionStatusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; // Added background
        missionStatusElement.style.borderRadius = '8px'; // Added border radius
        missionStatusElement.style.color = '#ffcc00'; // Initial color (will be changed on success)
        missionStatusElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
        missionStatusElement.style.fontSize = '32px'; // Increased font size
        missionStatusElement.style.fontWeight = 'bold';
        missionStatusElement.style.textAlign = 'center'; // Added text align
        missionStatusElement.style.textShadow = '1px 1px 2px black';
        missionStatusElement.style.zIndex = '101'; // Ensure it's on top
        missionStatusElement.style.display = 'none'; // Start hidden
        missionStatusElement.textContent = ''; // Initial message cleared, set dynamically
        document.body.appendChild(missionStatusElement);

        // NEW: Create Boost Meter UI
        const boostMeterContainer = document.createElement('div');
        boostMeterContainer.style.position = 'relative'; // Add relative for text overlay
        boostMeterContainer.style.width = '150px';
        boostMeterContainer.style.height = '20px';
        boostMeterContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
        boostMeterContainer.style.border = '1px solid #888';
        boostMeterContainer.style.borderRadius = '3px';
        boostMeterContainer.style.overflow = 'hidden';
        // Add margin if needed, but flex gap in inventory container should handle it
        // boostMeterContainer.style.marginTop = '8px'; 

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
        // document.body.appendChild(boostMeterContainer); // Remove appending to body

        // --- Append Health and Boost to Inventory Container ---
        const inventoryContainer = document.getElementById('inventory-container');
        const playerHealthDiv = document.getElementById('player-health'); // Get the health div from HTML
        
        if (inventoryContainer) {
            // Prepend Health Bar to keep it at the top of the inventory area
            if(playerHealthDiv) {
                inventoryContainer.insertBefore(playerHealthDiv, inventoryContainer.firstChild);
                console.log("Main INIT: Moved Player Health Bar into Inventory Container.");
            } else {
                console.warn("Main INIT: Could not find #player-health element to move.");
            }
            
            // Append Boost Meter below existing inventory bars
            inventoryContainer.appendChild(boostMeterContainer);
            console.log("Main INIT: Appended Boost Meter to Inventory Container.");
        } else {
            console.warn("Main INIT: Inventory container not found! Could not append boost meter or move health bar.");
            // Fallback: Append boost meter to body if inventory container fails
            boostMeterContainer.style.position = 'absolute'; 
            boostMeterContainer.style.bottom = '10px'; 
            boostMeterContainer.style.right = '10px'; 
            document.body.appendChild(boostMeterContainer);
        }
        // ----------------------------------------------------

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
        
        debugFocusVerdantButton = document.createElement('button');
        debugFocusVerdantButton.textContent = 'System View'; // Initial text
        debugFocusVerdantButton.style.position = 'absolute';
        debugFocusVerdantButton.style.bottom = '130px'; // Stacked above fill resources
        debugFocusVerdantButton.style.right = '10px';
        debugFocusVerdantButton.style.fontFamily = 'Helvetica, Arial, sans-serif';
        debugFocusVerdantButton.addEventListener('click', handleFocusToggleClick);
        document.body.appendChild(debugFocusVerdantButton);
        // -----------------------------------------------------

        // --- NEW: Create Enemy Status UI ---
        enemyStatusElement = document.createElement('div');
        enemyStatusElement.id = 'enemy-status';
        enemyStatusElement.style.position = 'absolute';
        enemyStatusElement.style.right = '10px'; // Add right
        enemyStatusElement.style.bottom = '10px'; // Add bottom (placing it below debug buttons/boost meter if they were there)
        enemyStatusElement.style.zIndex = '100'; // Ensure consistent z-index
        enemyStatusElement.style.fontFamily = 'Helvetica, Arial, sans-serif'; // Style consistency
        enemyStatusElement.style.fontSize = '12px'; // Style consistency
        enemyStatusElement.style.color = 'white'; // Style consistency
        enemyStatusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; // Style consistency
        enemyStatusElement.style.padding = '5px'; // Style consistency
        enemyStatusElement.style.borderRadius = '3px'; // Style consistency
        enemyStatusElement.textContent = 'Enemy: Initializing'; // Initial text
        document.body.appendChild(enemyStatusElement);
        // --------------------------

        // --- NEW: Create Planet Tooltip Element ---
        planetTooltipElement = document.createElement('div');
        planetTooltipElement.id = 'planet-tooltip';
        planetTooltipElement.style.position = 'absolute';
        planetTooltipElement.style.display = 'none'; // Start hidden
        planetTooltipElement.style.padding = '8px 12px';
        planetTooltipElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        planetTooltipElement.style.color = 'white';
        planetTooltipElement.style.borderRadius = '4px';
        planetTooltipElement.style.border = '1px solid #555';
        planetTooltipElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
        planetTooltipElement.style.fontSize = '12px';
        planetTooltipElement.style.whiteSpace = 'pre'; // Use preformatted text for newlines
        planetTooltipElement.style.pointerEvents = 'none'; // Prevent tooltip from blocking mouse events
        planetTooltipElement.style.zIndex = '110'; // Above other UI
        document.body.appendChild(planetTooltipElement);
        // ----------------------------------------

        // --- NEW: Create CSS Outline Element ---
        planetOutlineElement = document.createElement('div');
        planetOutlineElement.id = 'planet-outline';
        planetOutlineElement.style.position = 'absolute';
        planetOutlineElement.style.display = 'none'; // Start hidden
        planetOutlineElement.style.border = '2px solid white'; // White border
        planetOutlineElement.style.borderRadius = '50%'; // Make it circular
        planetOutlineElement.style.pointerEvents = 'none'; // Prevent blocking mouse
        planetOutlineElement.style.zIndex = '109'; // Just below tooltip
        planetOutlineElement.style.boxSizing = 'border-box'; // Include border in size
        document.body.appendChild(planetOutlineElement);
        // -------------------------------------

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

        // --- Start Initial Music (REMOVED DELAY) --- 
        // console.log("Main INIT: Attempting to play initial music with a delay..."); // Remove log
        // setTimeout(() => {
        //     console.log("Main INIT: Delay complete, calling playAppropriateMusic.");
        //     playAppropriateMusic(false); 
        // }, 500); // Delay by 500ms (0.5 seconds)
        playAppropriateMusic(false); // <<< Call directly after init completes
        console.log("Main INIT: Called playAppropriateMusic for initial theme."); // Add confirmation log
        // -------------------------------------------------

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

    // --- NEW: Update Enemy Dot ---
    if (mapEnemy && enemyState?.mesh) { // Check if map dot and enemy mesh exist
        enemyState.mesh.getWorldPosition(_mapEnemyWorldPos); // Get enemy world position
        _mapTargetPos.subVectors(_mapEnemyWorldPos, _mapHomePlanetWorldPos).normalize().multiplyScalar(MAP_PLANET_RADIUS);
        mapEnemy.position.copy(_mapTargetPos);
        // Show dot only if enemy mesh is actually visible in the main scene
        mapEnemy.visible = enemyState.mesh.visible;
    } else if (mapEnemy) {
        mapEnemy.visible = false; // Hide if enemy state/mesh isn't ready
    }
    // -----------------------------

    // --- NEW: Update Map Path Trail ---
    if (mapPathTrail && pathPoints) {
        // --- Ensure planet matrix and position are up-to-date --- 
        homePlanet.updateMatrixWorld(); // Force update world matrix
        homePlanet.getWorldPosition(_mapHomePlanetWorldPos); // Get CURRENT world position
        // -------------------------------------------------------

        // --- DEBUG LOGGING ---
       // console.log(`[Map Path Debug] pathPoints.length: ${pathPoints.length}`);
        // ---------------------

        // --- Calculate drawable segments and starting index --- 
        const numAvailablePoints = pathPoints.length;
        const maxDrawableVertices = Math.min(numAvailablePoints, config.MAX_PATH_POINTS); // How many vertices fit in config
        const numDrawableSegments = Math.floor(maxDrawableVertices / 2);
        const startIndexInPathPoints = Math.max(0, numAvailablePoints - numDrawableSegments * 2); // Index in pathPoints to start reading from
        const numMapVerticesToDraw = numDrawableSegments * 2; // Vertices to actually draw in the map buffer
        // -----------------------------------------------------

        // --- DEBUG LOGGING ---
        //console.log(`[Map Path Debug] numDrawableSegments: ${numDrawableSegments}, startIndexInPathPoints: ${startIndexInPathPoints}, numMapVerticesToDraw: ${numMapVerticesToDraw}`);
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
                //console.warn(`[Map Path Debug] Index out of bounds: p1=${p1_index}, p2=${p2_index}, length=${pathPoints.length}`);
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
                //console.log(`[Map Path Debug] First segment drawn: p1_map(${_mapTargetPos.x.toFixed(1)}, ${_mapTargetPos.y.toFixed(1)}, ${_mapTargetPos.z.toFixed(1)}) (reading from pathPoints index ${p1_index})`);
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
            //console.log("[Map Path Debug] Clearing map path trail.");
        }
        // ------------------------------
    }
    // -------------------------------
}
// -------------------------------------

function animate() {
    if (isGameOver) return; // <<< Stop updates if Game Over

    // Request next frame AFTER game over check
    requestAnimationFrame(animate); 
    stats.begin(); // START FPS counter AFTER game over check

    const deltaTime = clock.getDelta();
    const now = performance.now(); // performance.now() for general timing
    const audioNow = audioListener?.context?.currentTime ?? 0; // Web Audio time for audio scheduling


    // --- Update Filter Transition --- 
    if (isFilterTransitioning && globalLowPassFilter && audioNow > 0) {
        const elapsed = audioNow - filterTransitionStartTime;
        let progress = Math.min(elapsed / FILTER_TRANSITION_DURATION, 1.0);
        
        // Optional: Add easing function (e.g., ease-in-out)
        // progress = 0.5 - 0.5 * Math.cos(progress * Math.PI); 

        const currentFreq = filterStartFrequency + (filterTargetFrequency - filterStartFrequency) * progress;
        globalLowPassFilter.frequency.value = currentFreq; // Set value directly

        if (progress >= 1.0) {
            isFilterTransitioning = false;
            console.log(`Audio Filter: Transition finished at ${currentFreq.toFixed(0)}Hz`);
        }
    }
    // ------------------------------

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

    // --- NEW: Update Enemy ---
    if (enemyState && enemyState.isInitialized) {
        // <<< Pass player velocity to enemy >>>
        const playerVelocity = window.playerState ? window.playerState.velocity : new THREE.Vector3();
        updateEnemy(deltaTime, window.playerState?.visualMesh, playerVelocity, triggerScreenShake); // <<< Pass triggerScreenShake
    }
    // -----------------

  
    // -------------------------------

    // --- NEW: Handle Fuel Consumption ---
    if (window.playerState && inventory.fuel > 0) {
        const playerState = window.playerState;
        let fuelConsumedThisFrame = 0;
        const speedSq = playerState.velocity.lengthSq();
        const movementThresholdSq = 0.1 * 0.1; // Only consume if moving noticeably

        if (playerState.boostStartTime > 0) {
            // Currently boosting
            fuelConsumedThisFrame = config.FUEL_CONSUMPTION_PER_SECOND_BOOST * deltaTime;
        } else if (speedSq > movementThresholdSq) {
            // Moving normally
            fuelConsumedThisFrame = config.FUEL_CONSUMPTION_PER_SECOND_MOVE * deltaTime;
        }

        if (fuelConsumedThisFrame > 0) {
            inventory.fuel -= fuelConsumedThisFrame;
            inventory.fuel = Math.max(0, inventory.fuel); // Clamp fuel to minimum 0
            // UI will be updated later in the loop
        }
    }
    // --- END NEW Fuel Consumption ---

    // --- Update Purple Planet Animation (if exists) ---
    const verdantPlanetGroup = planetsState['Verdant Minor']?.mesh;
    if (verdantPlanetGroup?.userData?.mixer) {
        verdantPlanetGroup.userData.mixer.update(deltaTime);
    }
    // --------------------------------------------------

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
                // <<< ADD Log before lerp >>>
                console.log(`   Original: #${planetData.originalColor.getHexString()}, Current: #${planetData.mesh.material.color.getHexString()}, Target: #${_tempColor.setHex(targetColor).getHexString()}`);
                // <<< END Log >>>
                planetData.mesh.material.color.lerpColors(planetData.originalColor, _tempColor.setHex(targetColor), alpha);
                
                if (alpha >= 1.0) {
                    console.log(`ColorLerp: Terraforming COMPLETE for ${planetName}.`); // <<< ADD LOG
                    isTerraforming[planetName] = false;
                    terraformStartTime[planetName] = null; // Reset start time
                    isCameraInTerraformPosition = false; // <<< ADD: Reset flag

                    // Trigger success UI/sound
                    if (missionStatusElement) {
                        missionStatusElement.textContent = `${planetName} Terraformed!`;
                        missionStatusElement.style.display = 'block';
                        // Fade out after a delay
                        setTimeout(() => { missionStatusElement.style.display = 'none'; }, 3000);
                    }
                    // playTerraformSuccessSound(); // <<< COMMENT OUT Sound Call Here

                    // <<< ADD LOG: Releasing camera focus
                    console.log(`ColorLerp: Releasing camera focus from ${planetName}.`);
                    cameraFocusTarget = null;
                    isCameraFocusingPlanet = false;
                    
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
        // --- NEW: Stop effects if launch failed ---
        if (!launchSuccess) {
            stopRocketEffects();
        }
        // -------------------------------------------
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
                                 // --- Play launch sound & START effects --- 
                                 spacebarPressCount++; // Increment counter
                                 console.log(`SOUND TRIGGER: Spacebar press #${spacebarPressCount}`); // Log count
                                 playRocketLaunchSound(); 
                                 startRocketEffects(); // <<< START EFFECTS HERE
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
        } else { // Player NOT near pad
            // --- NEW: Cancel pending launch if player moves away ---
            if (isLaunchPending) {
                console.log("Player moved away during launch countdown. Cancelling launch.");
                isLaunchPending = false;
                pendingLaunchTarget = null;
                pendingLaunchPayload = 0;
                pendingLaunchFuelCost = 0;
                stopRocketEffects(); // <<< STOP EFFECTS HERE
            }
            // ------------------------------------------------------
        }
    }

    // Update Launch Prompt Visibility
    if (launchPromptElement) {
        launchPromptElement.style.display = showLaunchPrompt ? 'block' : 'none';
    }

    // --- Update Camera ---
    if (isCameraFocusingPlanet && cameraFocusTarget) { // Terraform focus takes priority
        // --- Direct Camera Control for Planet Focus ---
        cameraFocusTarget.getWorldPosition(_planetFocusWorldPos); 
        _desiredCamPos.addVectors(_planetFocusWorldPos, terraformViewOffset); 
        // <<< REMOVE Logs for Desired Position >>>
        // console.log(`[Focus Cam] PlanetPos: ...`); 
        // console.log(`[Focus Cam] Offset: ...`); 
        // console.log(`[Focus Cam] TargetPos:...`); 
        // const camPosBefore = camera.position.clone(); 
        camera.position.lerp(_desiredCamPos, config.CAMERA_SMOOTH_FACTOR * 0.5); // <<< REVERTED Lerp Factor AGAIN
        // console.log(`[Focus Cam] CamPos Before Lerp: ...`); 
        // console.log(`[Focus Cam] CamPos After Lerp:  ...`); 
        // <<< END REMOVE Logs >>>
        camera.lookAt(_planetFocusWorldPos);

        // --- Check if camera is in position to start terraform ---
        const distSq = camera.position.distanceToSquared(_desiredCamPos);
        const arrivalThresholdSq = 50000.0; // <<< INCREASED Threshold SIGNIFICANTLY
        // Log distance check (Uncommented for debugging)
        console.log(`CameraFocus: distSq = ${distSq.toFixed(2)}, thresholdSq = ${arrivalThresholdSq}`); 
        
        if (!isCameraInTerraformPosition && distSq < arrivalThresholdSq) { 
             console.log(`CameraFocus: Camera arrived at focus point (distSq: ${distSq.toFixed(2)}).`); 
             isCameraInTerraformPosition = true;
             // --- Play Terraform Success Sound ON CAMERA ARRIVAL --- 
             playTerraformSuccessSound(); // <<< UNCOMMENT Call Here AGAIN
             // -----------------------------------------------------
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

    } else if (isDebugCameraActive) { // NEW: Check for top-down debug view
        const systemCenter = _vec3.set(0, 0, 0); // Use temp vector for center
        const desiredPosition = _desiredCamPos.set(0, 1500, 0); // Y-up, far above

        // Smoothly move camera to desired position
        camera.position.lerp(desiredPosition, config.CAMERA_SMOOTH_FACTOR * 0.5); // Slower lerp for system view
        
        // Aim camera down at the center
        camera.lookAt(systemCenter);
        
        // Explicitly set UP direction to avoid issues when looking straight down
        // Use negative Z as UP for a typical top-down view (X right, Z up)
        camera.up.set(0, 0, -1); 

        // --- Raycasting for Planet Hover ---
        raycaster.setFromCamera( mouse, camera );
        const intersects = raycaster.intersectObjects( intersectablePlanets, true ); // Check descendants

        let currentIntersectedGroup = null;
        if (intersects.length > 0) {
            // Find the closest intersected planet GROUP
            for(const intersect of intersects) {
                let obj = intersect.object;
                while (obj.parent && !(intersectablePlanets.includes(obj))) {
                    obj = obj.parent;
                }
                if (intersectablePlanets.includes(obj)) {
                    currentIntersectedGroup = obj;
                    break;
                }
            }
        }

        // --- Handle Hover State Change ---
        if (currentIntersectedGroup) {
            if (hoveredPlanet?.mesh !== currentIntersectedGroup) {
                // --- New Hover Start ---
                hoveredPlanet = { 
                    mesh: currentIntersectedGroup,
                    name: currentIntersectedGroup.name 
                };
                // Update Tooltip Text (only needs to happen once on hover start)
                const planetData = planetsState[hoveredPlanet.name];
                if (planetData && planetTooltipElement) {
                    planetTooltipElement.textContent = 
                        `${hoveredPlanet.name}\nSeeds: ${planetData.seedsDelivered} / ${planetData.seedsRequired}`;
                }
            }
            // --- ELSE: Still hovering the same planet ---
            
        } else { // No intersection this frame
            if ( hoveredPlanet !== null ) {
                // --- Hover End ---
                hoveredPlanet = null;
                if (planetTooltipElement) planetTooltipElement.style.display = 'none'; 
                if (planetOutlineElement) planetOutlineElement.style.display = 'none';
            }
        }
        // --- End Hover State Change ---
        
        // --- Update Outline and Tooltip Position (if hovering) ---
        if (hoveredPlanet && planetOutlineElement && planetTooltipElement) {
            const planetCenterWorld = _vec3.copy(hoveredPlanet.mesh.position); // Use the group's position
            let planetRadiusWorld = 25; // Default guess
            // Get radius from config if possible
            if (planetsState[hoveredPlanet.name]?.config?.radius) {
                planetRadiusWorld = planetsState[hoveredPlanet.name].config.radius;
            } else if (hoveredPlanet.mesh.geometry?.parameters?.radius) {
                 // Fallback for sphere meshes (though Verdant Minor is group)
                 planetRadiusWorld = hoveredPlanet.mesh.geometry.parameters.radius;
            }

            // Project center and edge points along X-axis to find screen diameter
            const centerScreen = planetCenterWorld.clone().project(camera);
            const edgeWorldX = planetCenterWorld.clone().add(new THREE.Vector3(planetRadiusWorld, 0, 0));
            const edgeScreenX = edgeWorldX.clone().project(camera);
            
            // Calculate screen radius based on X distance
            const screenRadius = Math.abs(edgeScreenX.x - centerScreen.x) * (window.innerWidth / 2);
            const screenDiameter = screenRadius * 2;

            // Calculate screen position of center
            const screenX = (centerScreen.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-centerScreen.y * 0.5 + 0.5) * window.innerHeight;

            // Style and position the outline div
            planetOutlineElement.style.width = `${screenDiameter}px`;
            planetOutlineElement.style.height = `${screenDiameter}px`;
            planetOutlineElement.style.left = `${screenX - screenRadius}px`;
            planetOutlineElement.style.top = `${screenY - screenRadius}px`;
            planetOutlineElement.style.display = 'block';
            
            // Position Tooltip
            planetTooltipElement.style.left = `${screenX + 15}px`; 
            planetTooltipElement.style.top = `${screenY - 15}px`; 
            planetTooltipElement.style.display = 'block';
        }
        // --- End Update Outline/Tooltip ---

        // --- End Raycasting Logic Block ---

    } else if (isRocketActive()) { // Default rocket following
        updateCamera(camera, rocketMesh, homePlanet); 
    } else { // Default player following
        // Make sure playerState.mesh exists before calling updateCamera
        if (window.playerState?.mesh) {
        updateCamera(camera, window.playerState.mesh, homePlanet);
        } else {
            // Optional: Handle camera position if player isn't ready (e.g., fixed view)
        }
    }

    // --- Update UI --- (Moved together)
    updateInventoryDisplay();
    updateBoostMeterUI(); // Call boost meter update

    // Update Enemy Status UI (Added directly)
    if (enemyStatusElement && typeof enemyState !== 'undefined' && enemyState?.statusText) { enemyStatusElement.textContent = `Enemy: ${enemyState.statusText}`; }

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

    // --- Apply Screen Shake BEFORE camera update ---
    if (shakeTimer > 0) {
        const decayFactor = shakeTimer / shakeDuration; // Linear decay
        const currentIntensity = shakeIntensity * decayFactor;
        
        // Generate random offsets
        const offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
        const offsetY = (Math.random() - 0.5) * 2 * currentIntensity;

        // Apply offset relative to camera's current orientation
        // Ensure camera's matrixWorld is up-to-date
        camera.updateMatrixWorld(); 
        const cameraRight = _vec3.setFromMatrixColumn(camera.matrixWorld, 0);
        const cameraUp = _vector3_2.setFromMatrixColumn(camera.matrixWorld, 1);
        
        camera.position.addScaledVector(cameraRight, offsetX);
        camera.position.addScaledVector(cameraUp, offsetY);

        shakeTimer -= deltaTime;
        if (shakeTimer <= 0) {
            shakeTimer = 0;
            shakeIntensity = 0;
            shakeDuration = 0;
            console.log("[Screen Shake] Finished.");
            // No need to reset position if offsets were relative
        }
    }
    // ---------------------------------------------

    // Update camera position and orientation
    // <<< ADD Conditional Execution for Default Camera Update >>>
    if (!isCameraFocusingPlanet) { // Only update default if NOT focusing planet
        updateCamera(camera, window.playerState?.visualMesh, cameraFocusTarget, isCameraFocusingPlanet, deltaTime);
    }
    // <<< END Conditional >>>

    // --- Apply Screen Shake AFTER camera update ---
    if (shakeTimer > 0) {
        const decayFactor = shakeTimer / shakeDuration; // Linear decay
        const currentIntensity = shakeIntensity * decayFactor;
        
        // Generate random offsets
        const offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
        const offsetY = (Math.random() - 0.5) * 2 * currentIntensity;

        // Apply offset relative to camera's current orientation
        // Ensure camera's matrixWorld is up-to-date
        camera.updateMatrixWorld(); 
        const cameraRight = _vec3.setFromMatrixColumn(camera.matrixWorld, 0);
        const cameraUp = _vector3_2.setFromMatrixColumn(camera.matrixWorld, 1);
        
        camera.position.addScaledVector(cameraRight, offsetX);
        camera.position.addScaledVector(cameraUp, offsetY);

        shakeTimer -= deltaTime;
        if (shakeTimer <= 0) {
            shakeTimer = 0;
            shakeIntensity = 0;
            shakeDuration = 0;
            console.log("[Screen Shake] Finished.");
            // No need to reset position if offsets were relative
        }
    }
    // ---------------------------------------------

    // --- Update Hit Cooldown Timer ---
    if (playerHitCooldownTimer > 0) {
        playerHitCooldownTimer -= deltaTime;
        playerHitCooldownTimer = Math.max(0, playerHitCooldownTimer); // Clamp to 0
    }
    // -------------------------------

    // --- NEW: Collision Detection (Updated for Health) ---
    // <<< ADD Check: Only check collision if enemy is NOT sleeping >>>
    if (playerHitCooldownTimer <= 0 && window.playerState?.visualMesh && enemyState?.mesh && enemyState?.currentState !== 'SLEEPING') { // Check cooldown AND enemy state
        if (checkCollision(
            window.playerState.visualMesh,
            config.PLAYER_RADIUS,
            enemyState.mesh,
            config.ENEMY_RADIUS
        )) {
            console.log(`COLLISION! Health decreasing from ${window.playerState.health}. Cooldown timer: ${playerHitCooldownTimer.toFixed(2)}`); // <<< ADD Log health BEFORE decrement
            window.playerState.health--; // <<< Use window.playerState.health
            updatePlayerHealthUI();
            playerHitCooldownTimer = PLAYER_HIT_COOLDOWN_DURATION; // Start cooldown
            console.log(`Cooldown started. New timer value: ${playerHitCooldownTimer.toFixed(2)}`); // <<< ADD Log cooldown start

            // --- Trigger Red Flash --- <<< NEW
            if (damageOverlayElement) {
                damageOverlayElement.classList.add('visible');
                // Set timeout to remove the class after a short duration
                setTimeout(() => {
                    // Ensure the element still exists before removing class
                    if (damageOverlayElement) {
                         damageOverlayElement.classList.remove('visible');
                    }
                }, 200); // 200ms flash duration
            }
            // -------------------------

            // Play collision sound
            if (window.loadedSounds?.playerCollideSound) {
                if (window.loadedSounds.playerCollideSound.isPlaying) window.loadedSounds.playerCollideSound.stop();
                window.loadedSounds.playerCollideSound.play();
            }

            // Check if health dropped to 0 or below
            if (window.playerState.health <= 0) { // <<< Use window.playerState.health
                // --- GAME OVER --- 
                console.log("GAME OVER - Health Depleted!");
                isGameOver = true;

                // <<< Trigger Audio Filter Low Pass >>>
                if (audioListener?.context && globalLowPassFilter) {
                    const audioCtx = audioListener.context;
                    const targetFrequency = 300; // Low frequency for muffled effect
                    const now = audioCtx.currentTime;
                    const endTime = now + FILTER_TRANSITION_DURATION; 
                    try {
                        const currentFrequency = globalLowPassFilter.frequency.value;
                        globalLowPassFilter.frequency.cancelScheduledValues(now);
                        globalLowPassFilter.frequency.setValueAtTime(currentFrequency, now);
                        globalLowPassFilter.frequency.exponentialRampToValueAtTime(targetFrequency, endTime);
                        console.log(`[Game Over Filter] Starting EXPONENTIAL ramp to ${targetFrequency}Hz`);
                    } catch (e) {
                        console.error("Error scheduling game over filter ramp:", e);
                        globalLowPassFilter.frequency.setValueAtTime(targetFrequency, now); // Fallback
                    }
                } else {
                    console.warn("Cannot apply game over filter: Audio context or filter node missing.");
                }
                // <<< End Audio Filter >>>

                // Play Game Over Sound
                if (window.loadedSounds?.gameOverSound) {
                    if (window.loadedSounds.gameOverSound.isPlaying) window.loadedSounds.gameOverSound.stop();
                    window.loadedSounds.gameOverSound.play();
                }

                // Show Overlay
                console.log("Checking gameOverOverlayElement:", gameOverOverlayElement); // Debug log
                if (gameOverOverlayElement) {
                    gameOverOverlayElement.style.display = 'flex'; // Or 'block'
                } else {
                    console.error("Game Over Overlay Element not found!");
                }

                triggerScreenShake(1.0, 2.0); // Game over shake

                // Stop Music/Other Sounds
                playAppropriateMusic(null); // Attempt to stop music
                // TODO: Stop enemy sounds
                // TODO: Stop player sounds
                
                // No return needed here, loop will stop on next frame check

                // <<< Add Key Listener for Restart >>>
                console.log("Adding key listener for game restart.");
                document.addEventListener('keydown', handleGameOverKeyPress, { once: true });
                // <<< End Add Key Listener >>>

            } else {
                // --- Just Took Damage (Not Game Over) ---
                console.log(`Damage taken. Remaining health: ${window.playerState.health}`); // <<< Use window.playerState.health
                triggerScreenShake(0.4, 1.2); // Shorter/less intense shake for taking damage
            }
        }
    }
    // -----------------------------------------------------
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

// --- Collision Check Helper ---
function checkCollision(mesh1, radius1, mesh2, radius2) {
    if (!mesh1 || !mesh2) return false;
    const pos1 = _vec3.setFromMatrixPosition(mesh1.matrixWorld);
    const pos2 = _vector3_2.setFromMatrixPosition(mesh2.matrixWorld);
    const distanceSq = pos1.distanceToSquared(pos2);
    const radiiSumSq = (radius1 + radius2) * (radius1 + radius2);
    return distanceSq < radiiSumSq;
}
// -----------------------------

// --- Screen Shake Trigger ---
function triggerScreenShake(duration, intensity) {
    console.log(`[Screen Shake] Triggered - Duration: ${duration}, Intensity: ${intensity}`);
    shakeDuration = duration;
    shakeIntensity = intensity;
    shakeTimer = duration; // Start the timer
}
// -------------------------

// --- NEW: Player Health UI Update ---
function updatePlayerHealthUI() {
    // Get the new elements
    const healthFillElement = document.getElementById('player-health-fill');
    const healthTextElement = document.getElementById('player-health-text');
    
    // <<< REMOVE Redundant Debug Log >>>
    // console.log(`[updatePlayerHealthUI] Check values: window.playerState.health = ${window.playerState?.health}, config.PLAYER_MAX_HEALTH = ${config?.PLAYER_MAX_HEALTH}`);
    
    // Ensure playerState and elements exist
    // <<< ADD check for playerState.maxHealth >>>
    if (window.playerState && typeof window.playerState.health === 'number' && typeof window.playerState.maxHealth === 'number' && healthFillElement && healthTextElement) {
        const currentHealth = window.playerState.health;
        const maxHealth = window.playerState.maxHealth; // <<< READ from playerState
        
        // Prevent division by zero and ensure health is not negative
        const clampedHealth = Math.max(0, currentHealth);
        const healthPercent = (maxHealth > 0) ? (clampedHealth / maxHealth) * 100 : 0;
        
        // Update the fill bar width
        healthFillElement.style.width = `${Math.min(healthPercent, 100)}%`;
        
        // Update the text overlay
        healthTextElement.textContent = `Health: ${clampedHealth} / ${maxHealth}`;
        
        // Optional: Change bar color based on health? (e.g., red when low)
        if (healthPercent < 35) {
            healthFillElement.style.backgroundColor = '#ff4444'; // Red when low
        } else if (healthPercent < 70) {
            healthFillElement.style.backgroundColor = '#ffcc44'; // Yellow when medium
        } else {
            healthFillElement.style.backgroundColor = '#44aaff'; // Blue when high
        }
        
    } else {
        // Log error or hide element if data is missing
        if (healthTextElement) {
             healthTextElement.textContent = 'Health: N/A';
        }
         if (healthFillElement) {
             healthFillElement.style.width = '0%';
        }
         console.warn("updatePlayerHealthUI: playerState, health, maxHealth, or health elements not available."); // Updated warning
    }
}
// ----------------------------------

// --- NEW: Game Over Restart Handler ---
function handleGameOverKeyPress() {
    console.log("Game Over key press detected. Reloading game...");
    window.location.reload(); 
}
// -------------------------------------