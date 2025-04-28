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

// Planet Configuration Data Structure
const planetConfigs = [
    {
        name: 'AquaPrime', // Our initial "home" planet
        radius: 40,
        color: 0x0055ff, // Slightly different blue
        orbitalDistance: 150, // Current distance
        orbitalSpeed: 0.005, // Radians per frame (adjust later)
        initialAngle: 0,    // Starting angle in orbit
        isHome: true // Flag to identify the starting planet
    },
    {
        name: 'Infernia',
        radius: 30,
        color: 0xff6600, // Orangey-red
        orbitalDistance: 250,
        orbitalSpeed: 0.003,
        initialAngle: Math.PI / 2, // Start at 90 degrees
        isHome: false
    },
    {
        name: 'Verdant Minor',
        radius: 25,
        color: 0x00ff88, // Greenish
        orbitalDistance: 350,
        orbitalSpeed: 0.002,
        initialAngle: Math.PI, // Start at 180 degrees
        isHome: false
    }
    // Add more planets later
];

// Object to store planet meshes and their current orbital angles
const planets = {}; 

// Temporary vectors for world coordinate calculations
const _tempVector = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();
const _gemWorldPos = new THREE.Vector3();
const _homePlanetWorldPos = new THREE.Vector3();

function createCube(size, color, position, gemType) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({ 
        color: color, 
        roughness: 0.3, // Keep some roughness for non-glowing parts
        metalness: 0.8, // Keep metalness for reflections
        emissive: color, // Set emissive color to the base color
        emissiveIntensity: 0.6 // Adjust intensity for desired glow
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.copy(position);
    cube.gemType = gemType;
    // Gems should cast shadows
    cube.castShadow = true;
    cube.receiveShadow = true; // Can optionally receive too
    // scene.add(cube); // Added to homePlanet later
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
        if (name === 'player') {
            try {
                const playerTexture = textureLoader.load('textures/Cracked_Asphalt_DIFF.png');
                materialProps.map = playerTexture;
                materialProps.color = 0xffffff; // Often set to white when using textures
            } catch (error) {
                console.error("Failed to load player texture:", error);
            }
        } else { // Apply default planet texture to all non-player, non-star spheres
            try {
                const planetTexture = textureLoader.load('textures/ground.jpg');
                // Configure texture wrapping and repeat
                planetTexture.wrapS = THREE.RepeatWrapping;
                planetTexture.wrapT = THREE.RepeatWrapping;
                planetTexture.repeat.set(8, 4); // Increased repeat to make texture smaller 
                materialProps.map = planetTexture;
            } catch (error) {
                console.error("Failed to load default planet texture:", error);
            }
        }
        
        material = new THREE.MeshStandardMaterial(materialProps);
    }

    const sphere = new THREE.Mesh(geometry, material);
    // Configure shadows for non-star spheres
    if (name !== 'star') {
        sphere.castShadow = true;
        sphere.receiveShadow = true;
    }
    sphere.position.copy(position);
    if (name) {
        sphere.name = name;
    }
    // scene.add(sphere); // Don't add directly to scene here anymore
    return sphere;
}

// Function to generate a random position on the planet surface (LOCAL COORDINATES)
function getRandomPositionOnPlanet() {
    // Generate a random point on a unit sphere
    const phi = Math.random() * 2 * Math.PI;
    const theta = Math.acos(2 * Math.random() - 1);
    
    // Convert spherical coordinates to Cartesian
    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(theta);
    
    // Scale by planet radius (relative to planet center 0,0,0)
    const position = new THREE.Vector3(x, y, z);
    const homePlanetConfig = planets[homePlanet.name].config; // Need config for radius
    position.multiplyScalar(homePlanetConfig.radius + gemSize/2); 
    // Removed: position.add(homePlanet.position); // No longer needed, position is local
    
    return position;
}

