import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { getRandomPositionOnPlanet, isTooCloseToOtherGems } from './utils.js';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

// Store references passed from main.js
let sceneRef = null;
let homePlanetRef = null;
let planetsStateRef = null;
let audioListenerRef = null;

// Module-level variables for resources and inventory
let seedGems = [];
let fuelItems = [];
export let inventory = {
    seeds: config.INITIAL_SEEDS,
    fuel: config.INITIAL_FUEL
};

// --- NEW: Prototype for fuel model ---
let fuelModelProto = null;
// --- NEW: Prototype for seed model ---
let seedModelProto = null;
// --- NEW: Prototype for mossy log model ---
let mossyLogModelProto = null;
// --- NEW: Prototype for purple tree model ---
let purpleTreeModelProto = null;
// --- NEW: Prototype for Tech Aperture model ---
let techApertureModelProto = null;
let techApertureModelAnimations = []; // Initialize as empty array

// --- NEW: Model Loading Promises ---
let seedModelLoadPromise = null;
let mossyLogModelLoadPromise = null;
let fuelModelLoadPromise = null;
let techApertureModelLoadPromise = null;

// --- NEW: List to store animated decorative items ---
let animatedDecorItems = [];

// --- Audio Variables ---
let pickupSound = null;
// let soundSegments = config.pickupSoundSegments; // REMOVED For seeds
// let lastSegmentIndex = -1; // REMOVED
let rocketLaunchSound = null;
let impactSound = null;
let rollingSound = null;
let ambientSound = null;
let fuelPickupSound1 = null; // Sound for fuel pickup
// let seedAccentSound = null; // REMOVED: Additional sound for seed pickup
let boostBurstSound = null; // NEW
let boostRiseSound = null;  // NEW
let palMovementSound = null; // NEW: For the pal
let palArrivalSound = null; // NEW: For pal arrival
let playerJumpSound = null; // NEW: For player jump
let playerLandSound = null; // NEW: For player landing
let inventoryFullSound = null; // NEW: For inventory full
let terraformReadySound = null; // NEW: For terraform ready
let terraformSuccessSound = null; // NEW: For terraform success
let themeMusicSound = null; // <<< USE THIS NAME
let slowdownSound = null; // NEW: For fuel depletion slowdown
let slowdownSoundPlayStartTime = 0; // NEW: Track playback start time
let slowdownFadeRafId = null; // NEW: Track requestAnimationFrame ID

// --- NEW: Enemy Movement Sound ---
let enemyMovementSound = null;
// --- NEW: Enemy Scanning Sound ---
let enemyScanningSound = null;
// --- NEW: Enemy Roar Sound (Non-Looping) ---
let enemyRoarSound = null;
// --- NEW: Alarm Siren Sound (Non-Looping) ---
let alarmSirenSound = null;
// --- NEW: Danger Theme (Looping) ---
let dangerMusicSound = null; // <<< USE THIS NAME
// --- ADD Missing Declarations ---
let nodeDeactivationSound = null;
let nodeSpawnLoopSound = null;
let nodeProximityLoopSound = null;
let singleNodeActivationSound = null;
let playerCollideSound = null;
let gameOverSound = null;
let sunImpactSound = null; // NEW: Sound for sun collision
// --------------------------------

// --- NEW: Music Volumes & Fade --- 
const THEME_MUSIC_VOLUME = 0.3;
const DANGER_THEME_VOLUME = 0.3; 
// const MUSIC_CROSSFADE_DURATION = 1.5; // seconds // <<< OLD
const MUSIC_ANTICIPATION_FADE_DURATION = 8.0; // seconds <<< Reverted from 8.0 test value
// --------------------------------

// --- Cooldown Tracking ---
// let lastPalArrivalSoundTime = 0; // <<< REMOVE THIS LINE

// Array to track collected seeds for regeneration
const collectedSeedsQueue = [];
const collectedFuelQueue = []; // Add queue for fuel regeneration

// Temporary vectors
const _tempMatrix = new THREE.Matrix4();
const _gemWorldPos = new THREE.Vector3();
const _homePlanetWorldPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();

// --- Fuel Particle Effect --- (Define before use)
const activeFuelParticles = [];
// DEBUG: Increase size
const particleGeometry = new THREE.BoxGeometry(1.0, 1.0, 1.0); // Larger cubes
// DEBUG: Simplify material
const particleMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000, // Bright Red (Changed from green)
    emissive: 0x000000, // No emission for debug
    // emissiveIntensity: 1.5,
    transparent: false, // No transparency for debug
    opacity: 1.0
});
// DEBUG: Increase lifetime
const PARTICLE_LIFETIME = 0.5; // seconds (was 0.6)
const PARTICLE_COUNT = 8;
const PARTICLE_SPEED = 10.0; // Increased from 2.0

function spawnFuelParticles(originLocalPosition) {
    console.log("[ParticleDebug] Spawning fuel particles at:", originLocalPosition);
    
    // Get the world position and normal at the spawn point
    const worldPosition = homePlanetRef.localToWorld(originLocalPosition.clone());
    const worldNormal = originLocalPosition.clone().normalize();
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone()); // Clone material for independent opacity
        particle.position.copy(originLocalPosition);

        // Calculate velocity in world space
        const randomDirection = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize();
        
        // Project velocity onto tangent plane of the planet
        const tangentVelocity = randomDirection.sub(
            worldNormal.clone().multiplyScalar(randomDirection.dot(worldNormal))
        ).normalize();
        
        // Scale to desired speed
        const velocity = tangentVelocity.multiplyScalar(PARTICLE_SPEED);

        // --- NaN Check ---
        if (isNaN(velocity.x) || isNaN(velocity.y) || isNaN(velocity.z)) {
            console.error("[ParticleDebug Spawn Error] Calculated NaN velocity! Initial random vector likely near zero. Assigning default velocity.");
            velocity.set(0, PARTICLE_SPEED, 0); // Default upward velocity
        }
        // -----------------

        homePlanetRef.add(particle); // Add particle to the planet
        activeFuelParticles.push({
            mesh: particle,
            velocity: velocity,
            spawnTime: performance.now() / 1000
        });
    }
}

function updateFuelParticles(deltaTime) {
    const now = performance.now() / 1000;
    const particlesToRemove = [];

    // DEBUG: Flag to log only the first particle of the most recent spawn batch
    let loggedFirstParticle = false; 

    for (let i = activeFuelParticles.length - 1; i >= 0; i--) {
        const pData = activeFuelParticles[i];
        const age = now - pData.spawnTime;

        // DEBUG: Log state of the first particle in the list (likely the most recent)
        if (i === activeFuelParticles.length - 1 && !loggedFirstParticle) {
             console.log(`[ParticleDebug Update] Particle ${i}: Age=${age.toFixed(2)} Pos=(${pData.mesh.position.x.toFixed(1)}, ${pData.mesh.position.y.toFixed(1)}, ${pData.mesh.position.z.toFixed(1)}) Scale=${pData.mesh.scale.x.toFixed(2)} Opacity=${pData.mesh.material.opacity?.toFixed(2)}`);
             loggedFirstParticle = true; // Log only once per frame for this particle
        }

        if (age > PARTICLE_LIFETIME) {
            particlesToRemove.push(i);
            homePlanetRef.remove(pData.mesh); // Remove from scene
            // Dispose geometry/material only if NOT shared/cloned
            // Since we clone material, dispose it:
             // DEBUG: Don't dispose debug material for now
            // if (pData.mesh.material) pData.mesh.material.dispose();
            // Geometry is shared, don't dispose here unless it's the last particle
        } else {
            // Move particle
            // DEBUG: Log values before position update
            pData.mesh.position.addScaledVector(pData.velocity, deltaTime);
            // Fade out and shrink
            const lifeRatio = age / PARTICLE_LIFETIME;
            const scale = Math.max(0, 1.0 - lifeRatio); // Prevent negative scale
            pData.mesh.scale.set(scale, scale, scale);
            
            // DEBUG: Don't adjust opacity for the debug material
            // if (pData.mesh.material.opacity !== undefined) {
            //     pData.mesh.material.opacity = scale; // Link opacity to scale
            // }
        }
    }

    // Remove dead particles from array
    for (const index of particlesToRemove) {
        activeFuelParticles.splice(index, 1);
    }
}
// --- End Fuel Particle Effect ---

// Create Gem Cube Mesh (Only for Seeds now) - REMOVING THIS FUNCTION
/*
function createCube(size, color, position, gemType) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.8,
        emissive: color,
        emissiveIntensity: 0.6
    });
    const cube = new THREE.Mesh(geometry, material);
    // cube.position.copy(position); // Set position AFTER offset calculation
    cube.gemType = gemType;
    cube.castShadow = true;
    cube.receiveShadow = true; 

    // --- Calculate offset position for seeds ---
    const surfaceNormal = position.clone().normalize();
    const seedVerticalOffset = -0.2; // Embed slightly (adjust as needed)
    const adjustedPosition = position.clone().addScaledVector(surfaceNormal, seedVerticalOffset);
    cube.position.copy(adjustedPosition); // Set final position
    // -----------------------------------------

    // Store original surface position (before offset) for respawning
    cube.originalPosition = position.clone(); 
    return cube;
}
*/

