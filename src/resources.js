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
            // Moved the seed generation here!
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
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '20px';
    container.style.left = '20px';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px'; // Slightly smaller font
    container.style.userSelect = 'none';
    container.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
    
    // Seeds Display
    const seedsElement = document.createElement('div');
    seedsElement.id = 'seeds-display';
    container.appendChild(seedsElement);

    // Fuel Display (Add this)
    const fuelElement = document.createElement('div');
    fuelElement.id = 'fuel-display';
    fuelElement.style.marginTop = '5px';
    container.appendChild(fuelElement);

    // Launch Prompt Display
    const launchPromptElement = document.createElement('div');
    launchPromptElement.id = 'launch-prompt';
    launchPromptElement.style.marginTop = '5px'; // Add some space
    launchPromptElement.style.color = '#00ff00'; // Green color for prompt
    launchPromptElement.style.display = 'none'; // Hidden initially
    container.appendChild(launchPromptElement);

    document.body.appendChild(container);
    updateInventoryDisplay(); // Call initially to set text content
}

// Update Inventory Display including Launch Prompt & Fuel
function updateInventoryDisplay() {
    const seedsElement = document.getElementById('seeds-display');
    const fuelElement = document.getElementById('fuel-display');
    const launchPromptElement = document.getElementById('launch-prompt');

    if (seedsElement) {
        seedsElement.textContent = `Seeds: ${inventory.seeds} / ${config.MAX_SEEDS}`;
    }
    if (fuelElement) {
        // Format fuel nicely, maybe only show integer part
        fuelElement.textContent = `Fuel: ${Math.floor(inventory.fuel)} / ${config.MAX_FUEL}`;
    }

    // Launch Prompt Update - This needs more context from main.js about player proximity and target
    // We will update this logic later in main.js step
    if (launchPromptElement) {
         // Placeholder - logic will move to main.js
        launchPromptElement.style.display = 'none'; 
        // Example of what it might show (needs seed/fuel cost calculated in main):
        // launchPromptElement.textContent = `Launch ${numSeeds} seeds (Cost: ${fuelCost} Fuel)? [Space]`;
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
                    // Original Fuel Collection Logic
                    if (inventory.fuel < config.MAX_FUEL) {
                        inventory.fuel = Math.min(config.MAX_FUEL, inventory.fuel + config.FUEL_PER_PICKUP);
                        playFuelPickupSound();
                        updateInventoryDisplay();
                        spawnFuelParticles(itemGroup.gem.position);
                        scheduleItemRemoval(itemGroup, now, itemsToRemove);
                    }
                } else if (itemGroup.type === 'seeds') {
                     // Original Seed Collection Logic (without magnetism pull)
                     if (inventory.seeds < config.MAX_SEEDS) {
                        inventory.seeds++;
                        playSeedPickupSound(); // Plays treefall sound
                        updateInventoryDisplay(); 
                        scheduleItemRemoval(itemGroup, now, itemsToRemove);
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

// Function to load all audio assets and return a Promise
function loadAudio(listener) {
    return new Promise((resolve, reject) => { // Wrap in a Promise
        audioListenerRef = listener; // Store listener reference
        const loader = new THREE.AudioLoader();
        let soundsLoaded = 0;
        const totalSoundsToLoad = 8; // **UPDATE THIS COUNT** if you add/remove sounds
        const loadedSounds = {}; // Object to store loaded sound references

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

// --- Resource Management Functions ---
// export function hasResources(seedCost, fuelCost) { ... } // Check happens in main.js
// export function spendResources(seedCost, fuelCost) { ... } // Deduction happens in main.js/rocket.js

// Exports
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
    stopBoostRiseSound
    // Add any other functions from this module that need exporting
}; 
