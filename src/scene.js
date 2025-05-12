import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { createSphere } from './planets.js'; // Import from planets module
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'; // Import GLTFLoader
// import { createStarfield } from './utils.js'; // Or move createStarfield here

let scene, camera, renderer, star, starfield;
let audioListener; // Keep audio listener setup here, attached to camera

// Temporary stand-in functions until modules are complete
// function createSphere(...) // REMOVED

function createStarfield(starCount = 5000, radius = 5000) {
    const starVertices = []; // <<< Added star vertex generation back temporarily
    for (let i = 0; i < starCount; i++) {
        const theta = 2 * Math.PI * Math.random(); 
        const phi = Math.acos(2 * Math.random() - 1); 
        const r = radius * Math.cbrt(Math.random()); 
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        starVertices.push(x, y, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: true }); // Adjusted size
    return new THREE.Points(geometry, material);
}
// End temporary functions

export function initScene() {
    console.log("Scene INIT: Initializing scene, camera, renderer, lights...");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Create camera
    camera = new THREE.PerspectiveCamera(
        config.CAMERA_FOV,
        window.innerWidth / window.innerHeight,
        config.CAMERA_NEAR,
        config.CAMERA_FAR
    );
    
    // Find the home planet
    const homePlanet = config.planetConfigs.find(p => p.isHome);
    if (homePlanet) {
        // Calculate planet's position based on its orbital parameters
        const planetX = homePlanet.orbitalDistance * Math.cos(homePlanet.initialAngle);
        const planetZ = homePlanet.orbitalDistance * Math.sin(homePlanet.initialAngle);
        
        // Start camera closer to the planet
        const startDistance = homePlanet.radius * 6; // Start even closer
        const finalDistance = homePlanet.radius * 12; // End at a closer distance
        
        // Set initial camera position
        camera.position.set(
            planetX + startDistance * 0.8,
            homePlanet.radius * 2,
            planetZ + startDistance * 0.8
        );
        camera.lookAt(new THREE.Vector3(planetX, 0, planetZ));

        // Animate camera to final position
        const startTime = Date.now();
        const duration = 5000; // 5 seconds animation (slower)

        function animateCamera() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            
            const currentDistance = startDistance + (finalDistance - startDistance) * eased;
            const currentHeight = homePlanet.radius * 2 + (homePlanet.radius * 1.5) * eased;
            
            camera.position.set(
                planetX + currentDistance * 0.8,
                currentHeight,
                planetZ + currentDistance * 0.8
            );
            camera.lookAt(new THREE.Vector3(planetX, 0, planetZ));
            
            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        }
        
        // Start the animation
        animateCamera();
    } else {
        // Fallback position if home planet not found
        camera.position.set(0, 100, 200);
        camera.lookAt(0, 0, 0);
    }

    // Create renderer
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
        throw new Error("Canvas element #game-canvas not found!");
    }
    try {
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            // logarithmicDepthBuffer: true // <<< REVERTED: Disable logarithmic depth buffer
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        // Enable shadow mapping
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // <<< REVERT back to PCFSoft
    } catch (e) {
        console.error("Scene INIT: Error creating WebGLRenderer:", e);
        throw e; // Re-throw error to stop initialization
    }
    
    // --- Lighting Setup ---
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xffffdd, 5, 4000, 1.5);
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = true;
    // Increase shadow map resolution
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 1500;
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.01;
    scene.add(sunLight);
    
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.3);
    scene.add(hemiLight);

    // --- Star Object (Loading GLTF Model) ---
    const loader = new GLTFLoader();
    loader.load(
        'models/sun_model/scene.gltf',
        (gltf) => {
            console.log("Scene INIT: Sun GLTF loaded successfully.");
            const sunModel = gltf.scene;
            
            // Create a container for the sun model and light
            const sunContainer = new THREE.Group();
            sunContainer.position.set(0, 0, 0);
            
            // Add the model to the container
            sunModel.position.set(0, 0, 0);
            const sunScale = 0.1;
            sunModel.scale.set(sunScale, sunScale, sunScale);
            sunContainer.add(sunModel);
            
            // Add the container to the scene
            scene.add(sunContainer);
            star = sunContainer;

            // --- Parent the PointLight to the Sun Container ---
            scene.remove(sunLight);
            sunLight.position.set(0, 0, 0);
            sunContainer.add(sunLight);
            console.log("Scene INIT: PointLight parented to Sun container.");

        },
        undefined,
        (error) => {
            console.error('Scene INIT: Error loading Sun GLTF model:', error);
            console.warn("Scene INIT: Falling back to sphere geometry for Sun.");
            // Create a container for the fallback sphere and light
            const sunContainer = new THREE.Group();
            sunContainer.position.set(0, 0, 0);
            
            // Add the fallback sphere to the container
            const fallbackSphere = createSphere(config.STAR_RADIUS, 0xffff00, new THREE.Vector3(0, 0, 0), 'sun_fallback');
            sunContainer.add(fallbackSphere);
            
            // Add the container to the scene
            scene.add(sunContainer);
            star = sunContainer;
            
            // Add light to the container
            scene.remove(sunLight);
            sunLight.position.set(0, 0, 0);
            sunContainer.add(sunLight);
        }
    );
    // ----------------------------------------

    // --- Starfield ---
    starfield = createStarfield();
    scene.add(starfield);
    
    // --- Audio Listener --- 
    // Needs to be attached to the camera
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    // --- Event Listeners (Window Resize) ---
    window.addEventListener('resize', onWindowResize, false);

    console.log("Scene INIT: Finished.");
    return { scene, camera, renderer, audioListener }; 
}

function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Export instances if needed by other modules directly (use with caution)
// export { scene, camera, renderer }; 