// Generate Visual Resource Items 
function generateVisualResources(count, color, resourceType, resourceArray, homePlanet, planetsState) {
    // Get ALL current visuals for spacing checks
    const allCurrentVisuals = [...seedGems, ...fuelItems]; 
    for (let i = 0; i < count; i++) {
        let position;
        let attempts = 0;
        const maxAttempts = 50;

        do {
            position = getRandomPositionOnPlanet(homePlanet, planetsState);
            attempts++;
        } while (isTooCloseToOtherGems(position, allCurrentVisuals, config.MIN_GEM_DISTANCE) && attempts < maxAttempts);

        if (attempts < maxAttempts) {
            let item;
            // --- Conditional Item Creation ---
            if (resourceType === 'seeds') {
                // --- NEW: Use Seed (Tree) Model ---
                if (!seedModelProto) {
                    console.warn("Seed (Tree) model prototype not loaded yet, cannot generate seed item.");
                    continue; // Skip this item
                }
                item = seedModelProto.clone(true); // Clone the model
                item.gemType = resourceType;

                // Apply scaling
                const treeScale = .5; // Adjust as needed (CHANGED from 0.1)
                item.scale.set(treeScale, treeScale, treeScale);

                // Position and Align
                const surfaceNormal = position.clone().normalize();
                const modelUp = new THREE.Vector3(0, 1, 0); // Assume Y-up for tree model
                const alignmentQuaternion = new THREE.Quaternion();
                alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
                item.quaternion.copy(alignmentQuaternion);

                // Calculate the correct initial height (radius + offset)
                const planetRadius = homePlanetRef.geometry.parameters.radius;
                // Adjust offset - trees likely sit ON the surface or slightly above
                const verticalOffset = 0.1; // Small positive offset to prevent z-fighting
                const finalInitialPos = position.clone().normalize().multiplyScalar(planetRadius + verticalOffset);
                item.position.copy(finalInitialPos);
                item.originalPosition = finalInitialPos.clone(); // Store adjusted position
                // ----------------------------------
            } else if (resourceType === 'fuel') {
                if (!fuelModelProto) {
                    console.warn("Fuel model prototype not loaded yet, cannot generate fuel item.");
                    continue; // Skip this item
                }
                // Clone the PARENT object (which contains the offset child)
                item = fuelModelProto.clone(true); // Use true to clone children deeply
                item.gemType = resourceType;

                // Apply scaling to the PARENT
                const fuelScale = 0.05; 
                item.scale.set(fuelScale, fuelScale, fuelScale);

                // --- Position and Align the PARENT --- 
                const surfaceNormal = position.clone().normalize();
                // Revert to assuming model's default up is Y-axis
                const modelUp = new THREE.Vector3(0, 1, 0); 
                const alignmentQuaternion = new THREE.Quaternion();
                alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
                item.quaternion.copy(alignmentQuaternion);

                // Calculate the correct initial height (radius + offset)
                const planetRadius = homePlanetRef.geometry.parameters.radius;
                const verticalOffset = 1.1; // REDUCED from 3.11
                const targetRadius = planetRadius + verticalOffset;
                const finalInitialPos = position.clone().normalize().multiplyScalar(targetRadius);
                item.position.copy(finalInitialPos); // Set final position for the parent
                // ---------------------------------------------------------------

                // Store the final adjusted position as the original position for respawn
                item.originalPosition = finalInitialPos.clone();

                // --- REMOVE BOUNDING BOX HELPER ---
                /*
                const boxHelper = new THREE.BoxHelper(item, 0x00ff00); // Bright green
                homePlanet.add(boxHelper); // Add helper to the scene, NOT the item itself
                item.userData.boxHelper = boxHelper; // Store reference if needed later for removal/update
                */
                // -------------------------------

            } else {
                 console.warn(`Unknown resource type: ${resourceType}`);
                 continue;
            }
            // --------------------------------
            
            homePlanet.add(item);
            const itemData = { 
                gem: item, 
                type: resourceType,
                seedsToGive: resourceType === 'seeds' ? config.SEEDS_PER_FOREST : 1 // Add seedsToGive property
            }; 
            resourceArray.push(itemData);
            allCurrentVisuals.push(itemData); 

            // --- REMOVE HELPER UPDATE ---
            /* 
            if (item.userData.boxHelper) {
                item.userData.boxHelper.update(); // Update helper to match item's initial state
            }
            */

        } else {
            console.warn(`Could not place a ${resourceType} resource after ${maxAttempts} attempts.`);
        }
    }
}

// NEW: Generate Decorative Items (like logs)
// Add 'animations' parameter
function generateDecorativeItems(count, modelProto, animations, scale, homePlanet, planetsState) {
    const placedPositions = []; // Track positions of items placed in *this* call
    const maxAttemptsPerItem = 50;
    const modelUp = new THREE.Vector3(0, 1, 0); // Assume Y-up for model
    const alignmentQuaternion = new THREE.Quaternion();
    const planetRadius = homePlanet.geometry.parameters.radius;
    // Use same offset as trees for now, adjust if needed
    const verticalOffset = -2.8; // Lowered from 0.1 to embed items slightly

    for (let i = 0; i < count; i++) {
        let position;
        let attempts = 0;
        let positionValid = false;

        do {
            position = getRandomPositionOnPlanet(homePlanet, planetsState);
            attempts++;
            
            // Simplified Collision Check: Check only against other logs placed in this batch
            let tooClose = false;
            for (const placedPos of placedPositions) {
                if (position.distanceToSquared(placedPos) < config.MIN_DECOR_DISTANCE * config.MIN_DECOR_DISTANCE) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                positionValid = true;
            }

        } while (!positionValid && attempts < maxAttemptsPerItem);

        if (positionValid) {
            const item = modelProto.clone(true);
            item.scale.set(scale, scale, scale);

            // --- Animation Setup ---
            // Use the passed 'animations' array instead of modelProto.animations
            if (animations && animations.length > 0) { 
                console.log(`[Animation Debug] Found ${animations.length} animations for decorative item.`); // LOG number of animations
                const mixer = new THREE.AnimationMixer(item);
                // Play the first animation clip by default
                const clip = animations[0]; // Use animations[0]
                console.log(`[Animation Debug] Playing animation clip: ${clip.name}`); // LOG clip name
                const action = mixer.clipAction(clip); // Use clip from animations array
                action.play();
                // Store mixer and action for updates
                item.userData.mixer = mixer;
                item.userData.action = action; 
                animatedDecorItems.push(item); // Add to list for updates
                console.log(`Added animated item: ${item.name || 'unnamed'}`);
            } else {
                console.log("[Animation Debug] Item has no animations."); // UNCOMMENTED log
            }
            // ----------------------

            // Position and Align
            const surfaceNormal = position.clone().normalize();
            alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
            item.quaternion.copy(alignmentQuaternion);

            const finalInitialPos = position.clone().normalize().multiplyScalar(planetRadius + verticalOffset);
            item.position.copy(finalInitialPos);
            
            homePlanet.add(item); // Add directly to the planet scene graph
            
            // --- ADD Bounding Box Helper ---
            // const boxHelper = new THREE.BoxHelper(item, 0xffff00); // Yellow color
            // homePlanet.add(boxHelper); // Add helper to the same parent
            // ---------------------------------

            placedPositions.push(finalInitialPos); // Store the final position for collision checking next items
        } else {
            console.warn(`Could not place a decorative item after ${maxAttemptsPerItem} attempts.`);
        }
    }
    console.log(`Finished generating ${placedPositions.length} / ${count} decorative items.`);
}

// Initialize Resources
function initResources(scene, homePlanet, planetsState, audioListener) {
    console.log("Resources INIT: Initializing...");
    sceneRef = scene;
    homePlanetRef = homePlanet;
    planetsStateRef = planetsState;
    
    // Initialize floating numbers
    initFloatingNumbers();

    // --- Load Seed (Tree) Model Asynchronously ---
    const seedLoader = new GLTFLoader();
    seedModelLoadPromise = new Promise((resolve, reject) => {
    seedLoader.load(
            'models/tree/tree.gltf',
        function (gltf) { // Success callback
            console.log('Seed (Tree) GLTF model loaded.');
            seedModelProto = gltf.scene;

            // Ensure correct material properties if needed (apply to children)
            seedModelProto.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

                resolve(seedModelProto);
        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the seed (tree) GLTF:', error);
                reject(error);
        }
    );
    });

    // --- Load Mossy Log Model Asynchronously ---
    const logLoader = new GLTFLoader();
    mossyLogModelLoadPromise = new Promise((resolve, reject) => {
    logLoader.load(
            'models/mossy_log/mossy_log.gltf',
        function (gltf) { // Success callback
            console.log('Mossy Log GLTF model loaded.');
            mossyLogModelProto = gltf.scene;

            // Ensure correct material properties and shadows
            mossyLogModelProto.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = true;
                }
            });

                resolve(mossyLogModelProto);
        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the mossy log GLTF:', error);
                reject(error);
        }
    );
    });

    // Wait for models to load before generating items
    Promise.all([seedModelLoadPromise, mossyLogModelLoadPromise])
        .then(() => {
            console.log('All required models loaded, generating items...');
            // Generate seeds
            generateVisualResources(config.INITIAL_SEED_GEMS, config.SEED_GEM_COLOR, 'seeds', seedGems, homePlanet, planetsState);
            // Generate decorative logs
            generateDecorativeItems(config.NUM_MOSSY_LOGS, mossyLogModelProto, [], config.MOSSY_LOG_SCALE, homePlanet, planetsState);
        })
        .catch(error => {
            console.error('Error loading models:', error);
        });

    // --- Load Fuel Model Asynchronously ---
    const fuelLoader = new GLTFLoader(); // Use a separate constant name
    fuelModelLoadPromise = new Promise((resolve, reject) => {
    fuelLoader.load(
        'models/red_crystal/scene.gltf',
        function (gltf) { // Success callback
            console.log('Fuel crystal GLTF model loaded.');
            // --- Create Offset Parent Prototype ---
            const loadedModel = gltf.scene;
            fuelModelProto = new THREE.Object3D(); // Create an empty parent
            fuelModelProto.add(loadedModel); // Add the loaded crystal as a child
            
            // Offset the child model DOWNWARD relative to the parent origin
            // Revert to assuming Y is up for the model
            // Set offset to 0 assuming new model origin is at its base
            const modelOffset = -50.4; 
            loadedModel.position.set(0, modelOffset, 0); 
            console.log(`Offsetting crystal model child by ${modelOffset} on Y.`);
            // -------------------------------------
            
            // Ensure correct material properties if needed (apply to children)
            fuelModelProto.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.transparent = true;
                        child.material.opacity = 0.85;
                        child.material.needsUpdate = true;
                    }
                }
            });

            // --- Generate Fuel Items ONLY AFTER model is loaded ---
            console.log('Generating fuel items using loaded crystal model...');
    generateVisualResources(config.INITIAL_FUEL_ITEMS, config.FUEL_ITEM_COLOR, 'fuel', fuelItems, homePlanet, planetsState);
            // ------------------------------------------------------

                resolve(fuelModelProto);
        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the fuel crystal GLTF:', error);
                reject(error);
        }
    );
    });

    // --- Load Tech Aperture (Purple Tree) Model Asynchronously --- // Keep loading, comment generation
    const techApertureLoader = new GLTFLoader(); // Renamed loader variable
    techApertureModelLoadPromise = new Promise((resolve, reject) => {
    techApertureLoader.load(
        'models/tech_aperture/tech_aperture.gltf', // Path remains the same
        function (gltf) { // Success callback
            console.log('Tech Aperture GLTF model loaded.'); // Updated log
            // Store the prototype for later use
            techApertureModelProto = gltf.scene; // <<< Store in a new variable

            // Ensure correct material properties and shadows
            techApertureModelProto.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false; // Disable casting shadows for this model
                    child.receiveShadow = true;
                }
            });

            // Store animations if any (needed for later spawning)
            techApertureModelAnimations = gltf.animations; // <<< Store animations

            // --- Generate Decorative Trees ONLY AFTER model is loaded --- // <<< COMMENT OUT
            // console.log('Generating decorative purple trees...');
            // Pass gltf.animations here!
            // generateDecorativeItems(config.NUM_PURPLE_TREES, purpleTreeModelProto, gltf.animations, config.PURPLE_TREE_SCALE, homePlanet, planetsState);
            // -----------------------------------------------------------

                resolve(techApertureModelProto);
        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the tech aperture GLTF:', error); // Updated log
                reject(error);
        }
    );
    });

    // Wait for models to load before generating items
    Promise.all([fuelModelLoadPromise, techApertureModelLoadPromise])
        .then(() => {
            console.log('All required models loaded, generating items...');
            // Generate seeds
            generateVisualResources(config.INITIAL_SEED_GEMS, config.SEED_GEM_COLOR, 'seeds', seedGems, homePlanet, planetsState);
            // Generate decorative logs
            generateDecorativeItems(config.NUM_MOSSY_LOGS, mossyLogModelProto, [], config.MOSSY_LOG_SCALE, homePlanet, planetsState);
        })
        .catch(error => {
            console.error('Error loading models:', error);
        });

    console.log("Resources INIT: Finished initial setup (model loading is async).");
}

