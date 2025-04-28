import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { getRandomPositionOnPlanet, isTooCloseToOtherGems } from './utils.js';

// Store references passed from main.js
let sceneRef = null;
let homePlanetRef = null;
let planetsStateRef = null;
let audioListenerRef = null;

// Module-level variables for resources and inventory
let seedGems = [];
let fuelItems = []; // Add array for fuel items
export let inventory = {
    seeds: config.INITIAL_SEEDS,
    fuel: config.INITIAL_FUEL
    // Removed maxSeeds, maxFuel - add back if caps needed
    // Removed isLaunchReady - check happens at launch time
};

// --- Audio Variables ---
let pickupSound = null;
let soundSegments = config.pickupSoundSegments; // Restore: Use segments from config
let lastSegmentIndex = -1; // Restore: Track last played segment

// Array to track collected seeds for regeneration
const collectedSeedsQueue = [];
const collectedFuelQueue = []; // Add queue for fuel regeneration

// Temporary vectors
const _tempMatrix = new THREE.Matrix4();
const _gemWorldPos = new THREE.Vector3();
const _homePlanetWorldPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();

// Create Gem Cube Mesh (keeping generic name for potential reuse)
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
    cube.position.copy(position);
    cube.gemType = gemType;
    cube.castShadow = true;
    cube.receiveShadow = true; 
    // Store original local position for respawning
    cube.originalPosition = position.clone(); 
    return cube;
}

// Generate Visual Resource Items (renamed for clarity)
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
            // Check against ALL existing visuals
        } while (isTooCloseToOtherGems(position, allCurrentVisuals, config.MIN_GEM_DISTANCE) && attempts < maxAttempts);

        if (attempts < maxAttempts) {
            const item = createCube(config.GEM_SIZE, color, position, resourceType);
            homePlanet.add(item);
            const itemData = { gem: item, type: resourceType }; // Use generic 'item' term
            resourceArray.push(itemData);
            allCurrentVisuals.push(itemData); // Add to the combined list for subsequent checks
        } else {
            console.warn(`Could not place a ${resourceType} resource after ${maxAttempts} attempts.`);
        }
    }
}