// Check if a position (local) is too close to existing gems (local)
function isTooCloseToOtherGems(position) {
    // Gems arrays store the meshes
    const allGems = [...fuelGems, ...seedGems, ...foodGems];
    
    for (const gem of allGems) {
        // Distance check uses local positions as they share the same parent (homePlanet)
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
        
        // Try to find a LOCAL position that's not too close to other LOCAL gem positions
        do {
            position = getRandomPositionOnPlanet();
            attempts++;
            if (attempts > maxAttempts) break; // Prevent infinite loop
        } while (isTooCloseToOtherGems(position));
        
        if (attempts <= maxAttempts) {
            const gem = createCube(gemSize, color, position, gemType);
            // Add gem to the home planet, not the scene
            if (homePlanet) { 
                homePlanet.add(gem);
                gemsArray.push(gem);
            } else {
                console.error("GenerateGems: Cannot add gem, homePlanet not defined yet.");
            }
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

// --- Create Starfield --- 
function createStarfield(starCount = 5000, radius = 5000) {
    const starVertices = [];
    for (let i = 0; i < starCount; i++) {
        // Generate random point within a sphere
        const theta = 2 * Math.PI * Math.random(); // Random angle around Y
        const phi = Math.acos(2 * Math.random() - 1); // Random angle from Y pole
        const r = radius * Math.cbrt(Math.random()); // Cube root for uniform density
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        starVertices.push(x, y, z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3, // Adjust size as needed
        sizeAttenuation: true // Points farther away appear smaller
    });

    const stars = new THREE.Points(geometry, material);
    console.log(`INIT: Created starfield with ${starCount} stars.`);
    return stars;
}

function init() {
    console.log("INIT: Started");
    scene = new THREE.Scene();
    
    // --- Add Starfield Background ---
    const starfield = createStarfield();
    scene.add(starfield);
    
    // Define Star Position and Size (Centralized)
    const starPosition = new THREE.Vector3(0, 0, 0);
    const starRadius = 20; // Increased star size

    // Create the star at the origin
    star = createSphere(starRadius, 0xffff00, starPosition, 'star');
    scene.add(star);
    
    // --- Create Planets from Configuration ---
    for (const config of planetConfigs) {
        // Calculate initial position based on distance and angle
        const initialX = config.orbitalDistance * Math.cos(config.initialAngle);
        const initialZ = config.orbitalDistance * Math.sin(config.initialAngle);
        const planetPosition = new THREE.Vector3(initialX, 0, initialZ); // Y=0 plane for now
        
        // Create the planet sphere
        const planetMesh = createSphere(config.radius, config.color, planetPosition, config.name);
        
        // Store the mesh and its current angle
        planets[config.name] = { 
            mesh: planetMesh, 
            config: config, // Store config for easy access
            currentAngle: config.initialAngle 
        };
        
        // Identify the home planet
        if (config.isHome) {
            homePlanet = planetMesh; // Assign the mesh to the global homePlanet variable
            console.log(`INIT: Designated ${config.name} as home planet.`);
        }
    }

    // Add planet meshes to the scene AFTER creating them all
    for (const planetName in planets) {
        scene.add(planets[planetName].mesh);
    }

    if (!homePlanet) {
        console.error("INIT: No home planet designated in configurations!");
        // Fallback: Assign the first planet as home if none is marked
        if (planetConfigs.length > 0) {
            const firstPlanetName = planetConfigs[0].name;
            homePlanet = planets[firstPlanetName].mesh;
            console.warn(`INIT: Falling back to ${firstPlanetName} as home planet.`);
        } else {
            console.error("INIT: Cannot proceed without any planets defined!");
            return; // Stop initialization if no planets exist
        }
    }
    
    // --- Player Initialization (Relative to Home Planet) ---
    const homePlanetConfig = planets[homePlanet.name].config;
    // Player position is LOCAL to the home planet
    const playerLocalPosition = new THREE.Vector3(0, homePlanetConfig.radius + playerRadius, 0); 
    // Use white color since texture is applied
    playerSphere = createSphere(playerRadius, 0xffffff, playerLocalPosition, 'player');
    // Add player to the home planet, not the scene
    homePlanet.add(playerSphere);
    console.log(`INIT: Player added as child of ${homePlanet.name}`);

    // --- Camera Setup ---
    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 10000; // Increased far plane significantly for larger distances
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    
    // Recalculate initial camera position based on player's WORLD position
    const initialCameraOffset = new THREE.Vector3(0, 6, 12);
    playerSphere.getWorldPosition(_playerWorldPos); // Get initial world pos
    homePlanet.getWorldPosition(_homePlanetWorldPos); // Get initial planet world pos
    const initialSurfaceNormal = _playerWorldPos.clone().sub(_homePlanetWorldPos).normalize();
    const initialQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), initialSurfaceNormal);
    const initialDesiredOffset = initialCameraOffset.clone().applyQuaternion(initialQuaternion);
    const initialCameraPosition = _playerWorldPos.clone().add(initialDesiredOffset);
    camera.position.copy(initialCameraPosition);
    camera.lookAt(_playerWorldPos); // Look at player's initial WORLD position

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
        // Enable shadow mapping
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: softer shadows
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
    // Enable shadow casting for the star light
    starLight.castShadow = true;
    // Configure shadow properties (might need tuning)
    starLight.shadow.mapSize.width = 2048; // Shadow map resolution
    starLight.shadow.mapSize.height = 2048;
    starLight.shadow.camera.near = 50; // Adjust near/far based on scene scale
    starLight.shadow.camera.far = 5000; 
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
    // scene.add(pathLine); // <<< REMOVE: Don't add to main scene
    // Add pathLine to homePlanet AFTER homePlanet is defined and player added
    if (homePlanet) {
        homePlanet.add(pathLine); 
        console.log("INIT: Path trail added as child of homePlanet.");
    } else {
        console.error("INIT: Cannot add path trail, homePlanet not defined yet.");
    }

    // Generate collectible gems (these are now added to homePlanet inside the function)
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

// --- Update Planet Orbits ---
function updateOrbits() {
    // Loop through each planet stored in the global `planets` object
    for (const planetName in planets) {
        const planetData = planets[planetName];
        const config = planetData.config;
        const mesh = planetData.mesh;
        
        // Update the current angle based on orbital speed
        // Ensure consistent speed regardless of frame rate by potentially using deltaTime later
        planetData.currentAngle += config.orbitalSpeed; 
        
        // Keep angle within 0 to 2*PI range (optional, but good practice)
        planetData.currentAngle %= (2 * Math.PI);
        
        // Calculate new X and Z coordinates based on the new angle and orbital distance
        const newX = config.orbitalDistance * Math.cos(planetData.currentAngle);
        const newZ = config.orbitalDistance * Math.sin(planetData.currentAngle);
        
        // Update the planet mesh's position (Y remains 0 for now)
        mesh.position.set(newX, 0, newZ);
    }
}

function animate() {
    requestAnimationFrame(animate);

    updateOrbits(); // Update planet positions first
    
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

    // Get current world positions
    playerSphere.getWorldPosition(_playerWorldPos);
    homePlanet.getWorldPosition(_homePlanetWorldPos);
    const homePlanetConfig = planets[homePlanet.name].config;

    // Calculate the up vector (normal to planet surface) using WORLD positions
    const planetUp = _playerWorldPos.clone().sub(_homePlanetWorldPos).normalize();
    
    // --- Calculate Tangent Forward (World Space) --- 
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
    tangentForward.normalize(); // We now have a stable tangentForward (world space)
    
    // --- Calculate Movement Delta --- 
    // Process cardinal direction input (prioritize last checked)
    let accelerationDirection = new THREE.Vector3(); // Initialize as zero vector (world space)
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
    
    // Return if no movement input and velocity is zero
    if (playerVelocity.lengthSq() === 0) {
        // When stationary, ensure player stays clamped to the surface in local coordinates
        playerSphere.position.normalize().multiplyScalar(homePlanetConfig.radius + playerRadius);
        return; 
    }

    // --- Apply Movement using applyAxisAngle on Local Position (Reverted Logic) ---
    
    // Get world movement direction from velocity
    const moveDirection = playerVelocity.clone().normalize();
    
    // Calculate rotation axis for player MOVEMENT (World Space, Original Order)
    const positionRotationAxis = new THREE.Vector3().crossVectors(planetUp, moveDirection).normalize();

    // Calculate angle based on world velocity magnitude (arc length relative to planet center)
    const angle = playerVelocity.length();

    // Apply rotation to the LOCAL position vector around the WORLD axis
    playerSphere.position.applyAxisAngle(positionRotationAxis, angle); 
    
    // Keep player precisely on the surface (LOCAL Space clamping)
    playerSphere.position.normalize().multiplyScalar(homePlanetConfig.radius + playerRadius);

    // --- Update Path Trail (Store LOCAL Points) ---
    // Get the final clamped world position 
    playerSphere.getWorldPosition(_playerWorldPos);
    // Convert world position to home planet's local space
    _tempMatrix.copy(homePlanet.matrixWorld).invert();
    const playerLocalPosForTrail = _playerWorldPos.clone().applyMatrix4(_tempMatrix);
    
    const lastPoint = pathPoints.length > 0 ? pathPoints[pathPoints.length - 1] : null;
    // Compare distance using LOCAL positions to avoid drift if player is stationary relative to planet
    if (!lastPoint || playerLocalPosForTrail.distanceTo(lastPoint) > MIN_PATH_DISTANCE) {
        pathPoints.push(playerLocalPosForTrail.clone()); // Add LOCAL position
        if (pathPoints.length > MAX_PATH_POINTS) {
            pathPoints.shift(); // Remove the oldest point
        }
        needsPathUpdate = true; // Signal that the line geometry needs updating
    }

    // --- Rotate the player mesh itself (World Space Axis) ---
    homePlanet.getWorldPosition(_homePlanetWorldPos); // Need planet world pos for axis calc
    const meshRotationAxis = new THREE.Vector3().crossVectors(moveDirection, planetUp).normalize(); // World axis

    // Calculate rotation angle: world distance traveled / player radius
    const worldDistanceTraveled = playerVelocity.length();
    let meshRotationAngle = worldDistanceTraveled / playerRadius; 

    // --- Debugging Logs & Angle Amplification ---
    meshRotationAngle *= 20; // <<< TEMPORARILY Multiply angle for testing
    if (playerVelocity.lengthSq() > 0.00001) { // Only log if moving significantly
        console.log(`Rolling Debug: Angle=${meshRotationAngle.toFixed(4)}, Axis=(${meshRotationAxis.x.toFixed(2)}, ${meshRotationAxis.y.toFixed(2)}, ${meshRotationAxis.z.toFixed(2)})`);
    }
    // --- End Debugging Logs ---

    // Apply rotation around the world axis
    playerSphere.rotateOnWorldAxis(meshRotationAxis, -meshRotationAngle); 
}

function updateCamera() {
    if (!playerSphere) return;
    
    // Get player and planet WORLD positions
    playerSphere.getWorldPosition(_playerWorldPos);
    homePlanet.getWorldPosition(_homePlanetWorldPos);
    
    // Calculate the current surface normal at player position using WORLD positions
    const surfaceNormal = _playerWorldPos.clone().sub(_homePlanetWorldPos).normalize();
    
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
    const desiredPosition = _playerWorldPos.clone().add(rotatedOffset);
    
    // Set camera position directly (no lerp/smoothing)
    camera.position.copy(desiredPosition);

    // --- Calculate Camera Orientation Robustly --- 
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(
        camera.position, // Eye position
        _playerWorldPos, // Target WORLD position to look at
        surfaceNormal // Up vector (use the world surface normal)
    );

    // Apply the rotation component of the matrix to the camera quaternion
    camera.quaternion.setFromRotationMatrix(lookAtMatrix);

    // We no longer need to manually set camera.up or call camera.lookAt()
    // camera.up.copy(surfaceNormal); // No longer needed
    // camera.lookAt(playerSphere.position); // No longer needed
}

// Rotate and check for gem collection
function updateGems() {
    if (!playerSphere || !homePlanet) return; // Ensure necessary objects exist
    
    // Get player's current WORLD position once per frame
    playerSphere.getWorldPosition(_playerWorldPos);
    const homePlanetConfig = planets[homePlanet.name].config;

    // Update all gems
    const allGems = [
        {gems: fuelGems, type: 'fuel'},
        {gems: seedGems, type: 'seeds'},
        {gems: foodGems, type: 'food'}
    ];
    
    for (const gemGroup of allGems) {
        for (let i = gemGroup.gems.length - 1; i >= 0; i--) {
            const gem = gemGroup.gems[i];
            
            // Rotate each gem for animation effect (uses gem's local rotation)
            gem.rotation.x += 0.01;
            gem.rotation.y += 0.02;
            
            // Get gem's WORLD position
            gem.getWorldPosition(_gemWorldPos);
            
            // Check distance to player using WORLD positions
            const distanceToPlayer = _playerWorldPos.distanceTo(_gemWorldPos);
            
            // --- Magnetism --- 
            if (distanceToPlayer < magneticRadius && distanceToPlayer > collectionDistance) {
                // Calculate direction in WORLD space
                const directionToPlayer = _playerWorldPos.clone().sub(_gemWorldPos).normalize();
                
                // Find gem's position relative to planet center (use gem's LOCAL position)
                const gemToPlanetDirLocal = gem.position.clone().normalize();
                
                // Calculate how much to move (in world units)
                const moveAmount = Math.min(gemAttractionSpeed, distanceToPlayer - collectionDistance);
                
                // Project the WORLD direction onto the tangent plane at the gem's position
                // Need the WORLD surface normal at the gem's location
                homePlanet.getWorldPosition(_homePlanetWorldPos);
                const gemSurfaceNormalWorld = _gemWorldPos.clone().sub(_homePlanetWorldPos).normalize();
                const projectedDirectionWorld = directionToPlayer.clone().sub(
                    gemSurfaceNormalWorld.clone().multiplyScalar(directionToPlayer.dot(gemSurfaceNormalWorld))
                ).normalize();
                
                // Calculate the movement delta in WORLD space
                const moveDeltaWorld = projectedDirectionWorld.multiplyScalar(moveAmount);
                
                // --- Convert World Delta to Local Delta --- 
                // Get planet's inverse world matrix
                _tempMatrix.copy(homePlanet.matrixWorld).invert();
                const moveDeltaLocal = moveDeltaWorld.clone().transformDirection(_tempMatrix);
                
                // Apply movement delta to gem's LOCAL position
                gem.position.add(moveDeltaLocal);
                
                // Ensure gem stays on planet surface (using LOCAL position)
                gem.position.normalize().multiplyScalar(homePlanetConfig.radius + gemSize/2);
                
                // Faster rotation (local)
                gem.rotation.x += 0.05;
                gem.rotation.y += 0.05;
                gem.rotation.z += 0.05;
            }
            
            // Check if player has collected this gem (using world distance calculated earlier)
            if (distanceToPlayer < collectionDistance) {
                // Remove gem from its parent (homePlanet), not scene
                homePlanet.remove(gem);
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

    // Path points are now stored as LOCAL coordinates relative to homePlanet
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

// Need to add _tempMatrix definition near the other temp vars
const _tempMatrix = new THREE.Matrix4();

// --- Restore Correct Initialization --- 
// console.log("Script end: Calling init() directly...");
// init(); // Keep this commented out

console.log("Script end: Adding DOMContentLoaded listener...");
window.addEventListener('DOMContentLoaded', (event) => {
    console.log('Event: DOM fully loaded and parsed. Calling init()...');
    init(); // Call init inside the listener
}); 