// Create Inventory UI
function createInventoryUI() {
    const inventoryContainer = document.createElement('div');
    inventoryContainer.id = 'inventory-container';
    inventoryContainer.style.position = 'absolute';
    inventoryContainer.style.top = '10px';
    inventoryContainer.style.left = '10px';
    inventoryContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    inventoryContainer.style.padding = '10px';
    inventoryContainer.style.borderRadius = '5px';
    inventoryContainer.style.color = 'white';
    inventoryContainer.style.fontFamily = 'Helvetica, Arial, sans-serif'; 
    inventoryContainer.style.fontSize = '14px'; // Slightly smaller base font for bars
    inventoryContainer.style.zIndex = '100'; 
    inventoryContainer.style.display = 'flex'; // Use flexbox
    inventoryContainer.style.flexDirection = 'column'; // Stack items vertically
    inventoryContainer.style.gap = '8px'; // Add gap between bars

    // --- Seed Bar --- 
    const seedBarContainer = document.createElement('div');
    seedBarContainer.style.position = 'relative'; // For absolute positioning of text/fill
    seedBarContainer.style.width = '150px'; // Match boost bar width
    seedBarContainer.style.height = '20px';
    seedBarContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
    seedBarContainer.style.border = '1px solid #888';
    seedBarContainer.style.borderRadius = '3px';
    seedBarContainer.style.overflow = 'hidden';

    const seedBarFill = document.createElement('div');
    seedBarFill.id = 'seed-bar-fill'; // ID for updating width
    seedBarFill.style.height = '100%';
    seedBarFill.style.backgroundColor = '#00cc44'; // Green for seeds
    seedBarFill.style.borderRadius = '2px'; // Slightly smaller radius for inner bar
    seedBarFill.style.transition = 'width 0.2s ease-out';
    seedBarFill.style.width = '0%'; // Start empty

    const seedsElement = document.createElement('div');
    seedsElement.id = 'inventory-seeds';
    seedsElement.textContent = `Seeds: ${inventory.seeds} / ${config.MAX_SEEDS}`;
    // Style text to overlay the bar
    seedsElement.style.position = 'absolute';
    seedsElement.style.top = '0';
    seedsElement.style.left = '0';
    seedsElement.style.width = '100%';
    seedsElement.style.height = '100%';
    seedsElement.style.display = 'flex';
    seedsElement.style.alignItems = 'center';
    seedsElement.style.justifyContent = 'center';
    seedsElement.style.color = 'white';
    seedsElement.style.textShadow = '1px 1px 1px black';
    seedsElement.style.zIndex = '1'; // Ensure text is above fill

    seedBarContainer.appendChild(seedBarFill);
    seedBarContainer.appendChild(seedsElement); 
    // ----------------

    // --- Fuel Bar --- 
    const fuelBarContainer = document.createElement('div');
    fuelBarContainer.style.position = 'relative';
    fuelBarContainer.style.width = '150px';
    fuelBarContainer.style.height = '20px';
    fuelBarContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
    fuelBarContainer.style.border = '1px solid #888';
    fuelBarContainer.style.borderRadius = '3px';
    fuelBarContainer.style.overflow = 'hidden';

    const fuelBarFill = document.createElement('div');
    fuelBarFill.id = 'fuel-bar-fill'; // ID for updating width
    fuelBarFill.style.height = '100%';
    fuelBarFill.style.backgroundColor = '#dd4400'; // Red/Orange for fuel
    fuelBarFill.style.borderRadius = '2px';
    fuelBarFill.style.transition = 'width 0.2s ease-out';
    fuelBarFill.style.width = '0%'; // Start empty

    const fuelElement = document.createElement('div');
    fuelElement.id = 'inventory-fuel';
    fuelElement.textContent = `Fuel: ${inventory.fuel.toFixed(0)} / ${config.MAX_FUEL}`;
    // Style text to overlay the bar
    fuelElement.style.position = 'absolute';
    fuelElement.style.top = '0';
    fuelElement.style.left = '0';
    fuelElement.style.width = '100%';
    fuelElement.style.height = '100%';
    fuelElement.style.display = 'flex';
    fuelElement.style.alignItems = 'center';
    fuelElement.style.justifyContent = 'center';
    fuelElement.style.color = 'white';
    fuelElement.style.textShadow = '1px 1px 1px black';
    fuelElement.style.zIndex = '1';

    fuelBarContainer.appendChild(fuelBarFill);
    fuelBarContainer.appendChild(fuelElement);
    // ----------------

    // --- Launch Prompt (Remains the same structure) ---
    const launchPromptElement = document.createElement('div');
    launchPromptElement.id = 'launch-prompt';
    // Removed absolute positioning relative to inventory container, now positioned by flex gap
    // launchPromptElement.style.position = 'absolute'; 
    // launchPromptElement.style.bottom = '-50px'; 
    // launchPromptElement.style.left = '0'; 
    // launchPromptElement.style.width = 'calc(100% + 20px)'; 
    // launchPromptElement.style.marginLeft = '-10px';
    launchPromptElement.style.marginTop = '5px'; // Add some top margin instead
    launchPromptElement.style.padding = '8px';
    launchPromptElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    launchPromptElement.style.border = '1px solid #555';
    launchPromptElement.style.borderRadius = '4px';
    launchPromptElement.style.textAlign = 'center';
    launchPromptElement.style.color = '#ffffff';
    launchPromptElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
    launchPromptElement.style.fontSize = '14px';
    launchPromptElement.style.display = 'none'; // Start hidden
    launchPromptElement.textContent = 'Launch? [L]'; // Placeholder text
    // -------------------------------------------------

    inventoryContainer.appendChild(seedBarContainer); // Add seed bar
    inventoryContainer.appendChild(fuelBarContainer); // Add fuel bar
    inventoryContainer.appendChild(launchPromptElement); // Add prompt to container

    document.body.appendChild(inventoryContainer);
}

// Update Inventory Display including Launch Prompt & Fuel
function updateInventoryDisplay() {
    const seedsElement = document.getElementById('inventory-seeds');
    const fuelElement = document.getElementById('inventory-fuel');
    const launchPromptElement = document.getElementById('launch-prompt');
    // Get fill elements
    const seedBarFill = document.getElementById('seed-bar-fill');
    const fuelBarFill = document.getElementById('fuel-bar-fill');

    if (seedsElement && seedBarFill) {
        seedsElement.textContent = `Seeds: ${inventory.seeds} / ${config.MAX_SEEDS}`;
        // Update seed bar width
        const seedPercent = (inventory.seeds / config.MAX_SEEDS) * 100;
        seedBarFill.style.width = `${Math.max(0, Math.min(100, seedPercent))}%`;
    }
    if (fuelElement && fuelBarFill) {
        fuelElement.textContent = `Fuel: ${Math.floor(inventory.fuel)} / ${config.MAX_FUEL}`;
        // Update fuel bar width
        const fuelPercent = (inventory.fuel / config.MAX_FUEL) * 100;
        fuelBarFill.style.width = `${Math.max(0, Math.min(100, fuelPercent))}%`;
    }

    // Launch Prompt Update (Keep existing basic logic here, main logic is in main.js)
    if (launchPromptElement) {
         // Visibility is controlled by main.js, but we could update text content here if needed
        // For now, leave it as is.
    }
}

// Function to consume fuel during flight (NOW OBSOLETE - fuel cost is upfront)
// function consumeRocketFuel(deltaTime) { ... }

// Helper function to schedule item removal and add to regen queue
function scheduleItemRemoval(itemGroup, collectionTime, removalList) {
    const collectionQueue = itemGroup.type === 'seeds' ? collectedSeedsQueue : collectedFuelQueue;
    if (itemGroup.gem && itemGroup.gem.originalPosition) {
        collectionQueue.push({
            originalPosition: itemGroup.gem.originalPosition,
            collectedTime: collectionTime,
            type: itemGroup.type // Store type for regeneration
        });
    } else {
         console.warn("Collected item missing originalPosition:", itemGroup.gem);
    }

    let originalIndex = -1;
    if (itemGroup.type === 'seeds') {
        originalIndex = seedGems.findIndex(sg => sg.gem === itemGroup.gem);
    } else if (itemGroup.type === 'fuel') {
        originalIndex = fuelItems.findIndex(fi => fi.gem === itemGroup.gem);
    }
    
    if (originalIndex !== -1) {
        // Check if already scheduled for removal to prevent duplicates
        if (!removalList.some(item => item.gem === itemGroup.gem)) {
            removalList.push({ 
                arrayType: itemGroup.type, // 'seeds' or 'fuel'
                index: originalIndex, 
                gem: itemGroup.gem 
            });
        }
    } else {
        console.warn("Could not find collected item in original array?", itemGroup);
    }
}

// Helper function to process removals
function removeCollectedItems(itemsToRemove) {
     for (let i = itemsToRemove.length - 1; i >= 0; i--) {
        const item = itemsToRemove[i];
        homePlanetRef.remove(item.gem); 
        // Dispose GLTF resources carefully if they contain multiple geometries/materials
        // For simple cube, this is fine:
        if (item.arrayType === 'seeds' && item.gem.geometry) item.gem.geometry.dispose(); 
        if (item.arrayType === 'seeds' && item.gem.material) item.gem.material.dispose();
        // For GLTF, let garbage collection handle complex disposal for now, unless issues arise

        // Remove the actual item data from the correct array
        if (item.arrayType === 'seeds') {
            seedGems.splice(item.index, 1);
        } else if (item.arrayType === 'fuel') {
            fuelItems.splice(item.index, 1);
        }
    }
}