// Initialize Resources (renamed from initGems)
function initResources(scene, homePlanet, planetsState, audioListener) {
    console.log("Resources INIT: Initializing...");
    sceneRef = scene;
    homePlanetRef = homePlanet;
    planetsStateRef = planetsState;
    audioListenerRef = audioListener;

    // Generate Seeds
    generateVisualResources(config.INITIAL_SEED_GEMS, config.SEED_GEM_COLOR, 'seeds', seedGems, homePlanet, planetsState);
    // Generate Fuel Items
    generateVisualResources(config.INITIAL_FUEL_ITEMS, config.FUEL_ITEM_COLOR, 'fuel', fuelItems, homePlanet, planetsState);

    // Setup audio
    const listener = audioListenerRef; // Ensure listener is valid
    if (listener) {
        pickupSound = new THREE.Audio(listener);
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('sfx/resource-pickup-sound.mp3', function(buffer) {
            pickupSound.setBuffer(buffer);
            // pickupSound.setLoop(false); // Ensure it doesn't loop
            pickupSound.setVolume(0.4);
            console.log("Pickup sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading pickup sound:', err);
        });
    } else {
        console.warn("Audio Listener not available, pickup sound disabled.");
    }

    console.log("Resources INIT: Finished.");
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
    const fuelElement = document.getElementById('fuel-display'); // Get fuel element
    const launchPromptElement = document.getElementById('launch-prompt');

    if (seedsElement) {
        seedsElement.textContent = `Seeds: ${inventory.seeds} / ${config.MAX_SEEDS}`;
    }
    // Update Fuel display
    if (fuelElement) {
        fuelElement.textContent = `Fuel: ${inventory.fuel.toFixed(0)} / ${config.MAX_FUEL}`;
    }

    // Update launch readiness state
    inventory.isLaunchReady = inventory.seeds >= config.ROCKET_FUEL_COST;

    if (launchPromptElement) {
        if (inventory.isLaunchReady) {
            launchPromptElement.textContent = `Ready to Launch [Spacebar] (Cost: ${config.ROCKET_FUEL_COST} Seeds)`;
            launchPromptElement.style.display = 'block'; // Show prompt
        } else {
            launchPromptElement.style.display = 'none'; // Hide prompt
        }
    } else {
        console.error("UI element #launch-prompt not found.");
    }
}

// Function to check if launch is affordable
function canAffordLaunch() {
    return inventory.seeds >= config.ROCKET_FUEL_COST;
}

// Function to spend SEEDS for launch
function spendLaunchFuel() { // Maybe rename to spendLaunchCost?
    if (canAffordLaunch()) {
        inventory.seeds -= config.ROCKET_FUEL_COST;
        updateInventoryDisplay(); // Update UI after spending seeds
        return true;
    } else {
        console.warn("Attempted to spend launch seeds, but not enough.");
        return false;
    }
}

// Function to consume fuel during flight (called by rocket.js)
// Returns true if fuel was consumed, false otherwise
function consumeRocketFuel(deltaTime) {
    if (inventory.fuel > 0) {
        const fuelConsumed = config.FUEL_CONSUMPTION_RATE * deltaTime;
        inventory.fuel = Math.max(0, inventory.fuel - fuelConsumed); // Consume and clamp at 0
        updateInventoryDisplay(); // Update UI
        return true;
    }
    return false;
}

// Update Resources (renamed from updateGems)
function updateResources(scene, playerSphere, homePlanet, audioListener) {
    const itemsToRemove = []; // Generic name
    const now = performance.now() / 1000; // Current time in seconds

    // --- Update Visual Items (Seeds and Fuel) ---
    const allItems = [...seedGems, ...fuelItems]; // Combine for iteration

    allItems.forEach((itemGroup, index) => {
        if (!itemGroup.gem) {
            // console.warn("Skipping update for missing item:", itemGroup);
            return;
        }

        playerSphere.getWorldPosition(_playerWorldPos);
        itemGroup.gem.getWorldPosition(_gemWorldPos);
        const distanceToPlayer = _playerWorldPos.distanceTo(_gemWorldPos);

        // Magnetism effect
        if (distanceToPlayer < config.GEM_MAGNET_DISTANCE) {
            homePlanet.getWorldPosition(_homePlanetWorldPos); // Need planet pos for local conversion
            const directionToPlayer = new THREE.Vector3().subVectors(_playerWorldPos, _gemWorldPos).normalize();
            const moveDistance = config.GEM_MAGNET_STRENGTH * (1 - distanceToPlayer / config.GEM_MAGNET_DISTANCE);
            const worldMoveVector = directionToPlayer.multiplyScalar(moveDistance);
            const newWorldPos = _gemWorldPos.add(worldMoveVector);
            const localPos = homePlanet.worldToLocal(newWorldPos.clone());
            itemGroup.gem.position.copy(localPos);

            // Check for collection
            if (distanceToPlayer < config.COLLECTION_DISTANCE) {
                 // Store collected item info for regeneration
                const collectionQueue = itemGroup.type === 'seeds' ? collectedSeedsQueue : collectedFuelQueue;
                if (itemGroup.gem && itemGroup.gem.originalPosition) {
                    collectionQueue.push({
                        originalPosition: itemGroup.gem.originalPosition,
                        collectedTime: now,
                        type: itemGroup.type // Store type for regeneration
                    });
                } else {
                     console.warn("Collected item missing originalPosition:", itemGroup.gem);
                }

                // Add to removal list (need original array and index)
                // We need a way to know which array (seedGems/fuelItems) this came from.
                // Let's find the index in the original arrays.
                let originalIndex = -1;
                if (itemGroup.type === 'seeds') {
                    originalIndex = seedGems.findIndex(sg => sg.gem === itemGroup.gem);
                } else if (itemGroup.type === 'fuel') {
                    originalIndex = fuelItems.findIndex(fi => fi.gem === itemGroup.gem);
                }
                
                if (originalIndex !== -1) {
                    itemsToRemove.push({ 
                        arrayType: itemGroup.type, // 'seeds' or 'fuel'
                        index: originalIndex, 
                        gem: itemGroup.gem 
                    });
                } else {
                    console.warn("Could not find collected item in original array?", itemGroup);
                }

                // Increment correct inventory
                if (itemGroup.type === 'seeds') {
                    if (inventory.seeds < config.MAX_SEEDS) inventory.seeds++;
                } else if (itemGroup.type === 'fuel') {
                    if (inventory.fuel < config.MAX_FUEL) inventory.fuel++;
                }
                updateInventoryDisplay();
                playPickupSound(); // Call sound function on collection
            }
        }
    });

    // Remove collected items after iteration
    for (let i = itemsToRemove.length - 1; i >= 0; i--) {
        const item = itemsToRemove[i];
        homePlanet.remove(item.gem); 
        if (item.gem.geometry) item.gem.geometry.dispose();
        if (item.gem.material) item.gem.material.dispose();

        // Splice from the correct original array
        if (item.arrayType === 'seeds') {
            seedGems.splice(item.index, 1);
        } else if (item.arrayType === 'fuel') {
            fuelItems.splice(item.index, 1);
        }
    }

    // --- Check for Item Regeneration (Seeds and Fuel) ---
    const regeneratedSeedIndices = [];
    const regeneratedFuelIndices = [];

    function checkRegeneration(queue, itemArray, regenTime, color, regeneratedIndices) {
        queue.forEach((collectedItem, index) => {
            if (now > collectedItem.collectedTime + regenTime) {
                const position = collectedItem.originalPosition;
                playerSphere.getWorldPosition(_playerWorldPos);
                const potentialWorldPos = homePlanet.localToWorld(position.clone());
                const playerDistSq = _playerWorldPos.distanceToSquared(potentialWorldPos);
                const safeFromPlayer = playerDistSq > (config.COLLECTION_DISTANCE * config.COLLECTION_DISTANCE * 4);
                const combinedItems = [...seedGems, ...fuelItems]; // Check against all items

                if (!isTooCloseToOtherGems(position, combinedItems, config.MIN_GEM_DISTANCE) && safeFromPlayer) {
                    const newItem = createCube(config.GEM_SIZE, color, position, collectedItem.type);
                    homePlanet.add(newItem);
                    itemArray.push({ gem: newItem, type: collectedItem.type });
                    regeneratedIndices.push(index);
                } else {
                    // Optionally delay regeneration check if blocked
                    // collectedItem.collectedTime = now;
                }
            }
        });
    }

    // Check Seed Regeneration
    checkRegeneration(collectedSeedsQueue, seedGems, config.SEED_REGEN_TIME, config.SEED_GEM_COLOR, regeneratedSeedIndices);
    // Check Fuel Regeneration
    checkRegeneration(collectedFuelQueue, fuelItems, config.FUEL_REGEN_TIME, config.FUEL_ITEM_COLOR, regeneratedFuelIndices);

    // Remove regenerated items from queues
    for (let i = regeneratedSeedIndices.length - 1; i >= 0; i--) {
        collectedSeedsQueue.splice(regeneratedSeedIndices[i], 1);
    }
    for (let i = regeneratedFuelIndices.length - 1; i >= 0; i--) {
        collectedFuelQueue.splice(regeneratedFuelIndices[i], 1);
    }

    // Update animations for remaining items
    [...seedGems, ...fuelItems].forEach(itemGroup => { // Animate both
         if (itemGroup.gem) {
            itemGroup.gem.rotation.x += 0.01;
            itemGroup.gem.rotation.y += 0.01;
         }
    });
}

// --- Audio Playback ---
function playPickupSound() {
    // Play a random segment if possible
    if (pickupSound && pickupSound.buffer && soundSegments && soundSegments.length > 0) {
        let nextIndex;
        if (soundSegments.length === 1) {
            nextIndex = 0; // Only one segment
        } else {
            do {
                nextIndex = Math.floor(Math.random() * soundSegments.length);
            } while (nextIndex === lastSegmentIndex); // Avoid repeating the same segment immediately
        }
        lastSegmentIndex = nextIndex; // Update last played index

        const segment = soundSegments[nextIndex];
        
        // Check if the sound is already playing, stop it to play the new segment
        if (pickupSound.isPlaying) {
            pickupSound.stop(); 
        }

        // Set the offset and play
        pickupSound.offset = segment.offset;
        pickupSound.duration = segment.duration;
        pickupSound.play();
    }
}

// Play Sound function (kept for potential future use)
// function playSound(listener, buffer) {

// --- Resource Management Functions ---
export function hasResources(seedCost, fuelCost) {
    return inventory.seeds >= seedCost && inventory.fuel >= fuelCost;
}

export function spendResources(seedCost, fuelCost) {
    if (hasResources(seedCost, fuelCost)) {
        inventory.seeds -= seedCost;
        inventory.fuel -= fuelCost;
        console.log(`Spent ${seedCost} seeds, ${fuelCost} fuel. Remaining: ${inventory.seeds} seeds, ${inventory.fuel} fuel.`);
        updateInventoryDisplay(); // Update UI after spending
        return true;
    } else {
        console.warn(`Attempted to spend ${seedCost} seeds, ${fuelCost} fuel, but insufficient resources.`);
        return false;
    }
}

// Exports
export {
    initResources,
    updateResources,
    createInventoryUI,
    // hasResources, // Removed - Exported directly above with 'export function'
    // spendResources // Removed - Exported directly above with 'export function'
}; 