import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { getRandomPositionOnPlanet, isTooCloseToOtherGems } from './utils.js';

// Module-level variables for gems and inventory
let fuelGems = [];
let seedGems = [];
let foodGems = [];
const inventory = {
    fuel: 0,
    seeds: 0,
    food: 0
};

// Audio state for pickup sound
let audioLoader = null;
let pickupSoundBuffer = null;
let lastPlayedPickupIndex = -1;

// Temporary vectors
const _tempMatrix = new THREE.Matrix4();
const _gemWorldPos = new THREE.Vector3();
const _homePlanetWorldPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();

// Create Gem Cube Mesh
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
    return cube;
}

// Generate Gems of a Specific Type
function generateGemsOfType(count, color, gemType, gemsArray, homePlanet, planetsState) {
    const allCurrentGems = [...fuelGems, ...seedGems, ...foodGems]; // Get all gems created so far
    for (let i = 0; i < count; i++) {
        let position;
        let attempts = 0;
        const maxAttempts = 50;
        
        do {
            position = getRandomPositionOnPlanet(homePlanet, planetsState);
            attempts++;
            if (attempts > maxAttempts) break;
        } while (isTooCloseToOtherGems(position, allCurrentGems)); // Check against all gems
        
        if (attempts <= maxAttempts) {
            const gem = createCube(config.GEM_SIZE, color, position, gemType);
            homePlanet.add(gem);
            gemsArray.push(gem); // Add to the specific type array
            allCurrentGems.push(gem); // Also add to the temporary combined array for spacing checks
        }
    }
}

// UI Functions (Consider moving to dedicated ui.js later)
function createInventoryUI() {
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '20px';
    uiContainer.style.left = '20px';
    uiContainer.style.color = 'white';
    uiContainer.style.fontFamily = 'Arial, sans-serif';
    uiContainer.style.fontSize = '18px';
    uiContainer.style.userSelect = 'none';
    uiContainer.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
    
    uiContainer.innerHTML = `
        <div style="margin-bottom: 5px;">Fuel: <span id="fuel-count">0</span></div>
        <div style="margin-bottom: 5px;">Seeds: <span id="seeds-count">0</span></div>
        <div style="margin-bottom: 5px;">Food: <span id="food-count">0</span></div>
    `;
    
    document.body.appendChild(uiContainer);
}

function updateInventoryDisplay() {
    const fuelElement = document.getElementById('fuel-count');
    const seedsElement = document.getElementById('seeds-count');
    const foodElement = document.getElementById('food-count');
    
    if (fuelElement) fuelElement.textContent = inventory.fuel;
    if (seedsElement) seedsElement.textContent = inventory.seeds;
    if (foodElement) foodElement.textContent = inventory.food;
}

// Initialize Gems, UI, and Sounds
export function initGems(homePlanet, planetsState, listener) {
    console.log("Gems INIT: Initializing...");
    if (!homePlanet || !planetsState || !listener) {
        throw new Error("Gems INIT: Missing required arguments (homePlanet, planetsState, audioListener).");
    }

    // Load pickup sound
    audioLoader = new THREE.AudioLoader();
    audioLoader.load(
        'sfx/resource-pickup-sound.mp3',
        (buffer) => { 
            pickupSoundBuffer = buffer;
            console.log("Gems INIT: Pickup sound loaded.");
        },
        undefined,
        (err) => { console.error('Gems INIT: Error loading pickup sound:', err); }
    );

    // Generate initial gems
    generateGemsOfType(10, 0xffa500, 'fuel', fuelGems, homePlanet, planetsState);
    generateGemsOfType(10, 0x00ff00, 'seeds', seedGems, homePlanet, planetsState);
    generateGemsOfType(10, 0xff6ec7, 'food', foodGems, homePlanet, planetsState);
    console.log("Gems INIT: Gems generated.");

    // Create UI
    createInventoryUI();
    updateInventoryDisplay(); // Initialize display
    console.log("Gems INIT: UI created.");

    console.log("Gems INIT: Finished.");
}

// Update Gems (Animation, Magnetism, Collection)
export function updateGems(playerSphere, homePlanet, planetsState, audioListener) {
    if (!playerSphere || !homePlanet || !planetsState || !audioListener) return;

    const playerWorldPos = _playerWorldPos; // Use module-level temp vector
    playerSphere.getWorldPosition(playerWorldPos);
    const homePlanetConfig = planetsState[homePlanet.name]?.config;
    if (!homePlanetConfig) return;

    const allGemGroups = [
        {gems: fuelGems, type: 'fuel'},
        {gems: seedGems, type: 'seeds'},
        {gems: foodGems, type: 'food'}
    ];
    
    for (const gemGroup of allGemGroups) {
        for (let i = gemGroup.gems.length - 1; i >= 0; i--) {
            const gem = gemGroup.gems[i];
            
            gem.rotation.x += 0.01;
            gem.rotation.y += 0.02;
            
            gem.getWorldPosition(_gemWorldPos);
            const distanceToPlayer = playerWorldPos.distanceTo(_gemWorldPos);
            
            // Magnetism
            if (distanceToPlayer < config.MAGNETIC_RADIUS && distanceToPlayer > config.COLLECTION_DISTANCE) {
                const directionToPlayer = playerWorldPos.clone().sub(_gemWorldPos).normalize();
                homePlanet.getWorldPosition(_homePlanetWorldPos);
                const gemSurfaceNormalWorld = _gemWorldPos.clone().sub(_homePlanetWorldPos).normalize();
                const projectedDirectionWorld = directionToPlayer.clone().sub(
                    gemSurfaceNormalWorld.clone().multiplyScalar(directionToPlayer.dot(gemSurfaceNormalWorld))
                ).normalize();
                const moveAmount = Math.min(config.GEM_ATTRACTION_SPEED, distanceToPlayer - config.COLLECTION_DISTANCE);
                const moveDeltaWorld = projectedDirectionWorld.multiplyScalar(moveAmount);
                
                _tempMatrix.copy(homePlanet.matrixWorld).invert();
                const moveDeltaLocal = moveDeltaWorld.clone().transformDirection(_tempMatrix);
                
                gem.position.add(moveDeltaLocal);
                gem.position.normalize().multiplyScalar(homePlanetConfig.radius + config.GEM_SIZE/2);
                
                gem.rotation.x += 0.05;
                gem.rotation.y += 0.05;
                gem.rotation.z += 0.05;
            }
            
            // Collection
            if (distanceToPlayer < config.COLLECTION_DISTANCE) {
                homePlanet.remove(gem);
                gemGroup.gems.splice(i, 1);
                
                inventory[gemGroup.type]++;
                updateInventoryDisplay();
                
                // Play sound segment
                if (pickupSoundBuffer) {
                    try {
                        let randomIndex;
                        do {
                            randomIndex = Math.floor(Math.random() * config.pickupSoundSegments.length);
                        } while (randomIndex === lastPlayedPickupIndex && config.pickupSoundSegments.length > 1); 
                        lastPlayedPickupIndex = randomIndex;
                        const currentSegment = config.pickupSoundSegments[randomIndex];
                        
                        const sound = new THREE.Audio(audioListener);
                        sound.setBuffer(pickupSoundBuffer);
                        sound.setVolume(0.7);
                        sound.offset = currentSegment.offset;
                        sound.play();
                        
                        setTimeout(() => {
                            if (sound.isPlaying) sound.stop();
                        }, currentSegment.duration * 1000);

                    } catch (error) {
                        console.error("AUDIO: Error playing pickup sound segment:", error);
                    }
                }
                console.log(`Collected ${gemGroup.type}!`);
            }
        }
    }
} 