// Update Resources
function updateResources(scene, playerSphere, homePlanet, audioListener, deltaTime) {
    const itemsToRemove = [];
    const now = performance.now() / 1000;
    const allItems = [...seedGems, ...fuelItems];

    allItems.forEach((itemGroup, index) => {
        if (!itemGroup.gem) {
            return;
        }

        playerSphere.getWorldPosition(_playerWorldPos);
        itemGroup.gem.getWorldPosition(_gemWorldPos);
        const distanceToPlayer = _playerWorldPos.distanceTo(_gemWorldPos);
        // console.log(`DIST CHECK: Type=${itemGroup.type}, Dist=${distanceToPlayer.toFixed(2)}, Threshold=${config.COLLECTION_DISTANCE}`); // Keep commented unless needed

        // --- Magnetism (Seeds Only) - DISABLING THIS BLOCK for trees ---
        if (false && itemGroup.type === 'seeds' && distanceToPlayer < config.GEM_MAGNET_DISTANCE) { // Condition set to false
            // Calculate direction towards the player (seeds don't need offset target)
            const directionToPlayer = new THREE.Vector3().subVectors(_playerWorldPos, _gemWorldPos).normalize();
            const moveDistance = config.GEM_MAGNET_STRENGTH * (1 - distanceToPlayer / config.GEM_MAGNET_DISTANCE);
            const worldMoveVector = directionToPlayer.multiplyScalar(moveDistance);
            const newWorldPos = _gemWorldPos.add(worldMoveVector);

            // Clamp position to planet surface
            const potentialLocalPos = homePlanetRef.worldToLocal(newWorldPos.clone());
            const planetRadius = homePlanetRef.geometry.parameters.radius;
            const surfaceLocalPos = potentialLocalPos.clone().normalize().multiplyScalar(planetRadius);
            // Apply seed offset
            const surfaceNormal = surfaceLocalPos.clone().normalize();
            const seedVerticalOffset = -0.3; // Match seed placement offset
            const finalMagnetPos = surfaceLocalPos.clone().addScaledVector(surfaceNormal, seedVerticalOffset);
            itemGroup.gem.position.copy(finalMagnetPos);
            
            // --- Collection Check (Seeds Only - during magnetism) ---
            if (distanceToPlayer < config.COLLECTION_DISTANCE) {
                scheduleItemRemoval(itemGroup, now, itemsToRemove);
                // Increment inventory and play sound
                    if (inventory.seeds < config.MAX_SEEDS) {
                        inventory.seeds++;
                        playSeedPickupSound();
                    updateInventoryDisplay(); 
                }
            }
        }
        // --- Direct Collection Check (Fuel AND Seeds/Trees) ---
        else {
            // Use specific distance based on type
            const requiredDistance = itemGroup.type === 'seeds' 
                ? config.TREE_COLLECTION_DISTANCE 
                : config.COLLECTION_DISTANCE;

            if (distanceToPlayer < requiredDistance) {
                // Store position before any modifications
                const collectionPosition = itemGroup.gem.position.clone();
                
                // Immediately remove the item from the scene to prevent physics interactions
                homePlanetRef.remove(itemGroup.gem);
                
                if (itemGroup.type === 'fuel') {
                    // Check if already full before collecting
                    const wasFuelFull = inventory.fuel >= config.MAX_FUEL;
                    if (!wasFuelFull) {
                        // Get random fuel amount between min and max
                        const fuelAmount = Math.floor(Math.random() * 
                            (config.FUEL_PER_PICKUP_MAX - config.FUEL_PER_PICKUP_MIN + 1)) + 
                            config.FUEL_PER_PICKUP_MIN;
                            
                        // Update inventory
                        inventory.fuel = Math.min(config.MAX_FUEL, inventory.fuel + fuelAmount);
                        playFuelPickupSound();
                        updateInventoryDisplay();
                        
                        // Create floating number and particles at the stored position
                        createFloatingNumber(fuelAmount, collectionPosition);
                        spawnFuelParticles(collectionPosition);
                        
                        // Schedule removal from arrays after everything else is done
                        scheduleItemRemoval(itemGroup, now, itemsToRemove);
                        
                        // Check if *now* full
                        if (!wasFuelFull && inventory.fuel >= config.MAX_FUEL) {
                            playInventoryFullSound();
                        }
                    }
                } else if (itemGroup.type === 'seeds') {
                     // Check if already full before collecting
                     const wasSeedsFull = inventory.seeds >= config.MAX_SEEDS;
                    
                    // Random chance to get only 1 seed (20% chance)
                    const seedsToGive = Math.random() < 0.2 ? 1 : (itemGroup.seedsToGive || 1);
                    const newSeedCount = Math.min(config.MAX_SEEDS, inventory.seeds + seedsToGive);
                    const actualSeedsGained = newSeedCount - inventory.seeds;
                    
                    // Always remove the tree, but only add seeds if we can
                    if (actualSeedsGained > 0) {
                        inventory.seeds = newSeedCount;
                        playSeedPickupSound(); // Plays treefall sound
                        updateInventoryDisplay(); 
                        
                        // Create floating number at the stored position
                        createFloatingNumber(actualSeedsGained, collectionPosition, 0x00cc44); // Green color for seeds
                        
                        // Only play inventory full sound when we first become full
                        if (!wasSeedsFull && inventory.seeds >= config.MAX_SEEDS) {
                            playInventoryFullSound();
                        }
                    } else {
                        // Still play sound and show feedback even if we can't collect seeds
                        playSeedPickupSound();
                    }
                    
                    // Schedule removal from arrays after everything else is done
                    scheduleItemRemoval(itemGroup, now, itemsToRemove);
                }
            }
        }
        /* Original Fuel check - moved into combined check above
        else if (itemGroup.type === 'fuel' && distanceToPlayer < config.COLLECTION_DISTANCE) {
            scheduleItemRemoval(itemGroup, now, itemsToRemove);
             // Increment inventory and play sound
            if (inventory.fuel < config.MAX_FUEL) {
                inventory.fuel = Math.min(config.MAX_FUEL, inventory.fuel + config.FUEL_PER_PICKUP);
                playFuelPickupSound(); // Keep fuel sound
                updateInventoryDisplay();
                // --- Spawn Break Effect ---
                spawnFuelParticles(itemGroup.gem.position); // Spawn particles at fuel location
                // -------------------------
            }
        }
        */
    });

    // Remove collected items after iteration
    removeCollectedItems(itemsToRemove);

    // --- Check for Item Regeneration (Seeds and Fuel) ---
    const regeneratedSeedIndices = [];
    const regeneratedFuelIndices = [];

    function checkRegeneration(queue, itemArray, regenTime, color, regeneratedIndices) {
        queue.forEach((collectedItem, index) => {
            if (now > collectedItem.collectedTime + regenTime) {
                let position = collectedItem.originalPosition;
                // Ensure originalPosition is a Vector3
                if (!position || !position.isVector3) {
                     console.warn("Invalid originalPosition in regen queue, skipping item.", collectedItem);
                     return; 
                }

                playerSphere.getWorldPosition(_playerWorldPos);
                const potentialWorldPos = homePlanetRef.localToWorld(position.clone());
                const playerDistSq = _playerWorldPos.distanceToSquared(potentialWorldPos);
                const safeFromPlayer = playerDistSq > (config.COLLECTION_DISTANCE * config.COLLECTION_DISTANCE * 4);
                const combinedItems = [...seedGems, ...fuelItems]; 

                if (!isTooCloseToOtherGems(position, combinedItems, config.MIN_GEM_DISTANCE) && safeFromPlayer) {
                    let newItem;
                    if(collectedItem.type === 'seeds') {
                          if (!seedModelProto) {
                             console.warn("Seed (Tree) prototype not loaded, cannot respawn seed yet.");
                             return;
                          }
                          newItem = seedModelProto.clone(true);
                          newItem.gemType = collectedItem.type;
                         const treeScale = .5;
                          newItem.scale.set(treeScale, treeScale, treeScale);
                          const surfaceNormal = position.clone().normalize();
                         const modelUp = new THREE.Vector3(0, 1, 0);
                          const alignmentQuaternion = new THREE.Quaternion();
                          alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
                          newItem.quaternion.copy(alignmentQuaternion);
                          const planetRadius = homePlanetRef.geometry.parameters.radius;
                         const verticalOffset = 0.1;
                          const finalPos = position.clone().normalize().multiplyScalar(planetRadius + verticalOffset);
                         newItem.position.copy(finalPos);
                         newItem.originalPosition = finalPos.clone();

                         // Add to seedGems array for collision detection
                         const itemData = { 
                             gem: newItem, 
                             type: 'seeds',
                             seedsToGive: config.SEEDS_PER_FOREST // Add seedsToGive property
                         };
                         seedGems.push(itemData);
                         homePlanetRef.add(newItem);
                         regeneratedIndices.push(index);
                     } else if (collectedItem.type === 'fuel') {
                         if (!fuelModelProto) { // Check if model is loaded before respawning fuel
                             console.warn("Fuel prototype not loaded, cannot respawn fuel yet.");
                             return; // Skip this respawn attempt
                         }
                         // Respawn fuel using the same logic as initial generation
                         newItem = fuelModelProto.clone(true);
                         newItem.gemType = collectedItem.type;
                         const fuelScale = 0.05; // Use consistent scale
                         newItem.scale.set(fuelScale, fuelScale, fuelScale);
                         const surfaceNormal = position.clone().normalize();
                         const modelUp = new THREE.Vector3(0, 1, 0); // Y-up
                         const alignmentQuaternion = new THREE.Quaternion();
                         alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
                         newItem.quaternion.copy(alignmentQuaternion);
                         newItem.position.copy(position); // Position parent origin (offset is baked into child)
                         newItem.originalPosition = position.clone(); // Store surface position
                     } else {
                        console.warn("Unknown type in regen queue:", collectedItem.type);
                        return;
                    }
                    
                    homePlanetRef.add(newItem); // Add to the correct parent
                    itemArray.push({ gem: newItem, type: collectedItem.type });
                    regeneratedIndices.push(index); // Mark this index for removal from queue
                } else {
                    // Optionally delay regeneration check if blocked
                    // collectedItem.collectedTime = now; // Keep pushing back regen time
                }
            }
        });
    }

    // Check Seed Regeneration
    checkRegeneration(collectedSeedsQueue, seedGems, config.SEED_REGEN_TIME, config.SEED_GEM_COLOR, regeneratedSeedIndices);
    // Check Fuel Regeneration
    checkRegeneration(collectedFuelQueue, fuelItems, config.FUEL_REGEN_TIME, config.FUEL_ITEM_COLOR, regeneratedFuelIndices);

    // Remove regenerated items from queues
    regeneratedSeedIndices.sort((a, b) => b - a).forEach(index => collectedSeedsQueue.splice(index, 1));
    regeneratedFuelIndices.sort((a, b) => b - a).forEach(index => collectedFuelQueue.splice(index, 1));
    
    // --- Update Fuel Particles ---
    updateFuelParticles(deltaTime);
    // ---------------------------

    // --- NEW: Update Animated Decorative Item Mixers ---
    for (const item of animatedDecorItems) {
        if (item.userData.mixer) {
            item.userData.mixer.update(deltaTime);
        }
    }
    // --------------------------------------------------

    // Update animations for remaining SEEDS only - REMOVING THIS
    // seedGems.forEach(itemGroup => { 
    //      if (itemGroup.gem) {
    //         // Re-add check: Only rotate seeds (cubes) - Removed for tree models
    //         // if (itemGroup.type === 'seeds') { 
    //         //     itemGroup.gem.rotation.x += 0.01;
    //         //     itemGroup.gem.rotation.y += 0.01;
    //         // }
    //      }
    // });
}

