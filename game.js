import * as THREE from 'https://esm.sh/three@0.128.0';
// Add import for OrbitControls if needed later

console.log("game.js: Script start");

let scene, camera, renderer, controls;
let star, homePlanet, playerSphere;
// Arrays to store collectible objects
let fuelGems = [];
let seedGems = [];
let foodGems = [];
// Inventory tracking
const inventory = {
    fuel: 0,
    seeds: 0,
    food: 0
};

// Player momentum tracking
let playerVelocity = new THREE.Vector3();
const maxVelocity = 0.008; // Reduced from 0.025 to slow down maximum speed
const acceleration = 0.0005; // Reduced from 0.001 to slow down acceleration
const friction = 0.92; // Value between 0-1: lower = more friction

// Path Trail variables
let pathPoints = [];
let pathLine = null;
const MAX_PATH_POINTS = 200; // Max number of points in the trail
const MIN_PATH_DISTANCE = 0.5; // Min distance player must move to add a point
let needsPathUpdate = false;

const homePlanetRadius = 40;
const playerRadius = 1;
const gemSize = 0.8; // Size of the collectible gems
const collectionDistance = playerRadius + gemSize; // Distance for collection
const magneticRadius = 8; // Distance at which gems start being attracted
const gemAttractionSpeed = 0.2; // How fast gems move toward player when magnetized
const gemSpacing = 15; // Minimum distance between gems

const keyState = { 'ArrowUp': false, 'ArrowDown': false, 'ArrowLeft': false, 'ArrowRight': false };

// Texture Loader
const textureLoader = new THREE.TextureLoader();

// Audio variables
let audioListener, audioLoader;
let pickupSoundBuffer = null;
let backgroundSound = null;
let isBackgroundSoundPlaying = false;

// Define the time segments for the pickup sound
const pickupSoundSegments = [
    { offset: 0, duration: 2 }, // 0-2 seconds
    { offset: 3, duration: 2 }, // 3-5 seconds
    { offset: 6, duration: 2 }  // 6-8 seconds
];
let lastPlayedPickupIndex = -1; // Track the last played index

function createCube(size, color, position, gemType) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({ 
        color: color, 
        roughness: 0.3, 
        metalness: 0.8,
        emissive: color,
        emissiveIntensity: 0.3
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.copy(position);
    cube.gemType = gemType;
    scene.add(cube);
    
    // Add continuous rotation animation
    cube.rotation.x = Math.random() * Math.PI;
    cube.rotation.y = Math.random() * Math.PI;
    cube.rotation.z = Math.random() * Math.PI;
    
    return cube;
}

function createSphere(radius, color, position, name) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    let material;

    if (name === 'star') {
        material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 1.5,
            roughness: 0.1,
            metalness: 0.3
        });
    } else {
        // Base material properties
        const materialProps = {
            color: color,
            roughness: 0.5,
            metalness: 0.5
        };

        // Apply specific textures
        if (name === 'home_planet') {
            try {
                const planetTexture = textureLoader.load('textures/ground.jpg');
                // Optional: Configure texture wrapping and repeat if needed
                planetTexture.wrapS = THREE.RepeatWrapping;
                planetTexture.wrapT = THREE.RepeatWrapping;
                planetTexture.repeat.set(4, 2); // Example repeat values
                materialProps.map = planetTexture;
                materialProps.color = 0xffffff; // Often set to white when using textures
            } catch (error) {
                console.error("Failed to load planet texture:", error);
            }
        } else if (name === 'player') {
            try {
                const playerTexture = textureLoader.load('textures/Cracked_Asphalt_DIFF.png');
                materialProps.map = playerTexture;
                materialProps.color = 0xffffff; // Often set to white when using textures
            } catch (error) {
                console.error("Failed to load player texture:", error);
            }
        }
        
        material = new THREE.MeshStandardMaterial(materialProps);
    }

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    if (name) {
        sphere.name = name;
    }
    scene.add(sphere);
    return sphere;
}

