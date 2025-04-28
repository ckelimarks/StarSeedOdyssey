import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { createSphere } from './planets.js';

// Module-level variables for player state
let playerSphere = null;
let playerVelocity = new THREE.Vector3();
const keyState = { 
    'ArrowUp': false, 
    'ArrowDown': false, 
    'ArrowLeft': false, 
    'ArrowRight': false,
    ' ': false // Spacebar
};

// Path Trail variables
let pathPoints = [];
let pathLine = null;
let needsPathUpdate = false;

// Temporary vectors for calculations within this module
const _tempMatrix = new THREE.Matrix4();
const _playerWorldPos = new THREE.Vector3();
const _homePlanetWorldPos = new THREE.Vector3();
const _vector3 = new THREE.Vector3(); // General purpose temp vector

// NEW: Store Audio Listener reference
let audioListenerRef = null;

// Initialize Player
function initPlayer(homePlanet, audioListener) {
    console.log("Player INIT: Creating player sphere...");
    if (!homePlanet) {
        throw new Error("Player INIT: homePlanet is required.");
    }
    if (!audioListener) {
        console.warn("Player INIT: Audio Listener not provided.");
    } else {
        audioListenerRef = audioListener; // Store reference
    }
    // Need access to home planet config
    const homePlanetConfig = config.planetConfigs.find(p => p.name === homePlanet.name);
    if (!homePlanetConfig) {
        throw new Error(`Player INIT: Cannot find config for home planet: ${homePlanet.name}`);
    }

    // Player position is LOCAL to the home planet
    const playerLocalPosition = new THREE.Vector3(0, homePlanetConfig.radius + config.PLAYER_RADIUS, 0); 
    playerSphere = createSphere(config.PLAYER_RADIUS, 0xffffff, playerLocalPosition, 'player');
    homePlanet.add(playerSphere);
    console.log(`Player INIT: Player added as child of ${homePlanet.name}`);

    // Initialize Path Trail
    const pathMaterial = new THREE.LineDashedMaterial({ 
        color: 0xffffff, 
        linewidth: 1, 
        scale: 1, 
        dashSize: config.MIN_PATH_DISTANCE * 0.6, // Adjust dash based on min dist
        gapSize: config.MIN_PATH_DISTANCE * 0.4
    });
    const pathGeometry = new THREE.BufferGeometry();
    pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,1], 3)); 
    pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.computeLineDistances();
    homePlanet.add(pathLine); // Add trail to home planet
    console.log("Player INIT: Path trail initialized and added.");

    // Setup Controls
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    console.log("Player INIT: Controls initialized.");
    
    return playerSphere;
}

// Event Handlers
function handleKeyDown(event) {
    if (event.key in keyState) {
        keyState[event.key] = true;
        
        // *** NEW: Resume Audio Context on first key press ***
        if (audioListenerRef && audioListenerRef.context.state === 'suspended') {
            console.log("Resuming audio context...");
            audioListenerRef.context.resume();
        }
    }
}

function handleKeyUp(event) {
    if (event.key in keyState) {
        // console.log(`Key Up: ${event.key}`);
        keyState[event.key] = false;
    }
}