// --- Audio Playback ---

// UPDATED: Play SINGLE sound for seeds
function playSeedPickupSound() {
    if (pickupSound && pickupSound.buffer) {
        if (pickupSound.isPlaying) {
            pickupSound.stop(); // Restart if already playing from rapid collection
        }
        pickupSound.play();
    }

    // REMOVED: Accent sound logic
    /*
    if (seedAccentSound && seedAccentSound.buffer) {
        if (seedAccentSound.isPlaying) {
            seedAccentSound.stop();
        }
        seedAccentSound.play();
    }
    */
}

// Play fuel pickup sound (unchanged from last step)
function playFuelPickupSound() {
    const soundToPlay = fuelPickupSound1;

    if (soundToPlay && soundToPlay.buffer && !soundToPlay.isPlaying) {
        soundToPlay.play();
    } else if (soundToPlay && soundToPlay.buffer && soundToPlay.isPlaying) {
        soundToPlay.stop();
        soundToPlay.play();
    }
}

// Function to play the rocket launch sound
function playRocketLaunchSound() {
    // --- Add More Logging ---
    console.log(`playRocketLaunchSound called. Current isPlaying: ${rocketLaunchSound?.isPlaying}`);
    // -----------------------
    if (rocketLaunchSound && rocketLaunchSound.buffer) {
        // Always stop before playing to prevent potential overlaps/glitches
        if (rocketLaunchSound.isPlaying) {
            console.log("SOUND DEBUG: Sound was playing. Stopping...");
            rocketLaunchSound.stop();
            console.log(`SOUND DEBUG: State after stop(): isPlaying=${rocketLaunchSound.isPlaying}`); // Log state immediately after stop
        }    
        rocketLaunchSound.setVolume(0.6); // Reset volume 
        console.log("SOUND DEBUG: Calling play()...");
        rocketLaunchSound.play();
        console.log(`SOUND DEBUG: State after play(): isPlaying=${rocketLaunchSound.isPlaying}`); // Log state immediately after play
        // console.log("Playing rocket launch sound (potentially restarted)."); // Original log replaced by debug logs
    } else {
        console.warn("Rocket launch sound not loaded or buffer not ready.");
    }
}

// Function to play the impact sound
function playImpactSound() {
    console.log("Attempting to play impact sound...");
    if (!impactSound) {
        console.warn("Impact sound object is null!");
        return;
    }
    if (!impactSound.buffer) {
        console.warn("Impact sound buffer not loaded yet.");
        return;
    }
    if (impactSound.isPlaying) {
        // Don't restart if already playing
        console.log("Impact sound already playing, stopping and restarting.");
        impactSound.stop(); // Stop before playing again to ensure it plays
    } 
    
    console.log("Executing impactSound.play()");
    impactSound.play();
    console.log("Executed impactSound.play()"); // Confirm play was called

    // Check state shortly after calling play
    setTimeout(() => {
        if(impactSound.isPlaying) {
            console.log("Impact sound confirmed playing shortly after call.");
        } else {
             console.warn("Impact sound NOT playing shortly after call. Context issue?");
        }
    }, 50); // Check after 50ms
}

// Function to start the rolling sound
function startRollingSound() {
    console.log("Attempting startRollingSound...");
    if (!rollingSound) { console.warn("startRollingSound: rollingSound object is null!"); return; }
    if (!rollingSound.buffer) { console.warn("startRollingSound: rollingSound buffer is null!"); return; }
    if (rollingSound.isPlaying) { console.log("startRollingSound: Already playing."); return; }
    if (rollingSound.context.state !== 'running') { console.warn(`startRollingSound: AudioContext not running! State: ${rollingSound.context.state}`); return; }
    
    // Ensure loop is true and volume is reset when starting
    rollingSound.setLoop(true);
    rollingSound.setVolume(config.ROLLING_SOUND_BASE_VOLUME);

    console.log("Executing rollingSound.play()"); 
    rollingSound.play();
    console.log("Executed rollingSound.play()"); 
}

// Function to set the loop property
function setRollingSoundLoop(shouldLoop) {
    if (rollingSound) {
        rollingSound.setLoop(shouldLoop);
    }
}

// Function to set the volume
function setRollingSoundVolume(volume) {
    if (rollingSound) {
        // Clamp volume between 0 and 1
        const clampedVolume = Math.max(0, Math.min(1, volume));
        rollingSound.setVolume(clampedVolume);
    }
}

// Function to stop the rolling sound (hard stop)
function stopRollingSound() {
    console.log("Attempting stopRollingSound...");
    if (!rollingSound) { console.warn("stopRollingSound: rollingSound object is null!"); return; }
    
    if (rollingSound.isPlaying) {
        console.log("Executing rollingSound.stop()"); 
        rollingSound.stop(); 
        console.log("Executed rollingSound.stop()"); 
    } else {
        console.log("stopRollingSound: Not currently playing.");
    }
}

// --- Pal Movement Sound Control Functions (Simplified for PositionalAudio) ---
function startPalMovementSound() {
    const sound = window.loadedSounds?.palMovementSound;
    if (!sound) { console.warn("startPalMovementSound: sound object not loaded!"); return; }
    if (!sound.buffer) { console.warn("startPalMovementSound: buffer is null!"); return; }
    if (sound.isPlaying) { return; } // Don't restart if already playing
    if (sound.context.state !== 'running') { console.warn(`startPalMovementSound: AudioContext not running! State: ${sound.context.state}`); return; }
    
    sound.setLoop(true);
    // NOTE: Volume is now primarily controlled by distance + base volume set at load time.
    // You could still use setVolume here to change the *base* volume dynamically if needed.
    sound.play();
    console.log("[Pal Sound] Started Pal Movement Sound (Positional)"); 
}

// Removed setPalMovementSoundLoop - loop set on start
// Removed setPalMovementSoundVolume - volume is positional

function stopPalMovementSound() {
    const sound = window.loadedSounds?.palMovementSound;
    if (!sound) { console.warn("stopPalMovementSound: sound object not loaded!"); return; }
    
    if (sound.isPlaying) {
        sound.stop(); 
        console.log("[Pal Sound] Stopped Pal Movement Sound (Positional)"); 
    } 
}
// --- END Pal Movement Sound Control Functions ---

// --- Play Pal Arrival Sound (NEW - With Cooldown) ---
function playPalArrivalSound() {
    if (!palArrivalSound) { console.warn("playPalArrivalSound: sound object is null!"); return; }
    if (!palArrivalSound.buffer) { console.warn("playPalArrivalSound: buffer is null!"); return; }
    
    const now = performance.now();
    if ((now - lastPalArrivalSoundTime) / 1000 < config.PAL_ARRIVAL_SOUND_COOLDOWN) {
        // console.log("[Pal Sound] Arrival sound cooldown active."); // Optional debug
        return; // Exit if cooldown is active
    }

    if (palArrivalSound.isPlaying) {
        palArrivalSound.stop(); 
    } 
    palArrivalSound.play();
    lastPalArrivalSoundTime = now; // Update last played time
    // console.log("[Pal Sound] Played Pal Arrival Sound"); 
}
// --- END Play Pal Arrival Sound ---

// --- Play Player Jump Sound (NEW) ---
function playPlayerJumpSound() {
    const sound = window.loadedSounds?.playerJumpSound;
    if (!sound) { console.warn("playPlayerJumpSound: sound object not loaded!"); return; }
    if (!sound.buffer) { console.warn("playPlayerJumpSound: buffer is null!"); return; }
    if (sound.isPlaying) {
        sound.stop(); // Restart if somehow still playing
    }
    sound.play();
    // console.log("[Player Sound] Played Jump Sound"); // Debug Log
}
// --- END Play Player Jump Sound ---

// --- Play Player Land Sound (NEW) ---
function playPlayerLandSound() {
    const sound = window.loadedSounds?.playerLandSound;
    if (!sound) { console.warn("playPlayerLandSound: sound object not loaded!"); return; }
    if (!sound.buffer) { console.warn("playPlayerLandSound: buffer is null!"); return; }
    if (sound.isPlaying) {
        // Optional: Decide if restarting is needed. For a landing sound, maybe not.
        // return; 
        sound.stop(); // Let's restart it for now
    }
    sound.play();
    // console.log("[Player Sound] Played Land Sound"); // Debug Log
}
// --- END Play Player Land Sound ---

// --- Play Inventory Full Sound (NEW) ---
function playInventoryFullSound() {
    const sound = window.loadedSounds?.inventoryFullSound;
    if (!sound) { console.warn("playInventoryFullSound: sound object not loaded!"); return; }
    if (!sound.buffer) { console.warn("playInventoryFullSound: buffer is null!"); return; }
    if (sound.isPlaying) {
        sound.stop(); // Restart if still playing from a rapid fill?
    }
    sound.play();
    console.log("[Inventory Sound] Played Inventory Full Sound"); // Debug Log
}
// --- END Play Inventory Full Sound ---

// --- Play Terraform Ready Sound (NEW) ---
function playTerraformReadySound() {
    const sound = window.loadedSounds?.terraformReadySound;
    if (!sound) { console.warn("playTerraformReadySound: sound object not loaded!"); return; }
    if (!sound.buffer) { console.warn("playTerraformReadySound: buffer is null!"); return; }
    if (sound.isPlaying) {
        sound.stop(); // Restart if needed?
    }
    sound.play();
    console.log("[Terraform Sound] Played Terraform Ready Sound"); // Debug Log
}
// --- END Play Terraform Ready Sound ---

// --- NEW: Update Slowdown Fade Function (Internal) ---
function updateSlowdownFade() {
    if (!slowdownSound || !slowdownSound.buffer || slowdownSoundPlayStartTime === 0) {
        slowdownFadeRafId = null; // Ensure loop stops if sound/buffer/start time is invalid
        return;
    }

    const now = performance.now();
    const elapsedTime = (now - slowdownSoundPlayStartTime) / 1000; // seconds
    const duration = slowdownSound.buffer.duration;

    if (elapsedTime >= duration) {
        // Fade complete
        slowdownSound.setVolume(0);
        if (slowdownSound.isPlaying) {
            slowdownSound.stop(); // Ensure it stops fully
        }
        slowdownSoundPlayStartTime = 0; // Reset start time
        slowdownFadeRafId = null; // Clear RAF ID
        console.log("[SOUND] Slowdown fade complete.");
    } else {
        // Still fading
        const fadeProgress = elapsedTime / duration;
        const currentVolume = config.SLOWDOWN_SOUND_BASE_VOLUME * (1.0 - fadeProgress); // Linear fade out
        slowdownSound.setVolume(Math.max(0, currentVolume)); // Set volume, clamp at 0
        
        // Request next frame
        slowdownFadeRafId = requestAnimationFrame(updateSlowdownFade);
    }
}
// -------------------------------------------