// Function to generate a random position on the planet surface
function getRandomPositionOnPlanet() {
    // Generate a random point on a unit sphere
    const phi = Math.random() * 2 * Math.PI;
    const theta = Math.acos(2 * Math.random() - 1);
    
    // Convert spherical coordinates to Cartesian
    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(theta);
    
    // Scale by planet radius and offset by planet position
    const position = new THREE.Vector3(x, y, z);
    position.multiplyScalar(homePlanetRadius + gemSize/2);
    position.add(homePlanet.position);
    
    return position;
}

// Check if a position is too close to existing gems
function isTooCloseToOtherGems(position) {
    const allGems = [...fuelGems, ...seedGems, ...foodGems];
    
    for (const gem of allGems) {
        if (position.distanceTo(gem.position) < gemSpacing) {
            return true;
        }
    }
    
    return false;
}

// Generate gems of a specific type
function generateGems(count, color, gemType, gemsArray) {
    for (let i = 0; i < count; i++) {
        let position;
        let attempts = 0;
        const maxAttempts = 50;
        
        // Try to find a position that's not too close to other gems
        do {
            position = getRandomPositionOnPlanet();
            attempts++;
            if (attempts > maxAttempts) break; // Prevent infinite loop
        } while (isTooCloseToOtherGems(position));
        
        if (attempts <= maxAttempts) {
            const gem = createCube(gemSize, color, position, gemType);
            gemsArray.push(gem);
        }
    }
}

// Update UI to show inventory
function updateInventoryDisplay() {
    // Only update if the UI elements exist
    const fuelElement = document.getElementById('fuel-count');
    const seedsElement = document.getElementById('seeds-count');
    const foodElement = document.getElementById('food-count');
    
    if (fuelElement) fuelElement.textContent = inventory.fuel;
    if (seedsElement) seedsElement.textContent = inventory.seeds;
    if (foodElement) foodElement.textContent = inventory.food;
    
    console.log(`Inventory: Fuel: ${inventory.fuel}, Seeds: ${inventory.seeds}, Food: ${inventory.food}`);
}

// Create UI for inventory display
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

