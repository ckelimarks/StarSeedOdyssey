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
let fuelItems = [];
export let inventory = {
    seeds: config.INITIAL_SEEDS,
    fuel: config.INITIAL_FUEL
};

// --- Audio Variables ---
let pickupSound = null;
let soundSegments = config.pickupSoundSegments; // For seeds
let lastSegmentIndex = -1;
let rocketLaunchSound = null;
let impactSound = null;
let rollingSound = null;
let ambientSound = null;
let fuelPickupSound1 = null; // Sound for fuel pickup
let seedAccentSound = null; // NEW: Additional sound for seed pickup

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
    const listener = audioListenerRef;
    if (listener) {
        pickupSound = new THREE.Audio(listener); // Seed pickup (segmented)
        rocketLaunchSound = new THREE.Audio(listener);
        impactSound = new THREE.Audio(listener);
        rollingSound = new THREE.Audio(listener);
        ambientSound = new THREE.Audio(listener);
        fuelPickupSound1 = new THREE.Audio(listener); // Fuel sound
        seedAccentSound = new THREE.Audio(listener); // NEW: Seed accent sound init
        const audioLoader = new THREE.AudioLoader();

        // Load SEED pickup sound (segmented)
        audioLoader.load('sfx/resource-pickup-sound.mp3', function(buffer) {
            pickupSound.setBuffer(buffer);
            pickupSound.setVolume(0.4);
            console.log("Seed pickup sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading seed pickup sound:', err);
        });

        // Load FUEL pickup sound
        audioLoader.load('sfx/collect-sound.wav', function(buffer) {
            fuelPickupSound1.setBuffer(buffer);
            fuelPickupSound1.setLoop(false);
            fuelPickupSound1.setVolume(0.5);
            console.log("Fuel pickup sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading fuel pickup sound:', err);
        });

        // NEW: Load SEED accent sound
        audioLoader.load('sfx/collect-sound2.mp3', function(buffer) {
            seedAccentSound.setBuffer(buffer);
            seedAccentSound.setLoop(false);
            seedAccentSound.setVolume(0.35); // Adjust volume as needed
            console.log("Seed accent sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading seed accent sound:', err);
        });

        // Load rocket launch sound
        audioLoader.load('sfx/rocketsound.mp3', function(buffer) {
            rocketLaunchSound.setBuffer(buffer);
            rocketLaunchSound.setLoop(false); 
            rocketLaunchSound.setVolume(0.6);
            console.log("Rocket launch sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading rocket launch sound:', err);
        });

        // Load impact sound
        audioLoader.load('sfx/impact-sound.mp3', function(buffer) {
            impactSound.setBuffer(buffer);
            impactSound.setLoop(false); 
            impactSound.setVolume(0.7); 
            console.log("Impact sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading impact sound:', err);
        });

        // Load rolling sound
        audioLoader.load('sfx/rolling-sound.mp3', function(buffer) {
            rollingSound.setBuffer(buffer);
            rollingSound.setLoop(true); 
            rollingSound.setVolume(config.ROLLING_SOUND_BASE_VOLUME);
            console.log("Rolling sound loaded.");
        }, undefined, function(err) {
            console.error('Error loading rolling sound:', err);
        });

        // Load ambient sound
        audioLoader.load('sfx/wind-soft-crickets.wav', function(buffer) {
            ambientSound.setBuffer(buffer);
            ambientSound.setLoop(true);
            ambientSound.setVolume(0.3);
            ambientSound.play(); 
            console.log("Ambient sound loaded and playing.");
        }, undefined, function(err) {
            console.error('Error loading ambient sound:', err);
        });

    } else {
        console.warn("Audio Listener not available, sounds disabled.");
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

// Update Resources
function updateResources(scene, playerSphere, homePlanet, audioListener) {
    const itemsToRemove = [];
    const now = performance.now() / 1000;
    const allItems = [...seedGems, ...fuelItems];

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

                // Increment correct inventory and PLAY SOUND
                if (itemGroup.type === 'seeds') {
                    if (inventory.seeds < config.MAX_SEEDS) {
                        inventory.seeds++;
                        playSeedPickupSound();
                    }
                } else if (itemGroup.type === 'fuel') {
                    if (inventory.fuel < config.MAX_FUEL) {
                        // Add FUEL_PER_PICKUP, clamping at MAX_FUEL
                        inventory.fuel = Math.min(config.MAX_FUEL, inventory.fuel + config.FUEL_PER_PICKUP);
                        playFuelPickupSound();
                    }
                }
                updateInventoryDisplay(); // Update UI after change
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

// UPDATED: Play segmented sound AND accent sound for seeds
function playSeedPickupSound() {
    // 1. Play segmented sound
    if (pickupSound && pickupSound.buffer && soundSegments && soundSegments.length > 0) {
        let nextIndex;
        if (soundSegments.length === 1) {
            nextIndex = 0;
        } else {
            do {
                nextIndex = Math.floor(Math.random() * soundSegments.length);
            } while (nextIndex === lastSegmentIndex);
        }
        lastSegmentIndex = nextIndex;

        const segment = soundSegments[nextIndex];

        if (pickupSound.isPlaying) {
            pickupSound.stop();
        }

        pickupSound.offset = segment.offset;
        pickupSound.duration = segment.duration;
        pickupSound.play();
    }

    // 2. Play accent sound simultaneously
    if (seedAccentSound && seedAccentSound.buffer) {
        if (seedAccentSound.isPlaying) {
            seedAccentSound.stop(); // Restart if already playing from rapid collection
        }
        seedAccentSound.play();
    }
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
export function playRocketLaunchSound() {
    if (rocketLaunchSound && rocketLaunchSound.buffer && !rocketLaunchSound.isPlaying) {
        rocketLaunchSound.setVolume(0.6); // Reset volume before playing
        rocketLaunchSound.play();
        console.log("Playing rocket launch sound.");
    } else if (rocketLaunchSound && rocketLaunchSound.isPlaying) {
        console.log("Rocket launch sound already playing (or called again)."); // Avoid console spam if called rapidly
        // Optional: Could restart it if desired: rocketLaunchSound.stop().play();
    } else {
        console.warn("Rocket launch sound not loaded or buffer not ready.");
    }
}

// Function to play the impact sound
export function playImpactSound() {
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
export function startRollingSound() {
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
export function setRollingSoundLoop(shouldLoop) {
    if (rollingSound) {
        rollingSound.setLoop(shouldLoop);
    }
}

// Function to set the volume
export function setRollingSoundVolume(volume) {
    if (rollingSound) {
        // Clamp volume between 0 and 1
        const clampedVolume = Math.max(0, Math.min(1, volume));
        rollingSound.setVolume(clampedVolume);
    }
}

// Function to stop the rolling sound (hard stop)
export function stopRollingSound() {
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

// --- Resource Management Functions ---
// export function hasResources(seedCost, fuelCost) { ... } // Check happens in main.js
// export function spendResources(seedCost, fuelCost) { ... } // Deduction happens in main.js/rocket.js

// Exports
export {
    initResources,
    updateResources,
    createInventoryUI,
    updateInventoryDisplay, // Export for use in main.js?
    rocketLaunchSound,
    // ... other sound exports ...
}; 