// --- Play Slowdown Sound Function (Modified) ---
function playSlowdownSound() { 
    if (slowdownSound && slowdownSound.buffer) {
        // Cancel any previous fade loop
        if (slowdownFadeRafId !== null) {
            cancelAnimationFrame(slowdownFadeRafId);
            slowdownFadeRafId = null;
        }

        // Stop if playing, reset volume, play, start fade
        if (slowdownSound.isPlaying) {
            slowdownSound.stop();
        }
        slowdownSound.setVolume(config.SLOWDOWN_SOUND_BASE_VOLUME); // Reset to base volume

        if (slowdownSound.context.state === 'running') {
            console.log("SOUND: Playing slowdown sound and starting fade.");
            slowdownSound.play();
            slowdownSoundPlayStartTime = performance.now(); // Record start time
            slowdownFadeRafId = requestAnimationFrame(updateSlowdownFade); // Start fade update loop
        } else {
            console.warn("Cannot play slowdown sound - audio context not running.");
        }
    } else {
        console.warn("Slowdown sound not loaded or buffer missing.");
    }
}
// --- END Modified Slowdown Sound ---

// Function to load all audio assets and return a Promise
async function loadAudio(listener) { // <<< Mark as async
    audioListenerRef = listener; 
    const loader = new THREE.AudioLoader();
    
    // <<< NEW: Central configuration for all sounds >>>
    const soundsToLoadConfig = [
        { name: 'pickupSound', path: 'sfx/treefall.mp3', volume: 0.3, loop: false, type: 'Audio', log: 'Seed (treefall) pickup sound loaded.' },
        { name: 'fuelPickupSound', path: 'sfx/stone-break.mp3', volume: 0.2, loop: false, type: 'Audio', log: 'Fuel pickup sound loaded.' },
        { name: 'rocketLaunchSound', path: 'sfx/rocketsound.mp3', volume: 0.6, loop: false, type: 'Audio', log: 'Rocket launch sound loaded.' },
        { name: 'impactSound', path: 'sfx/impact-sound.mp3', volume: 0.7, loop: false, type: 'Audio', log: 'Impact sound loaded.' },
        { name: 'rollingSound', path: 'sfx/rolling-sound.mp3', volume: config.ROLLING_SOUND_BASE_VOLUME, loop: true, type: 'Audio', log: 'Rolling sound loaded.' },
        { name: 'ambientSound', path: 'sfx/wind-soft-crickets.wav', volume: 0.3, loop: true, type: 'Audio', log: 'Ambient sound loaded.' },
        { name: 'boostBurstSound', path: 'sfx/boost_burst.mp3', volume: 0.5, loop: false, type: 'PositionalAudio', refDistance: 10, rolloffFactor: 1, log: 'Boost Burst sound loaded.' },
        { name: 'boostRiseSound', path: 'sfx/boost_rise.mp3', volume: 0.5, loop: false, type: 'PositionalAudio', refDistance: 15, rolloffFactor: 1, log: 'Boost Rise sound loaded.' },
        { name: 'palMovementSound', path: 'sfx/pal/palmovement-sound.wav', volume: config.PAL_MOVE_SOUND_BASE_VOLUME, loop: true, type: 'PositionalAudio', refDistance: config.PAL_SOUND_REF_DISTANCE, rolloffFactor: config.PAL_SOUND_ROLLOFF_FACTOR, log: 'Pal movement sound loaded (Positional).' },
        { name: 'palArrivalSound', path: 'sfx/pal/yes.wav', volume: 0.8, loop: false, type: 'PositionalAudio', refDistance: config.PAL_SOUND_REF_DISTANCE, rolloffFactor: config.PAL_SOUND_ROLLOFF_FACTOR, log: 'Pal arrival sound loaded.' },
        { name: 'playerJumpSound', path: 'sfx/jump-sound.mp3', volume: 0.6, loop: false, type: 'Audio', log: 'Player jump sound loaded.' }, // Corrected path
        { name: 'playerLandSound', path: 'sfx/skid-sound.mp3', volume: 0.5, loop: false, type: 'Audio', log: 'Player land sound loaded.' }, // File missing?
        { name: 'inventoryFullSound', path: 'sfx/inventory-full.wav', volume: 0.6, loop: false, type: 'Audio', log: 'Inventory full sound loaded.' }, // <<< CORRECTED EXTENSION to .wav
        { name: 'enemyScanningSound', path: 'sfx/enemy-scanning.mp3', volume: 0.7, loop: true, type: 'Audio', log: 'Enemy scanning sound loaded.' }, // File missing?
        { name: 'enemyRoarSound', path: 'sfx/enemyroar.mp3', volume: 0.9, loop: false, type: 'PositionalAudio', refDistance: 100, rolloffFactor: 1.2, log: 'Enemy roar sound loaded.' }, // Corrected path
        { name: 'terraformSuccessSound', path: 'sfx/terraformsucces.mp3', volume: 0.8, loop: false, type: 'Audio', log: 'Terraform success sound loaded.' }, // Corrected path (typo)
        { name: 'terraformReadySound', path: 'sfx/terraform-ready-sound.mp3', volume: 0.7, loop: false, type: 'Audio', log: 'Terraform ready sound loaded.' }, // Corrected path
        { name: 'nodeDeactivationSound', path: 'sfx/deactivatenodesound.wav', volume: 0.8, loop: false, type: 'PositionalAudio', refDistance: 50, rolloffFactor: 1, log: 'Node deactivation sound loaded (Positional).' }, // Corrected path
        { name: 'nodeSpawnLoopSound', path: 'sfx/nodesound.mp3', volume: 0.6, loop: true, type: 'PositionalAudio', refDistance: 50, rolloffFactor: 1, log: 'Node spawn loop sound loaded (Positional).' }, // Corrected path (assumed)
        { name: 'enemyMovementSound', path: 'sfx/robottanksound.mp3', volume: 0.5, loop: true, type: 'PositionalAudio', refDistance: 70, rolloffFactor: 1.1, log: 'Enemy movement sound loaded (Positional).' }, // File missing? (maybe robottanksound.mp3?)
        { name: 'slowdownSound', path: 'sfx/slowdown.mp3', volume: config.SLOWDOWN_SOUND_BASE_VOLUME, loop: false, type: 'Audio', log: 'Slowdown sound loaded.' },
        { name: 'gameOverSound', path: 'sfx/GameOver.wav', volume: 0.7, loop: false, type: 'Audio', log: 'Game over sound loaded.' },
        { name: 'alarmSirenSound', path: 'sfx/alarmsiren.mp3', volume: 0.6, loop: false, type: 'Audio', log: 'Alarm siren sound loaded.' }, // Corrected path & SET LOOP FALSE
        { name: 'nodeProximityLoopSound', path: 'sfx/enterNode.mp3', volume: 0.5, loop: true, type: 'PositionalAudio', refDistance: 40, rolloffFactor: 1.0, log: 'Node proximity loop sound loaded (Positional).' }, // Corrected path (assumed)
        { name: 'singleNodeActivationSound', path: 'sfx/deactivateNodeSingle.mp3', volume: 0.7, loop: false, type: 'PositionalAudio', refDistance: 50, rolloffFactor: 1, log: 'Single node activation sound loaded (Positional).' }, // Corrected path (assumed)
        { name: 'playerCollideSound', path: 'sfx/collidesound.mp3', volume: 0.8, loop: false, type: 'Audio', log: 'Player collide sound loaded.' },
        { name: 'themeMusicSound', path: 'sfx/starseedambient.mp3', volume: 0.3, loop: true, type: 'Audio', log: 'Theme music loaded.' },
        { name: 'dangerMusicSound', path: 'sfx/DangerTheme.mp3', volume: 0.3, loop: true, type: 'Audio', log: 'Danger theme sound loaded.' },
        // { name: 'inventoryFullSound', path: 'sfx/inventory-full.mp3', volume: 0.6, loop: false, type: 'Audio', log: 'Inventory full sound loaded.' }, // <<< UNCOMMENTED
        // { name: 'enemyScanningSound', path: 'sfx/enemy/enemy-scanning.mp3', volume: 0.7, loop: true, type: 'Audio', log: 'Enemy scanning sound loaded.' }, // File missing?
        { name: 'sunImpactSound', path: 'sfx/sunImpact.mp3', volume: 0.8, loop: false, type: 'Audio', log: 'Sun impact sound loaded.' },
    ];

    // <<< NEW: Map config to promises using loadAsync >>>
    const loadPromises = soundsToLoadConfig.map(config => 
        loader.loadAsync(config.path).catch(err => {
            console.error(`Error loading sound: ${config.path}`, err);
            return null; // Return null on error to allow Promise.all to complete
        })
    );

    // <<< REMOVE old counter logic >>>
    // let soundsLoaded = 0;
    // let totalSoundsToLoad = 25; // <<< Increment count to 25
    // const loadedSounds = {}; 
    // const checkAllLoaded = () => { ... };
    // const onError = (url, err) => { ... };

    // <<< REMOVE all individual loader.load(...) calls >>>
    // loader.load('sfx/treefall.mp3', ...);
    // loader.load('sfx/stone-break.mp3', ...);
    // ... (remove all the rest)

    // <<< ADD Promise.all handling (logic will be added in next step) >>>
    try {
        const buffers = await Promise.all(loadPromises);
        
        // <<< ADD Logic to process buffers and create sounds >>>
        const loadedSounds = {};

        buffers.forEach((buffer, index) => {
            const config = soundsToLoadConfig[index];
            if (buffer) {
                let sound;
                // Create appropriate audio type
                if (config.type === 'PositionalAudio') {
                    sound = new THREE.PositionalAudio(audioListenerRef);
                    if (config.refDistance) sound.setRefDistance(config.refDistance);
                    if (config.rolloffFactor) sound.setRolloffFactor(config.rolloffFactor);
                } else { // Default to 'Audio'
                    sound = new THREE.Audio(audioListenerRef);
                }
                
                // Set common properties
                sound.setBuffer(buffer);
                sound.setLoop(config.loop);
                sound.setVolume(config.volume);
                
                // Assign to global variable (for existing references)
                // Use window scope explicitly for clarity
                // window[config.name] = sound; // <<< REMOVE THIS LINE
                
                // <<< ADD: Assign to correct module-level variable >>>
                switch (config.name) {
                    case 'pickupSound': pickupSound = sound; break;
                    case 'fuelPickupSound': fuelPickupSound1 = sound; break; // Matches original variable name
                    case 'rocketLaunchSound': rocketLaunchSound = sound; break;
                    case 'impactSound': impactSound = sound; break;
                    case 'rollingSound': rollingSound = sound; console.log(`[Debug LoadAudio] Assigned rollingSound: ${!!rollingSound}`); break;
                    case 'ambientSound': ambientSound = sound; console.log(`[Debug LoadAudio] Assigned ambientSound: ${!!ambientSound}`); break; // <<< ADD Log
                    case 'boostBurstSound': boostBurstSound = sound; break;
                    case 'boostRiseSound': boostRiseSound = sound; break;
                    case 'palMovementSound': palMovementSound = sound; break;
                    case 'palArrivalSound': palArrivalSound = sound; console.log(`[Debug LoadAudio] Assigned palArrivalSound: ${!!palArrivalSound}`); break;
                    case 'playerJumpSound': playerJumpSound = sound; break;
                    // case 'playerLandSound': playerLandSound = sound; break; // File missing
                    case 'inventoryFullSound': inventoryFullSound = sound; break; // <<< UNCOMMENTED
                    // case 'enemyScanningSound': enemyScanningSound = sound; break; // File missing
                    case 'enemyRoarSound': enemyRoarSound = sound; break;
                    case 'terraformSuccessSound': terraformSuccessSound = sound; break;
                    case 'terraformReadySound': terraformReadySound = sound; break;
                    case 'nodeDeactivationSound': nodeDeactivationSound = sound; break;
                    case 'nodeSpawnLoopSound': nodeSpawnLoopSound = sound; break;
                    // case 'enemyMovementSound': enemyMovementSound = sound; break; // File missing
                    case 'slowdownSound': slowdownSound = sound; break;
                    case 'gameOverSound': gameOverSound = sound; break;
                    case 'alarmSirenSound': alarmSirenSound = sound; break;
                    case 'nodeProximityLoopSound': nodeProximityLoopSound = sound; break;
                    case 'singleNodeActivationSound': singleNodeActivationSound = sound; break;
                    case 'playerCollideSound': playerCollideSound = sound; break;
                    case 'themeMusicSound': themeMusicSound = sound; console.log(`[Debug LoadAudio] Assigned themeMusicSound: ${!!themeMusicSound}`); break; // <<< ADD Log
                    case 'dangerMusicSound': dangerMusicSound = sound; console.log(`[Debug LoadAudio] Assigned dangerMusicSound: ${!!dangerMusicSound}`); break; // <<< ADD Log
                    case 'sunImpactSound': sunImpactSound = sound; break;
                    default: console.warn(`Sound name "${config.name}" not handled in module variable assignment.`);
                }
                // <<< END Assignment to module-level variable >>>

                // Assign to the object returned by this function (still useful for window.loadedSounds)
                loadedSounds[config.name] = sound; 
                
                // <<< ADD Specific Log for Inventory Full >>>
                if (config.name === 'inventoryFullSound') {
                    console.log(`[Debug LoadAudio Assign] Assigned inventoryFullSound to loadedSounds object. Sound object exists: ${!!sound}`);
                }
                // <<< END Specific Log >>>
                
                console.log(config.log); // Log success
            } else {
                // Handle failed load (buffer is null)
                // window[config.name] = null; // <<< REMOVE THIS LINE
                // Assign null to the returned object if loading failed
                loadedSounds[config.name] = null;
                // We don't need to assign null to module variables as they start as null
                console.warn(`Failed to load buffer for ${config.name} (${config.path}), sound set to null.`);
                 // <<< ADD Specific Log for Inventory Full FAILURE >>>
                 if (config.name === 'inventoryFullSound') {
                    console.error(`[Debug LoadAudio Assign] FAILED to load buffer for inventoryFullSound.`);
                 }
                 // <<< END Specific Log >>>
            }
        });
        // <<< END Buffer processing logic >>>
        
        console.log("All audio loading attempts finished (Promise.all resolved).");
        return loadedSounds; // <<< RETURN the populated loadedSounds object >>>

    } catch (error) {
        console.error("Critical error during Promise.all for audio loading:", error);
        throw error; 
    }
}
// --- END Refactored loadAudio ---