function init() {
    console.log("INIT: Started");
    scene = new THREE.Scene();
    
    // Define Star Position and Size (Centralized)
    const starPosition = new THREE.Vector3(0, 0, 0);
    const starRadius = 20; // Increased star size

    // Create the star at the origin
    star = createSphere(starRadius, 0xffff00, starPosition, 'star');
    
    // Home planet position - Move it much further out
    // This will eventually be replaced by planet configuration
    const homePlanetPosition = new THREE.Vector3(150, 0, 0); // Moved from (40,0,0) to (150,0,0)
    homePlanet = createSphere(homePlanetRadius, 0x0000ff, homePlanetPosition, 'home_planet');
    
    // Calculate player position relative to the NEW planet position
    const playerPosition = homePlanetPosition.clone().add(new THREE.Vector3(0, homePlanetRadius + playerRadius, 0));
    playerSphere = createSphere(playerRadius, 0xff0000, playerPosition, 'player');

    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 5000; 
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    
    // Recalculate initial camera position based on new player position
    const initialCameraOffset = new THREE.Vector3(0, 6, 12);
    // Player position is now correctly calculated, so use it directly here
    const initialSurfaceNormal = playerPosition.clone().sub(homePlanetPosition).normalize();
    const initialQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), initialSurfaceNormal);
    const initialDesiredOffset = initialCameraOffset.clone().applyQuaternion(initialQuaternion);
    const initialCameraPosition = playerPosition.clone().add(initialDesiredOffset);
    camera.position.copy(initialCameraPosition);
    camera.lookAt(playerPosition); // Look at the updated player position

    // --- Audio Setup (Moved Here After Camera Initialization) ---
    try {
        audioListener = new THREE.AudioListener();
        camera.add(audioListener); // Attach listener to camera
        audioLoader = new THREE.AudioLoader();

        // Load pickup sound
        audioLoader.load(
            'sfx/resource-pickup-sound.mp3',
            function(buffer) { // onLoad callback
                pickupSoundBuffer = buffer;
                console.log("INIT: Pickup sound loaded.");
            },
            undefined, // onProgress callback (optional)
            function(err) { // onError callback
                console.error('INIT: Error loading pickup sound:', err);
            }
        );
        
        // Load and setup background sound (don't play yet)
        audioLoader.load(
            'sfx/wind-soft-crickets.wav',
            function(buffer) { // onLoad callback
                backgroundSound = new THREE.Audio(audioListener);
                backgroundSound.setBuffer(buffer);
                backgroundSound.setLoop(true);
                backgroundSound.setVolume(0.3); // Adjust volume as needed
                console.log("INIT: Background sound loaded and configured.");
            },
            undefined, // onProgress callback
            function(err) { // onError callback
                console.error('INIT: Error loading background sound:', err);
            }
        );

    } catch (error) {
        console.error("INIT: Error setting up audio:", error);
        // Optionally disable audio features if setup fails
        audioListener = null; 
        audioLoader = null;
    }
    // --- End Audio Setup ---

    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
        console.error("INIT: Canvas element #game-canvas not found!"); return;
    }
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
    } catch (e) {
        console.error("INIT: Error creating WebGLRenderer:", e); return;
    }

    // Add subtle ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Slightly reduced ambient (was 0.3)
    scene.add(ambientLight);

    // Make the star brighter with a powerful point light at the origin
    // Increased range and intensity due to larger scale
    const starLight = new THREE.PointLight(0xffffdd, 5, 4000, 1.5);
    starLight.position.copy(starPosition);
    scene.add(starLight);
    
    // Remove the spotlight for now, PointLight should suffice with increased range
    // // Add an extra light source from the star for enhanced brightness
    // const starLight2 = new THREE.SpotLight(0xffffee, 3, 800, Math.PI/3, 0.3, 1);
    // starLight2.position.copy(starPosition);
    // starLight2.target.position.copy(homePlanet.position);
    // scene.add(starLight2);
    // scene.add(starLight2.target);
    
    // Add subtle hemisphere light for better ambient illumination
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.3); // Reduced intensity (was 0.4)
    scene.add(hemiLight);

    // Initialize Path Trail
    const pathMaterial = new THREE.LineDashedMaterial({ 
        color: 0xffffff, 
        linewidth: 1, 
        scale: 1, 
        dashSize: 0.5, // Size of dashes
        gapSize: 0.3   // Size of gaps
    });
    const pathGeometry = new THREE.BufferGeometry();
    // Initialize with two points to avoid errors, will be updated
    pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,1], 3)); 
    pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.computeLineDistances(); // Important for dashed lines
    scene.add(pathLine);

    // Generate collectible gems (Note: these will currently spawn near the new planet position)
    generateGems(10, 0xffa500, 'fuel', fuelGems);
    generateGems(10, 0x00ff00, 'seeds', seedGems);
    generateGems(10, 0xff6ec7, 'food', foodGems);
    
    // Create UI for inventory
    createInventoryUI();
    updateInventoryDisplay();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', onWindowResize, false);

    console.log("INIT: Calling animate...");
    animate();
    console.log("INIT: Finished successfully.");
}

function handleKeyDown(event) {
    if (event.key in keyState) {
        console.log(`Key Down: ${event.key}`);
        keyState[event.key] = true;
        
        // Start background sound on first key press if ready and not already playing
        if (!isBackgroundSoundPlaying && backgroundSound && backgroundSound.buffer) {
            try {
                 // Check AudioContext state - might need resuming
                if (audioListener.context.state === 'suspended') {
                    audioListener.context.resume();
                }
                backgroundSound.play();
                isBackgroundSoundPlaying = true;
                console.log("AUDIO: Background sound started.");
            } catch (error) {
                console.error("AUDIO: Error trying to play background sound:", error);
            }
        }
    }
}

