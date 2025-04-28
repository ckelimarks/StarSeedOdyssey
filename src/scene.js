import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { createSphere } from './planets.js'; // Import from planets module
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

    // --- Camera Setup ---
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(config.CAMERA_FOV, aspect, config.CAMERA_NEAR, config.CAMERA_FAR);
    // Initial position set later based on player

    // --- Renderer Setup ---
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
        throw new Error("Canvas element #game-canvas not found!");
    }
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        // Enable shadow mapping
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (e) {
        console.error("Scene INIT: Error creating WebGLRenderer:", e);
        throw e; // Re-throw error to stop initialization
    }
    
    // --- Lighting Setup ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const starPosition = new THREE.Vector3(0, 0, 0);
    const starLight = new THREE.PointLight(0xffffdd, 5, 4000, 1.5);
    starLight.position.copy(starPosition);
    starLight.castShadow = true;
    starLight.shadow.mapSize.width = 2048;
    starLight.shadow.mapSize.height = 2048;
    starLight.shadow.camera.near = 50;
    starLight.shadow.camera.far = config.CAMERA_FAR; // Use far plane from config
    scene.add(starLight);
    
    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.3);
    scene.add(hemiLight);

    // --- Star Object ---
    star = createSphere(config.STAR_RADIUS, 0xffff00, starPosition, 'star'); // Uses imported createSphere
    scene.add(star);

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