// --- NEW: Boost Sound Playback Functions ---
function playBoostBurstSound(parentObject) { 
    if (!boostBurstSound) { // Check object first
        console.warn("[SOUND DEBUG] playBoostBurstSound: boostBurstSound object is null.");
        return;
    }
    if (!boostBurstSound.buffer) { // Then check buffer
        console.warn("[SOUND DEBUG] playBoostBurstSound: boostBurstSound buffer is not loaded yet.");
        return;
    }
    if (!parentObject) {
        console.warn("[SOUND DEBUG] Boost Burst needs parent object to attach to.");
        return;
    }
    // Attach sound to player mesh for positional audio
    if (boostBurstSound.parent !== parentObject) {
        parentObject.add(boostBurstSound);
    }
    // Stop if playing to allow retrigger
    if (boostBurstSound.isPlaying) {
        boostBurstSound.stop();
    }
    console.log("[SOUND DEBUG] Playing Boost Burst sound.");
    boostBurstSound.play();
}

function playBoostRiseSound(parentObject) {
    if (!boostRiseSound) { // Check object first
        console.warn("[SOUND DEBUG] playBoostRiseSound: boostRiseSound object is null.");
        return;
    }
    if (!boostRiseSound.buffer) { // Then check buffer
        console.warn("[SOUND DEBUG] playBoostRiseSound: boostRiseSound buffer is not loaded yet.");
        return;
    }
     if (!parentObject) {
        console.warn("[SOUND DEBUG] Boost Rise needs parent object to attach to.");
        return;
    }
    // Attach sound to player mesh
    if (boostRiseSound.parent !== parentObject) {
         parentObject.add(boostRiseSound);
    }
    // Play only if not already playing
    if (!boostRiseSound.isPlaying) {
        console.log("[SOUND DEBUG] Playing Boost Rise sound.");
        boostRiseSound.play();
    }
}

function stopBoostRiseSound() {
    if (!boostRiseSound) {
         console.warn("[SOUND DEBUG] Boost Rise sound object not found for stopping.");
         return;
    }
    if (boostRiseSound.isPlaying) {
        console.log("[SOUND DEBUG] Stopping Boost Rise sound.");
        boostRiseSound.stop();
    }
    // Optionally detach from parent when stopped
    if (boostRiseSound.parent) {
        boostRiseSound.parent.remove(boostRiseSound);
    }
}
// --- END NEW Boost Sound Functions --- 

// --- NEW Audio Helper Functions ---
function playThemeMusic() {
    // --- Access sound via window.loadedSounds --- 
    const sound = window.loadedSounds?.themeMusicSound;
    // -------------------------------------------
    if (sound && sound.buffer && !sound.isPlaying) {
        if (sound.context.state === 'running') {
            console.log("Playing theme music...");
            // Reset gain node to 1.0 before setting volume
            if (sound.gain?.gain) { 
                sound.gain.gain.cancelScheduledValues(sound.context.currentTime); // Cancel any ramps
                sound.gain.gain.setValueAtTime(1.0, sound.context.currentTime); // Reset gain
            }
            sound.setVolume(THEME_MUSIC_VOLUME); // <<< SET VOLUME EXPLICITLY
            sound.play();
        } else {
            console.warn("Cannot play theme music - audio context not running.");
        }
    } else if (sound && sound.isPlaying) {
        console.log("Theme music already playing.");
    } else {
        console.warn("Theme music not loaded or ready.");
    }
}

function playTerraformSuccessSound() {
    // --- Access sound via window.loadedSounds --- 
    const sound = window.loadedSounds?.terraformSuccessSound;
    // -------------------------------------------
    if (sound && sound.buffer) {
        if (sound.isPlaying) sound.stop(); // Stop previous if any
        if (sound.context.state === 'running') {
            console.log("Playing terraform success sound...");
            sound.play();
        } else {
            console.warn("Cannot play terraform success sound - audio context not running.");
        }
    } else {
        console.warn("Terraform success sound not loaded or ready.");
    }
}
// ---------------------------------

// --- NEW Music Switching Logic ---
function playAppropriateMusic(isEnemyAwake) {
    // <<< ADD Check for audioListenerRef >>>
    if (!audioListenerRef) {
        console.warn("[MUSIC CALL] Cannot switch music: audioListenerRef is not set.");
        return;
    }
    // <<< END Check >>>

    const themeSound = window.loadedSounds?.themeMusicSound;
    const dangerSound = window.loadedSounds?.dangerMusicSound;
    const audioCtx = audioListenerRef?.context; // Get AudioContext

    // <<< ADD Initial State Log >>>
    console.log(`[Debug playAppropriateMusic Start] isEnemyAwake: ${isEnemyAwake}`);
    console.log(`   themeSound exists: ${!!themeSound}, buffer: ${!!themeSound?.buffer}, isPlaying: ${themeSound?.isPlaying}`);
    console.log(`   dangerSound exists: ${!!dangerSound}, buffer: ${!!dangerSound?.buffer}, isPlaying: ${dangerSound?.isPlaying}`);
    console.log(`   audioCtx state: ${audioCtx?.state}`);
    // <<< END Initial State Log >>>

    console.log(`[MUSIC CALL] playAppropriateMusic called with isEnemyAwake = ${isEnemyAwake}`); // <<< LOG 1

    if (!themeSound || !dangerSound || !themeSound.buffer || !dangerSound.buffer || !audioCtx) {
        console.warn("[MUSIC CALL] Cannot switch music: Sounds or AudioContext not ready.");
        return;
    }

    // Ensure audio context is running (might be suspended after inactivity)
    console.log(`[MUSIC CALL] AudioContext state: ${audioCtx.state}`); // <<< LOG 2
    if (audioCtx.state === 'suspended') {
        console.log("[MUSIC CALL] Attempting AudioContext resume...");
        audioCtx.resume().then(() => {
            console.log("[Music Crossfade] AudioContext Resumed after suspension.");
            scheduleFade(isEnemyAwake, themeSound, dangerSound, audioCtx);
        }).catch(err => {
            console.error("[Music Crossfade] Failed to resume AudioContext:", err);
        });
    } else if (audioCtx.state === 'running') {
        console.log("[MUSIC CALL] AudioContext is running, calling scheduleFade."); // <<< LOG 3
        scheduleFade(isEnemyAwake, themeSound, dangerSound, audioCtx);
    } else {
         console.warn(`[Music Crossfade] AudioContext in unexpected state: ${audioCtx.state}`);
    }
}