function handleKeyUp(event) {
    if (event.key in keyState) {
        console.log(`Key Up: ${event.key}`);
        keyState[event.key] = false;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Re-enable player movement and camera updates
    updatePlayerMovement();
    updateCamera();
    updateGems(); // Animate and check collisions with gems
    updatePathTrail(); // Update the path trail visualization
    
    if (renderer && scene && camera) {
        try {
            renderer.render(scene, camera);
        } catch (e) {
            console.error("ANIMATE: ERROR during render:", e);
        }
    }
}

function updatePlayerMovement() {
    // Constants for physics are defined globally
    const POLE_THRESHOLD = 1e-8; // Smaller threshold for near-zero checks

    // Calculate the up vector (normal to planet surface)
    const planetUp = playerSphere.position.clone().sub(homePlanet.position).normalize();
    
    // --- Calculate Tangent Forward --- 
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    let tangentForward = cameraForward.clone().sub(
        planetUp.clone().multiplyScalar(cameraForward.dot(planetUp))
    );
    
    // Check if initial forward projection is unstable (near pole)
    const isForwardUnstable = tangentForward.lengthSq() < POLE_THRESHOLD;
    
    // --- Calculate Tangent Right Directly --- 
    const cameraRightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    let tangentRight = cameraRightWorld.clone().sub(
        planetUp.clone().multiplyScalar(cameraRightWorld.dot(planetUp))
    );
    if (tangentRight.lengthSq() < POLE_THRESHOLD) { // Handle instability if camera is rolled
        console.log("Pole/Roll instability detected for tangentRight - using fallback");
        // Fallback for right: Use cross product. Requires a stable forward first.
        // If forward was *also* unstable, we need a different approach temporarily.
        if (isForwardUnstable) {
             console.log("Double instability: Forward and Right. Using World X for Right.");
             const worldX = new THREE.Vector3(1, 0, 0);
             tangentRight = worldX.clone().sub(
                  planetUp.clone().multiplyScalar(worldX.dot(planetUp))
             );
             // Final check if World X is also aligned (very edge case)
             if (tangentRight.lengthSq() < POLE_THRESHOLD) {
                  const worldZ = new THREE.Vector3(0, 0, 1);
                  tangentRight = worldZ.clone().sub(
                       planetUp.clone().multiplyScalar(worldZ.dot(planetUp))
                  );
             }
        } else {
             // If forward was stable, derive right from it
             tangentRight = new THREE.Vector3().crossVectors(planetUp, tangentForward); 
        }
    }
    tangentRight.normalize(); // We now have a stable tangentRight

    // --- Refine Tangent Forward using Stable Right if needed --- 
    if (isForwardUnstable) { 
        console.log("Pole instability detected for tangentForward - using stable tangentRight to derive forward");
        // Derive forward from the stable right and up vectors
        tangentForward = new THREE.Vector3().crossVectors(tangentRight, planetUp);
    }
    tangentForward.normalize(); // We now have a stable tangentForward
    
    // Process cardinal direction input (prioritize last checked)
    let accelerationDirection = new THREE.Vector3(); // Initialize as zero vector
    if (keyState['ArrowUp']) {
        accelerationDirection.copy(tangentForward); 
    } else if (keyState['ArrowDown']) {
        accelerationDirection.copy(tangentForward).negate(); 
    } else if (keyState['ArrowLeft']) {
        accelerationDirection.copy(tangentRight).negate(); 
    } else if (keyState['ArrowRight']) {
        accelerationDirection.copy(tangentRight); 
    }

    // Apply acceleration to velocity (only if a direction key was pressed)
    if (accelerationDirection.lengthSq() > 0) {
        playerVelocity.add(accelerationDirection.multiplyScalar(acceleration));
        
        // Cap velocity at max speed
        if (playerVelocity.length() > maxVelocity) {
            playerVelocity.normalize().multiplyScalar(maxVelocity);
        }
    } else {
        // Apply friction/deceleration when no keys are pressed
        playerVelocity.multiplyScalar(friction);
    }
    
    // If velocity is very small, just stop
    if (playerVelocity.length() < 0.0005) {
        playerVelocity.set(0, 0, 0);
    }
    
    // Return if no movement
    if (playerVelocity.lengthSq() === 0) {
        return; 
    }

    // Get movement direction from velocity
    const moveDirection = playerVelocity.clone().normalize();
    
    // Calculate rotation axis for player MOVEMENT (Original Order)
    const positionRotationAxis = new THREE.Vector3().crossVectors(planetUp, moveDirection).normalize();
    // Calculate rotation axis for player MESH ROTATION (Flipped Order for correct visual roll)
    const meshRotationAxis = new THREE.Vector3().crossVectors(moveDirection, planetUp).normalize();

    // Apply rotation to move the player sphere using velocity magnitude and MOVEMENT axis
    const angle = playerVelocity.length();
    playerSphere.position.sub(homePlanet.position); // Center on origin for rotation
    playerSphere.position.applyAxisAngle(positionRotationAxis, angle); // Use position axis here
    playerSphere.position.add(homePlanet.position); // Move back to world position

    // Keep player precisely on the surface
    const surfaceNormal = playerSphere.position.clone().sub(homePlanet.position).normalize();
    const targetPosition = homePlanet.position.clone().add(surfaceNormal.multiplyScalar(homePlanetRadius + playerRadius));
    playerSphere.position.copy(targetPosition);

    // Update Path Trail
    const lastPoint = pathPoints.length > 0 ? pathPoints[pathPoints.length - 1] : null;
    if (!lastPoint || playerSphere.position.distanceTo(lastPoint) > MIN_PATH_DISTANCE) {
        // Clone position to avoid reference issues
        pathPoints.push(playerSphere.position.clone()); 
        if (pathPoints.length > MAX_PATH_POINTS) {
            pathPoints.shift(); // Remove the oldest point
        }
        needsPathUpdate = true; // Signal that the line geometry needs updating
    }

    // Calculate the angle needed for the mesh rotation based on distance traveled
    const meshRotationAngle = angle * (homePlanetRadius + playerRadius) / playerRadius;
    // Rotate the mesh using the MESH axis and calculated mesh angle (use NEGATIVE angle to flip direction)
    playerSphere.rotateOnWorldAxis(meshRotationAxis, -meshRotationAngle); 
}

function updateCamera() {
    if (!playerSphere) return;
    
    // Calculate the current surface normal at player position
    const surfaceNormal = playerSphere.position.clone().sub(homePlanet.position).normalize();
    
    // Define fixed camera offset relative to player (local Z is backwards, local Y is up)
    const cameraOffset = new THREE.Vector3(0, 5, 15); 
    
    // --- Calculate Camera Position --- 
    // Create quaternion to rotate offset based on player's position on planet
    // This aligns the offset's local Y with the surface normal
    const positionQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), // Standard Up
        surfaceNormal // Target Up (Planet Surface Normal)
    );
    
    // Apply quaternion to the offset vector
    const rotatedOffset = cameraOffset.clone().applyQuaternion(positionQuaternion);
    
    // Calculate desired camera position in world space
    const desiredPosition = playerSphere.position.clone().add(rotatedOffset);
    
    // Set camera position directly (no lerp/smoothing)
    camera.position.copy(desiredPosition);

    // --- Calculate Camera Orientation Robustly --- 
    // Use Matrix4.lookAt to directly compute the target orientation matrix.
    // This method is generally more stable than setting camera.up and calling camera.lookAt().
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(
        camera.position, // Eye position
        playerSphere.position, // Target position to look at
        surfaceNormal // Up vector (use the surface normal for consistent orientation)
    );

    // Apply the rotation component of the matrix to the camera quaternion
    camera.quaternion.setFromRotationMatrix(lookAtMatrix);

    // We no longer need to manually set camera.up or call camera.lookAt()
    // camera.up.copy(surfaceNormal); // No longer needed
    // camera.lookAt(playerSphere.position); // No longer needed
}

