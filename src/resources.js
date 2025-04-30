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

// --- Cooldown Tracking ---
let lastPalArrivalSoundTime = 0;

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
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone()); // Clone material for independent opacity
        particle.position.copy(originLocalPosition);

        // Random outward velocity
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        velocity.normalize().multiplyScalar(PARTICLE_SPEED);

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
            console.log(`[ParticleDebug Calc] i=${i} Vel=(${pData.velocity.x.toFixed(2)}, ${pData.velocity.y.toFixed(2)}, ${pData.velocity.z.toFixed(2)}) dT=${deltaTime.toFixed(4)}`);
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
            const itemData = { gem: item, type: resourceType }; 
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
function generateDecorativeItems(count, modelProto, scale, homePlanet, planetsState) {
    const placedPositions = []; // Track positions of items placed in *this* call
    const maxAttemptsPerItem = 50;
    const modelUp = new THREE.Vector3(0, 1, 0); // Assume Y-up for model
    const alignmentQuaternion = new THREE.Quaternion();
    const planetRadius = homePlanet.geometry.parameters.radius;
    // Use same offset as trees for now, adjust if needed
    const verticalOffset = 0.1; 

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

            // Position and Align
            const surfaceNormal = position.clone().normalize();
            alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
            item.quaternion.copy(alignmentQuaternion);

            const finalInitialPos = position.clone().normalize().multiplyScalar(planetRadius + verticalOffset);
            item.position.copy(finalInitialPos);
            
            homePlanet.add(item); // Add directly to the planet scene graph
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

    // --- Load Seed (Tree) Model Asynchronously ---
    const seedLoader = new GLTFLoader();
    seedLoader.load(
        'models/tree/tree.gltf', // Path to your tree model
        function (gltf) { // Success callback
            console.log('Seed (Tree) GLTF model loaded.');
            seedModelProto = gltf.scene;

            // Ensure correct material properties if needed (apply to children)
            seedModelProto.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Optional: Adjust material if needed, e.g., roughness, metalness
                }
            });

            // --- Generate Seeds ONLY AFTER tree model is loaded ---
            console.log('Generating seed items using loaded tree model...');
    generateVisualResources(config.INITIAL_SEED_GEMS, config.SEED_GEM_COLOR, 'seeds', seedGems, homePlanet, planetsState);
            // ------------------------------------------------------

        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the seed (tree) GLTF:', error);
        }
    );
    // --- End Seed (Tree) Model Loading ---

    // --- Load Mossy Log Model Asynchronously ---
    const logLoader = new GLTFLoader();
    logLoader.load(
        'models/mossy_log/mossy_log.gltf', // Adjust path if needed
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

            // --- Generate Decorative Logs ONLY AFTER model is loaded ---
            console.log('Generating decorative mossy logs...');
            generateDecorativeItems(config.NUM_MOSSY_LOGS, mossyLogModelProto, config.MOSSY_LOG_SCALE, homePlanet, planetsState);
            // -----------------------------------------------------------

        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the mossy log GLTF:', error);
        }
    );
    // --- End Mossy Log Model Loading ---

    // --- Load Fuel Model Asynchronously ---
    const fuelLoader = new GLTFLoader(); // Use a separate constant name
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
                }
            });

            // --- Generate Fuel Items ONLY AFTER model is loaded ---
            console.log('Generating fuel items using loaded crystal model...');
    generateVisualResources(config.INITIAL_FUEL_ITEMS, config.FUEL_ITEM_COLOR, 'fuel', fuelItems, homePlanet, planetsState);
            // ------------------------------------------------------

        },
        undefined, // onProgress callback (optional)
        function (error) { // Error callback
            console.error('An error happened loading the fuel crystal GLTF:', error);
        }
    );
    // --- End Fuel Model Loading ---

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
                if (itemGroup.type === 'fuel') {
                    // Check if already full before collecting
                    const wasFuelFull = inventory.fuel >= config.MAX_FUEL;
                    if (!wasFuelFull) {
                        inventory.fuel = Math.min(config.MAX_FUEL, inventory.fuel + config.FUEL_PER_PICKUP);
                        playFuelPickupSound();
                        updateInventoryDisplay();
                        spawnFuelParticles(itemGroup.gem.position);
                        scheduleItemRemoval(itemGroup, now, itemsToRemove);
                        // Check if *now* full
                        if (inventory.fuel >= config.MAX_FUEL) {
                            playInventoryFullSound();
                        }
                    }
                } else if (itemGroup.type === 'seeds') {
                     // Check if already full before collecting
                     const wasSeedsFull = inventory.seeds >= config.MAX_SEEDS;
                     if (!wasSeedsFull) {
                        inventory.seeds++;
                        playSeedPickupSound(); // Plays treefall sound
                        updateInventoryDisplay(); 
                        scheduleItemRemoval(itemGroup, now, itemsToRemove);
                        // Check if *now* full
                        if (inventory.seeds >= config.MAX_SEEDS) {
                            playInventoryFullSound();
                        }
                    }
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
                     // Optionally remove this invalid item from queue?
                     // regeneratedIndices.push(index); // Mark for removal if invalid
                     return; 
                }

                playerSphere.getWorldPosition(_playerWorldPos);
                // Use homePlanetRef for consistency
                const potentialWorldPos = homePlanetRef.localToWorld(position.clone());
                const playerDistSq = _playerWorldPos.distanceToSquared(potentialWorldPos);
                const safeFromPlayer = playerDistSq > (config.COLLECTION_DISTANCE * config.COLLECTION_DISTANCE * 4);
                // Combine current items for collision check during respawn
                const combinedItems = [...seedGems, ...fuelItems]; 

                if (!isTooCloseToOtherGems(position, combinedItems, config.MIN_GEM_DISTANCE) && safeFromPlayer) {
                    let newItem;
                    if(collectedItem.type === 'seeds') {
                         // --- NEW: Respawn Seed (Tree) Model ---
                          if (!seedModelProto) {
                             console.warn("Seed (Tree) prototype not loaded, cannot respawn seed yet.");
                             return; // Skip this respawn attempt
                          }
                          newItem = seedModelProto.clone(true);
                          newItem.gemType = collectedItem.type;
                          const treeScale = .5; // Use consistent scale
                          newItem.scale.set(treeScale, treeScale, treeScale);
                          const surfaceNormal = position.clone().normalize();
                          const modelUp = new THREE.Vector3(0, 1, 0); // Y-up
                          const alignmentQuaternion = new THREE.Quaternion();
                          alignmentQuaternion.setFromUnitVectors(modelUp, surfaceNormal);
                          newItem.quaternion.copy(alignmentQuaternion);
                          const planetRadius = homePlanetRef.geometry.parameters.radius;
                          const verticalOffset = 0.1; // Consistent offset
                          const finalPos = position.clone().normalize().multiplyScalar(planetRadius + verticalOffset);
                          newItem.position.copy(finalPos); // Position parent origin
                          newItem.originalPosition = finalPos.clone(); // Store adjusted position
                          // -------------------------------------
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
    console.log("[Pal Sound] Played Pal Arrival Sound"); 
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
    console.log("[Player Sound] Played Jump Sound"); // Debug Log
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
    console.log("[Player Sound] Played Land Sound"); // Debug Log
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

// Function to load all audio assets and return a Promise
function loadAudio(listener) {
    return new Promise((resolve, reject) => { 
        audioListenerRef = listener; 
        const loader = new THREE.AudioLoader();
        let soundsLoaded = 0;
        const totalSoundsToLoad = 16; // <<< INCREMENTED total sound count (from 15)
        const loadedSounds = {}; 

        const checkAllLoaded = () => {
            soundsLoaded++;
            console.log(`[Audio Load] Loaded sound ${soundsLoaded} / ${totalSoundsToLoad}`);
            if (soundsLoaded === totalSoundsToLoad) {
                console.log("All audio loaded successfully.");
                resolve(loadedSounds); // Resolve the main promise WITH the sounds object
            }
        };

        const onError = (url, err) => {
             console.error(`Error loading sound: ${url}`, err);
             // Optionally reject, or just log and continue?
             // For now, let's count it as "loaded" (but failed) to not block forever
             checkAllLoaded(); 
             // reject(new Error(`Failed to load sound: ${url}`)); // Alternative: Fail fast
        };

        // Load SEED pickup sound
        loader.load('sfx/treefall.mp3', 
            (buffer) => { 
                pickupSound = new THREE.Audio(audioListenerRef);
                pickupSound.setBuffer(buffer);
                pickupSound.setVolume(0.5);
                pickupSound.setLoop(false);
                loadedSounds.pickupSound = pickupSound; // Store reference
                console.log("Seed (treefall) pickup sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/treefall.mp3', err)
        );

        // Load FUEL pickup sound
        loader.load('sfx/stone-break.wav', 
            (buffer) => {
                fuelPickupSound1 = new THREE.Audio(audioListenerRef);
                fuelPickupSound1.setBuffer(buffer);
                fuelPickupSound1.setLoop(false);
                fuelPickupSound1.setVolume(0.5);
                loadedSounds.fuelPickupSound = fuelPickupSound1; // Store reference
                console.log("Fuel pickup sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/stone-break.wav', err)
        );

        // Load rocket launch sound
        loader.load('sfx/rocketsound.mp3', 
            (buffer) => {
                rocketLaunchSound = new THREE.Audio(audioListenerRef);
                rocketLaunchSound.setBuffer(buffer);
                rocketLaunchSound.setLoop(false); 
                rocketLaunchSound.setVolume(0.6);
                loadedSounds.rocketLaunchSound = rocketLaunchSound; // Store reference
                console.log("Rocket launch sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/rocketsound.mp3', err)
        );

        // Load impact sound
        loader.load('sfx/impact-sound.mp3', 
            (buffer) => {
                impactSound = new THREE.Audio(audioListenerRef);
                impactSound.setBuffer(buffer);
                impactSound.setLoop(false); 
                impactSound.setVolume(0.7); 
                loadedSounds.impactSound = impactSound; // Store reference
                console.log("Impact sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/impact-sound.mp3', err)
        );

        // Load rolling sound
        loader.load('sfx/rolling-sound.mp3', 
            (buffer) => {
                rollingSound = new THREE.Audio(audioListenerRef);
                rollingSound.setBuffer(buffer);
                rollingSound.setLoop(true); 
                rollingSound.setVolume(config.ROLLING_SOUND_BASE_VOLUME);
                loadedSounds.rollingSound = rollingSound; // Store reference
                console.log("Rolling sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/rolling-sound.mp3', err)
        );

        // Load ambient sound
        loader.load('sfx/wind-soft-crickets.wav', 
            (buffer) => {
                ambientSound = new THREE.Audio(audioListenerRef); 
                ambientSound.setBuffer(buffer);
                ambientSound.setLoop(true);
                ambientSound.setVolume(0.3);
                loadedSounds.ambientSound = ambientSound; // Store reference
                console.log("Ambient sound loaded."); 
                // --- REMOVED DEBUG and WINDOW ASSIGNMENT ---
                // console.log(`[Audio Load DEBUG] Ambient check: ...`);
                // window.ambientSound = ambientSound; 
                // console.log(`[Audio Load DEBUG] Assigned to window.ambientSound.`);
                // -----------------------------------------
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/wind-soft-crickets.wav', err)
        );

        // Load Boost Burst Sound
        loader.load('sfx/boost_burst.mp3', 
            (buffer) => {
                boostBurstSound = new THREE.PositionalAudio(audioListenerRef);
                boostBurstSound.setBuffer(buffer);
                boostBurstSound.setRefDistance(10);
                boostBurstSound.setRolloffFactor(1);
                boostBurstSound.setVolume(0.6); 
                boostBurstSound.loop = false;
                loadedSounds.boostBurstSound = boostBurstSound; // Store reference
                console.log("Boost Burst sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/boost_burst.mp3', err)
        );

        // Load Boost Rise Sound
        loader.load('sfx/boost_rise.mp3', 
            (buffer) => {
                boostRiseSound = new THREE.PositionalAudio(audioListenerRef);
                boostRiseSound.setBuffer(buffer);
                boostRiseSound.setRefDistance(15);
                boostRiseSound.setRolloffFactor(1);
                boostRiseSound.setVolume(0.5); 
                boostRiseSound.loop = false; 
                loadedSounds.boostRiseSound = boostRiseSound; // Store reference
                console.log("Boost Rise sound loaded.");
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/boost_rise.mp3', err)
        );

        // --- Load Pal Movement Sound (CHANGED to PositionalAudio) ---
        loader.load('sfx/pal/palmovement-sound.wav', 
            (buffer) => {
                palMovementSound = new THREE.PositionalAudio(audioListenerRef); // *** CHANGED ***
                palMovementSound.setBuffer(buffer);
                palMovementSound.setLoop(true); 
                palMovementSound.setVolume(config.PAL_MOVE_SOUND_BASE_VOLUME); // Base volume at ref distance
                palMovementSound.setRefDistance(config.PAL_SOUND_REF_DISTANCE); // *** ADDED ***
                palMovementSound.setRolloffFactor(config.PAL_SOUND_ROLLOFF_FACTOR); // *** ADDED ***
                loadedSounds.palMovementSound = palMovementSound; 
                console.log("Pal movement sound loaded (Positional)."); 
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/pal/palmovement-sound.wav', err)
        );
        // -------------------------------------

        // --- Load Pal Arrival Sound (remains the same) ---
        loader.load('sfx/pal/yes.wav', 
            (buffer) => {
                palArrivalSound = new THREE.Audio(audioListenerRef); 
                palArrivalSound.setBuffer(buffer);
                palArrivalSound.setLoop(false);
                palArrivalSound.setVolume(0.9); // Slightly louder maybe?
                loadedSounds.palArrivalSound = palArrivalSound; // Store reference
                console.log("Pal arrival sound loaded."); 
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/pal/yes.wav', err)
        );
        // -----------------------------------

        // --- Load Player Jump Sound (NEW) ---
        loader.load('sfx/jump-sound.mp3', 
            (buffer) => {
                playerJumpSound = new THREE.Audio(audioListenerRef); 
                playerJumpSound.setBuffer(buffer);
                playerJumpSound.setLoop(false);
                playerJumpSound.setVolume(0.6); // Adjust volume as needed
                loadedSounds.playerJumpSound = playerJumpSound; // Store reference
                console.log("Player jump sound loaded."); 
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/jump-sound.mp3', err)
        );
        // -----------------------------------

        // --- Load Player Land Sound (NEW) ---
        loader.load('sfx/skid-sound.mp3', 
            (buffer) => {
                playerLandSound = new THREE.Audio(audioListenerRef); 
                playerLandSound.setBuffer(buffer);
                playerLandSound.setLoop(false);
                playerLandSound.setVolume(0.35); // Adjust volume as needed (Reduced from 0.7)
                loadedSounds.playerLandSound = playerLandSound; // Store reference
                console.log("Player land sound loaded."); 
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/skid-sound.mp3', err)
        );
        // -----------------------------------

        // --- Load Inventory Full Sound (NEW) ---
        loader.load('sfx/collect-sound.wav', 
            (buffer) => {
                inventoryFullSound = new THREE.Audio(audioListenerRef); 
                inventoryFullSound.setBuffer(buffer);
                inventoryFullSound.setLoop(false);
                inventoryFullSound.setVolume(0.7); // Adjust volume as needed
                loadedSounds.inventoryFullSound = inventoryFullSound; // Store reference
                console.log("Inventory full sound loaded."); 
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/collect-sound.wav', err)
        );
        // -----------------------------------

        // --- Load Terraform Ready Sound (NEW) ---
        loader.load('sfx/terraform-ready-sound.mp3', 
            (buffer) => {
                terraformReadySound = new THREE.Audio(audioListenerRef); 
                terraformReadySound.setBuffer(buffer);
                terraformReadySound.setLoop(false);
                terraformReadySound.setVolume(0.8); // Adjust volume as needed
                loadedSounds.terraformReadySound = terraformReadySound; // Store reference
                console.log("Terraform ready sound loaded."); 
                checkAllLoaded();
            }, 
            undefined, 
            (err) => onError('sfx/terraform-ready-sound.mp3', err)
        );
        // -----------------------------------

        // --- Load Theme Music (Add Back) ---
        loader.load('sfx/StarSeedTheme.mp3', 
            (buffer) => {
                const themeMusicSound = new THREE.Audio(audioListenerRef); 
                themeMusicSound.setBuffer(buffer);
                themeMusicSound.setLoop(true); 
                themeMusicSound.setVolume(0.4); 
                loadedSounds.themeMusicSound = themeMusicSound;
                console.log("Theme music loaded."); 
                checkAllLoaded();
            }, 
            undefined, // onProgress
            (err) => onError('sfx/StarSeedTheme.mp3', err)
        );
        // -----------------------------------

        // --- Load Terraform Success Sound (NEW) ---
        loader.load('sfx/terraformsucces.mp3', 
            (buffer) => {
                const terraformSuccessSound = new THREE.Audio(audioListenerRef); 
                terraformSuccessSound.setBuffer(buffer);
                terraformSuccessSound.setLoop(false); // Non-looping
                terraformSuccessSound.setVolume(0.7); // Adjust volume as needed
                loadedSounds.terraformSuccessSound = terraformSuccessSound; // Add to the object
                console.log("Terraform success sound loaded."); 
                checkAllLoaded();
            }, 
            undefined, // onProgress
            (err) => onError('sfx/terraformsucces.mp3', err)
        );
        // -----------------------------------

    }); // End of Promise wrapper
}

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
    playTerraformReadySound, // NEW Export
    // --- Add new exports --- 
    playThemeMusic,
    playTerraformSuccessSound
    // -----------------------
    // Add any other functions from this module that need exporting
}; 