// Helper function to schedule the fade after ensuring context is running
function scheduleFade(isEnemyAwake, themeSound, dangerSound, audioCtx) {
    // --- REMOVE Fade Duration and End Time ---
    // const fadeEndTime = audioCtx.currentTime + MUSIC_ANTICIPATION_FADE_DURATION;
    // --------------------------------------
    
    // <<< FIX: Use the volume property directly from the sound object >>>
    // Use the INITIAL volume set during load as the target when 'on'
    const themeTargetVolume = isEnemyAwake ? 0 : (window.loadedSoundsConfig?.themeMusicSound?.volume || THEME_MUSIC_VOLUME); // Read initial config volume
    const dangerTargetVolume = isEnemyAwake ? (window.loadedSoundsConfig?.dangerMusicSound?.volume || DANGER_THEME_VOLUME) : 0; // Read initial config volume
    // <<< END FIX >>>
    const now = audioCtx.currentTime; // Get current time once

    console.log(`[FADE] Scheduling IMMEDIATE volume set for isEnemyAwake = ${isEnemyAwake}. CurrentTime: ${now.toFixed(2)}`); // <<< LOG 4 (Updated)

    // <<< Log gain node value (Still useful for debugging) >>>
    const currentThemeGain = themeSound.gain?.gain?.value ?? 'N/A';
    const currentDangerGain = dangerSound.gain?.gain?.value ?? 'N/A';

    console.log(`[FADE] Current Gains - Theme: ${currentThemeGain.toFixed ? currentThemeGain.toFixed(2) : currentThemeGain}, Danger: ${currentDangerGain.toFixed ? currentDangerGain.toFixed(2) : currentDangerGain}`); // <<< LOG 5
    console.log(`[FADE] Target Volumes (Immediate) - Theme: ${themeTargetVolume}, Danger: ${dangerTargetVolume}`); // <<< LOG 6 (Updated)
    console.log(`[FADE] IsPlaying Flags - Theme: ${themeSound.isPlaying}, Danger: ${dangerSound.isPlaying}`); // <<< LOG 7

    // --- Start sounds only if they are NOT already playing AND need to be ON ---
    if (dangerTargetVolume > 0 && !dangerSound.isPlaying) {
        console.log(`[FADE] Starting danger theme.`); // <<< LOG 8 (Simplified)
        // Set volume low before playing if starting
        dangerSound.setVolume(0.001); 
        console.log(`[Debug scheduleFade] Calling dangerSound.play()`); // <<< ADD Log
        dangerSound.play();
    }
    if (themeTargetVolume > 0 && !themeSound.isPlaying) {
        console.log(`[FADE] Starting normal theme.`); // <<< LOG 9 (Simplified)
        // Set volume low before playing if starting
        themeSound.setVolume(0.001);
        console.log(`[Debug scheduleFade] Calling themeSound.play()`); // <<< ADD Log
        themeSound.play();
    }
    // ---------------------------------------------------------------------------

    // --- REMOVE Gain Ramp Scheduling ---
    /*
    console.log(`[FADE] Scheduling gain ramps to Theme=${themeTargetVolume}, Danger=${dangerTargetVolume} ending at ${fadeEndTime.toFixed(2)}`); // <<< LOG 10
    if (themeSound.gain?.gain) {
        // <<< Explicitly cancel previous ramps and set start value >>>
        themeSound.gain.gain.cancelScheduledValues(now);
        themeSound.gain.gain.setValueAtTime(themeSound.gain.gain.value, now); // Start ramp from current value
        // Use LINEAR ramp for all fades now for testing
        themeSound.gain.gain.linearRampToValueAtTime(themeTargetVolume, fadeEndTime);
        /* // Use exponential ramp for fade-out, linear for fade-in
        if (themeTargetVolume === 0) {
            themeSound.gain.gain.exponentialRampToValueAtTime(0.0001, fadeEndTime);
        } else {
            themeSound.gain.gain.linearRampToValueAtTime(themeTargetVolume, fadeEndTime);
        }
        */
    /*
    } else {
        console.warn("[Music] Theme sound gain node not found!");
    }
    if (dangerSound.gain?.gain) {
         // <<< Explicitly cancel previous ramps and set start value >>>
        dangerSound.gain.gain.cancelScheduledValues(now);
        dangerSound.gain.gain.setValueAtTime(dangerSound.gain.gain.value, now); // Start ramp from current value
        // Use LINEAR ramp for all fades now for testing
        dangerSound.gain.gain.linearRampToValueAtTime(dangerTargetVolume, fadeEndTime);
        /* // Use exponential ramp for fade-out, linear for fade-in
        if (dangerTargetVolume === 0) {
            dangerSound.gain.gain.exponentialRampToValueAtTime(0.0001, fadeEndTime);
        } else {
            dangerSound.gain.gain.linearRampToValueAtTime(dangerTargetVolume, fadeEndTime);
        }
        */
    /*
    } else {
        console.warn("[Music] Danger sound gain node not found!");
    }
    */
    // ---------------------------

    // --- SET VOLUME IMMEDIATELY using setVolume() ---
    console.log(`[FADE] Setting volumes IMMEDIATELY - Theme: ${themeTargetVolume}, Danger: ${dangerTargetVolume}`);
    if (themeSound) {
        themeSound.setVolume(themeTargetVolume);
    }
    if (dangerSound) {
        dangerSound.setVolume(dangerTargetVolume);
    }
    // ---------------------------------------------

    // --- Stop sounds IMMEDIATELY if target volume is 0 --- 
    console.log(`[FADE] Checking if sounds should stop immediately.`);
    if (themeTargetVolume < 0.01 && themeSound.isPlaying) { 
        themeSound.stop(); 
        console.log("[Music] Stopped theme sound immediately.");
    }
    if (dangerTargetVolume < 0.01 && dangerSound.isPlaying) { 
        dangerSound.stop(); 
        console.log("[Music] Stopped danger sound immediately.");
    }
    // --- REMOVE setTimeout check ---
    /*
    setTimeout(() => {
        // <<< Use gain node value for check >>>
        const postFadeThemeGain = themeSound.gain?.gain?.value ?? -1; // Use -1 if unavailable
        const postFadeDangerGain = dangerSound.gain?.gain?.value ?? -1; // Use -1 if unavailable
         console.log(`[Music Post-Fade Check] Time: ${audioCtx.currentTime.toFixed(2)} TargetGains - Theme: ${themeTargetVolume}, Danger: ${dangerTargetVolume} | ActualGains - Theme: ${postFadeThemeGain.toFixed(2)}, Danger: ${postFadeDangerGain.toFixed(2)}`);

        if (themeTargetVolume < 0.01 && postFadeThemeGain < 0.01 && themeSound.isPlaying) { 
            themeSound.stop(); 
            console.log("[Music] Stopped theme sound post-fade.");
        }
        if (dangerTargetVolume < 0.01 && postFadeDangerGain < 0.01 && dangerSound.isPlaying) { 
            dangerSound.stop(); 
            console.log("[Music] Stopped danger sound post-fade.");
        }
    }, (MUSIC_ANTICIPATION_FADE_DURATION + 0.2) * 1000); // Check 0.2s after fade ends
    */
    // -----------------------------------------
}
// -------------------------------

// --- Resource Management Functions ---
// export function hasResources(seedCost, fuelCost) { ... } // Check happens in main.js
// export function spendResources(seedCost, fuelCost) { ... } // Deduction happens in main.js/rocket.js

// Exports (Ensure this is the LAST thing in the file)
export {
    // Core resource functions
    initResources,
    updateResources,
    // UI functions
    createInventoryUI,
    updateInventoryDisplay, 
    // Audio Loading
    loadAudio, 
    // Specific Sound Playback/Control Functions
    playRocketLaunchSound, 
    playImpactSound,
    startRollingSound,
    setRollingSoundLoop,
    setRollingSoundVolume,
    stopRollingSound,
    playBoostBurstSound, 
    playBoostRiseSound,
    stopBoostRiseSound,
    // Simplified Pal Sound Control
    startPalMovementSound,
    stopPalMovementSound,
    // Arrival Sound
    playPalArrivalSound, 
    // Player Sounds (NEW)
    playPlayerJumpSound,
    playPlayerLandSound,
    playInventoryFullSound,
    playTerraformReadySound,
    // --- Add new exports --- 
    playThemeMusic,
    playTerraformSuccessSound,
    playSlowdownSound,
    // --- New exports ---
    enemyRoarSound,
    alarmSirenSound,
    dangerMusicSound,
    playAppropriateMusic,
    // --- Add model/animation exports ---
    techApertureModelProto,
    techApertureModelAnimations,
    seedModelProto,
    mossyLogModelProto,
    // --- Add model loading promises ---
    seedModelLoadPromise,
    mossyLogModelLoadPromise,
    fuelModelLoadPromise,
    techApertureModelLoadPromise,
    // --- Add music volume constants ---
    THEME_MUSIC_VOLUME,
    DANGER_THEME_VOLUME,
    // --- Add audio listener reference ---
    audioListenerRef,
    // --- Add sun impact sound function ---
    playSunImpactSound,
    // --- Add resource arrays ---
    seedGems // Export the seedGems array
};

// Floating Number System
const floatingNumberPool = [];
const MAX_POOL_SIZE = 10;
let floatingNumberCanvas = null;
let floatingNumberTexture = null;

// Initialize the floating number system
function initFloatingNumbers() {
    // Create a single shared canvas and texture
    floatingNumberCanvas = document.createElement('canvas');
    floatingNumberCanvas.width = 128;
    floatingNumberCanvas.height = 128;
    floatingNumberTexture = new THREE.CanvasTexture(floatingNumberCanvas);
    
    // Pre-create some sprites
    for (let i = 0; i < MAX_POOL_SIZE; i++) {
        const material = new THREE.SpriteMaterial({
            map: floatingNumberTexture,
            transparent: true,
            depthTest: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.visible = false;
        homePlanetRef.add(sprite);
        floatingNumberPool.push({
            sprite,
            material,
            inUse: false
        });
    }
}

// Create floating number using object pooling
function createFloatingNumber(value, position, color = 0xff0000) {
    // Find an available sprite from the pool
    const numberObj = floatingNumberPool.find(obj => !obj.inUse);
    if (!numberObj) return; // No available sprites
    
    // Draw the number on the shared canvas
    const context = floatingNumberCanvas.getContext('2d');
    context.clearRect(0, 0, 128, 128);
    context.font = 'bold 48px Arial';
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`+${value}`, 64, 64);
    
    // Update the shared texture
    floatingNumberTexture.needsUpdate = true;
    
    // Set up the sprite
    const sprite = numberObj.sprite;
    sprite.position.copy(position);
    sprite.position.y += 3;
    sprite.scale.set(4, 4, 1);
    sprite.material.opacity = 1;
    sprite.visible = true;
    numberObj.inUse = true;
    
    // Simple animation using setTimeout instead of requestAnimationFrame
    const startTime = performance.now();
    const duration = 1000;
    
    function updateNumber() {
        const elapsed = performance.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1) {
            sprite.position.y += 0.02;
            sprite.material.opacity = 1 - progress;
            setTimeout(updateNumber, 16); // ~60fps
        } else {
            // Return to pool
            sprite.visible = false;
            numberObj.inUse = false;
        }
    }
    
    updateNumber();
}

// NEW: Function to play sun impact sound
function playSunImpactSound() {
    if (sunImpactSound && sunImpactSound.buffer) {
        if (sunImpactSound.isPlaying) {
            sunImpactSound.stop();
        }
        sunImpactSound.play();
    }
}