// Rotate and check for gem collection
function updateGems() {
    if (!playerSphere) return;
    
    // Update all gems
    const allGems = [
        {gems: fuelGems, type: 'fuel'},
        {gems: seedGems, type: 'seeds'},
        {gems: foodGems, type: 'food'}
    ];
    
    for (const gemGroup of allGems) {
        for (let i = gemGroup.gems.length - 1; i >= 0; i--) {
            const gem = gemGroup.gems[i];
            
            // Rotate each gem for animation effect
            gem.rotation.x += 0.01;
            gem.rotation.y += 0.02;
            
            // Check distance to player
            const distanceToPlayer = playerSphere.position.distanceTo(gem.position);
            
            // Check if gem is within magnetic radius
            if (distanceToPlayer < magneticRadius && distanceToPlayer > collectionDistance) {
                // Calculate direction to player
                const directionToPlayer = playerSphere.position.clone().sub(gem.position).normalize();
                
                // Create position on planet surface toward player
                // First find where gem is relative to planet center
                const gemToPlanetDir = gem.position.clone().sub(homePlanet.position).normalize();
                
                // Calculate how much to move toward player
                const moveAmount = Math.min(gemAttractionSpeed, distanceToPlayer - collectionDistance);
                
                // Move along surface toward player (not directly through planet)
                // Project the direction to player onto the tangent plane of the gem's position
                const projectedDirection = directionToPlayer.clone().sub(
                    gemToPlanetDir.clone().multiplyScalar(directionToPlayer.dot(gemToPlanetDir))
                ).normalize();
                
                // Apply movement
                gem.position.add(projectedDirection.multiplyScalar(moveAmount));
                
                // Ensure gem stays on planet surface
                const newGemToPlanetDir = gem.position.clone().sub(homePlanet.position).normalize();
                gem.position.copy(homePlanet.position.clone().add(
                    newGemToPlanetDir.multiplyScalar(homePlanetRadius + gemSize/2)
                ));
                
                // Make gem rotate faster when being attracted to player
                gem.rotation.x += 0.05;
                gem.rotation.y += 0.05;
                gem.rotation.z += 0.05;
            }
            
            // Check if player has collected this gem
            if (distanceToPlayer < collectionDistance) {
                // Remove gem from scene and array
                scene.remove(gem);
                gemGroup.gems.splice(i, 1);
                
                // Update inventory
                inventory[gemGroup.type]++;
                updateInventoryDisplay();
                
                // Play random pickup sound segment (non-repeating) if loaded
                if (audioListener && pickupSoundBuffer) {
                    try {
                        // Get a random segment index, ensuring it's different from the last one
                        let randomIndex;
                        do {
                            randomIndex = Math.floor(Math.random() * pickupSoundSegments.length);
                        } while (randomIndex === lastPlayedPickupIndex && pickupSoundSegments.length > 1); // Prevent infinite loop if only 1 segment
                        
                        // Update the last played index
                        lastPlayedPickupIndex = randomIndex;

                        const currentSegment = pickupSoundSegments[randomIndex];
                        
                        const sound = new THREE.Audio(audioListener);
                        sound.setBuffer(pickupSoundBuffer);
                        sound.setVolume(0.7); // Adjust volume as needed
                        
                        // Set the start offset for this segment
                        sound.offset = currentSegment.offset;
                        
                        // Play the sound starting from the offset
                        sound.play();
                        
                        // Schedule the sound to stop after its duration
                        // Use setTimeout because sound.play() starts async
                        setTimeout(() => {
                            // Check if the sound is still playing before stopping
                            // (might have been stopped manually elsewhere, though unlikely here)
                            if (sound.isPlaying) {
                                sound.stop();
                            }
                        }, currentSegment.duration * 1000); // Duration in milliseconds

                    } catch (error) {
                        console.error("AUDIO: Error playing pickup sound segment:", error);
                    }
                }
                
                console.log(`Collected ${gemGroup.type}!`);
            }
        }
    }
}

// Function to update the path trail line geometry
function updatePathTrail() {
    if (!needsPathUpdate || !pathLine || pathPoints.length < 2) {
        return; // Nothing to update or not enough points
    }

    // Create a flat array of positions for the BufferGeometry
    const positions = pathPoints.flatMap(p => [p.x, p.y, p.z]);
    
    // Update the geometry attribute
    pathLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Important: Recompute distances for dashed lines
    pathLine.computeLineDistances(); 
    
    // Tell Three.js the geometry needs updating
    pathLine.geometry.attributes.position.needsUpdate = true;
    pathLine.geometry.computeBoundingSphere(); // Update bounds

    needsPathUpdate = false; // Reset the flag
}

// --- Restore Correct Initialization --- 
// console.log("Script end: Calling init() directly...");
// init(); // Keep this commented out

console.log("Script end: Adding DOMContentLoaded listener...");
window.addEventListener('DOMContentLoaded', (event) => {
    console.log('Event: DOM fully loaded and parsed. Calling init()...');
    init(); // Call init inside the listener
}); 