// Update Player Movement
function updatePlayerMovement(camera, homePlanet, planetsState) {
    if (!playerSphere || !homePlanet || !planetsState) return;

    const homePlanetConfig = planetsState[homePlanet.name]?.config;
    if (!homePlanetConfig) {
        console.error("updatePlayerMovement: Missing config for home planet!");
        return;
    }

    // Get current world positions
    playerSphere.getWorldPosition(_playerWorldPos);
    homePlanet.getWorldPosition(_homePlanetWorldPos);

    // Calculate the up vector (normal to planet surface) using WORLD positions
    const planetUp = _vector3.copy(_playerWorldPos).sub(_homePlanetWorldPos).normalize();
    
    // --- Calculate Tangent Forward (World Space) --- 
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    let tangentForward = cameraForward.clone().sub(
        planetUp.clone().multiplyScalar(cameraForward.dot(planetUp))
    );
    const isForwardUnstable = tangentForward.lengthSq() < config.POLE_THRESHOLD;
    
    // --- Calculate Tangent Right Directly (World Space) --- 
    const cameraRightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    let tangentRight = cameraRightWorld.clone().sub(
        planetUp.clone().multiplyScalar(cameraRightWorld.dot(planetUp))
    );
    if (tangentRight.lengthSq() < config.POLE_THRESHOLD) { 
        if (isForwardUnstable) {
             const worldX = new THREE.Vector3(1, 0, 0);
             tangentRight = worldX.clone().sub(
                  planetUp.clone().multiplyScalar(worldX.dot(planetUp))
             );
             if (tangentRight.lengthSq() < config.POLE_THRESHOLD) {
                  const worldZ = new THREE.Vector3(0, 0, 1);
                  tangentRight = worldZ.clone().sub(
                       planetUp.clone().multiplyScalar(worldZ.dot(planetUp))
                  );
             }
        } else {
             tangentRight = new THREE.Vector3().crossVectors(planetUp, tangentForward); 
        }
    }
    tangentRight.normalize();

    // --- Refine Tangent Forward (World Space) ---
    if (isForwardUnstable) { 
        tangentForward = new THREE.Vector3().crossVectors(tangentRight, planetUp);
    }
    tangentForward.normalize();
    
    // --- Calculate Movement Delta --- 
    let accelerationDirection = new THREE.Vector3();
    if (keyState['ArrowUp']) accelerationDirection.copy(tangentForward); 
    else if (keyState['ArrowDown']) accelerationDirection.copy(tangentForward).negate(); 
    else if (keyState['ArrowLeft']) accelerationDirection.copy(tangentRight).negate(); 
    else if (keyState['ArrowRight']) accelerationDirection.copy(tangentRight); 

    if (accelerationDirection.lengthSq() > 0) {
        playerVelocity.add(accelerationDirection.multiplyScalar(config.ACCELERATION));
        if (playerVelocity.length() > config.MAX_VELOCITY) {
            playerVelocity.normalize().multiplyScalar(config.MAX_VELOCITY);
        }
    } else {
        playerVelocity.multiplyScalar(config.FRICTION);
    }
    
    if (playerVelocity.length() < 0.0005) {
        playerVelocity.set(0, 0, 0);
    }
    
    // --- Update Position & Trail --- 
    if (playerVelocity.lengthSq() === 0) {
        // Stationary: Clamp local position
        playerSphere.position.normalize().multiplyScalar(homePlanetConfig.radius + config.PLAYER_RADIUS);
    } else {
        // Moving: Apply movement and update trail
        const moveDirection = playerVelocity.clone().normalize();
        const positionRotationAxis = new THREE.Vector3().crossVectors(planetUp, moveDirection).normalize();
        const angle = playerVelocity.length(); // Arc length relative to planet center

        // Apply rotation to the LOCAL position vector around the WORLD axis
        playerSphere.position.applyAxisAngle(positionRotationAxis, angle); 
        
        // Keep player precisely on the surface (LOCAL Space clamping)
        playerSphere.position.normalize().multiplyScalar(homePlanetConfig.radius + config.PLAYER_RADIUS);

        // Update Path Trail (Store LOCAL Points)
        _tempMatrix.copy(homePlanet.matrixWorld).invert();
        const playerLocalPosForTrail = _playerWorldPos.clone().applyMatrix4(_tempMatrix);
        const lastPoint = pathPoints.length > 0 ? pathPoints[pathPoints.length - 1] : null;
        if (!lastPoint || playerLocalPosForTrail.distanceTo(lastPoint) > config.MIN_PATH_DISTANCE) {
            pathPoints.push(playerLocalPosForTrail.clone());
            if (pathPoints.length > config.MAX_PATH_POINTS) pathPoints.shift();
            needsPathUpdate = true;
        }
    }

    // --- Rotate the player mesh itself --- 
    if (playerVelocity.lengthSq() > 0) {
        const moveDirection = playerVelocity.clone().normalize(); // World move direction
        const meshRotationAxis = new THREE.Vector3().crossVectors(moveDirection, planetUp).normalize(); // World axis
        const worldDistanceTraveled = playerVelocity.length();
        let meshRotationAngle = worldDistanceTraveled / config.PLAYER_RADIUS;

        // REMOVE TEMPORARY AMPLIFIER
        // meshRotationAngle *= 20; // Temporarily amplified for debugging
        meshRotationAngle *= 15; // Increased multiplier for faster rotation
        
        playerSphere.rotateOnWorldAxis(meshRotationAxis, -meshRotationAngle);
    }
}

// Update Path Trail Geometry
function updatePathTrail() {
    if (!needsPathUpdate || !pathLine || pathPoints.length < 2) return;

    const positions = pathPoints.flatMap(p => [p.x, p.y, p.z]);
    pathLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pathLine.computeLineDistances(); 
    pathLine.geometry.attributes.position.needsUpdate = true;
    pathLine.geometry.computeBoundingSphere();
    needsPathUpdate = false;
}

// Export keyState and functions together at the end
export { initPlayer, updatePlayerMovement, updatePathTrail, keyState }; 