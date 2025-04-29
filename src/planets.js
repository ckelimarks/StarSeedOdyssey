import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';

// Module-level variables for planet data
const planets = {}; // Stores { mesh, config, currentAngle }
let homePlanet = null; // Reference to the home planet mesh

// Reusable Texture Loader
const textureLoader = new THREE.TextureLoader();

// Temporary vectors for orbit calculations
const _axis = new THREE.Vector3(0, 1, 0); // Assuming orbits are around the world Y axis
const _center = new THREE.Vector3(0, 0, 0); // Assuming star/center is at origin

// Moved from scene.js - Creates Sphere Meshes (Planets, Player, Star)
export function createSphere(radius, color, position, name) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    let material;

    if (name === 'star') {
        // Star material (doesn't cast/receive shadows, emissive)
        material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 1.5,
            roughness: 0.1,
            metalness: 0.3
        });
    } else {
        // Base material properties for planets/player
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
                materialProps.color = 0xffffff; // Player uses texture directly
            } catch (error) {
                console.error("Failed to load player texture:", error);
            }
        } else { // Apply default planet texture to all non-player, non-star spheres
            try {
                const planetTexture = textureLoader.load('textures/ground.jpg');
                planetTexture.wrapS = THREE.RepeatWrapping;
                planetTexture.wrapT = THREE.RepeatWrapping;
                planetTexture.repeat.set(8, 4); 
                materialProps.map = planetTexture;
                // Don't set color to white here, allow tinting based on config.color
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
    return sphere;
}

// Initialize planets based on config
export function initPlanets(scene) {
    console.log("Initializing planets...");
    const planetsState = {};
    let homePlanet = null;

    config.planetConfigs.forEach(pConfig => {
        const planetMesh = createSphere(pConfig.radius, pConfig.color, new THREE.Vector3(), pConfig.name);
        scene.add(planetMesh);
        
        // Calculate initial position based on orbital parameters
        const initialX = pConfig.orbitalDistance * Math.cos(pConfig.initialAngle);
        const initialZ = pConfig.orbitalDistance * Math.sin(pConfig.initialAngle);
        planetMesh.position.set(initialX, 0, initialZ);
        
        planetsState[pConfig.name] = {
            mesh: planetMesh,
            config: pConfig,
            originalColor: new THREE.Color(pConfig.color), // Store original color
            currentAngle: pConfig.initialAngle,
            seedsDelivered: 0, // Initialize seed count
            seedsRequired: config.SEEDS_REQUIRED_TERRAFORM // Store requirement
        };

        console.log(`  Planet ${pConfig.name} initialized at angle ${pConfig.initialAngle.toFixed(2)}.`);

        if (pConfig.isHome) {
            homePlanet = planetMesh;
            console.log(`  -> Identified ${pConfig.name} as the home planet.`);
        }
    });

    if (!homePlanet) {
        console.warn("No home planet specified in config. Defaulting to the first planet.");
        // Fallback: use the first planet in the config as home if none is explicitly marked
        if (config.planetConfigs.length > 0) {
            const firstPlanetName = config.planetConfigs[0].name;
            homePlanet = planetsState[firstPlanetName]?.mesh;
            if(homePlanet) console.log(`  -> Defaulted home planet to ${firstPlanetName}.`);
        }
    }
    
    if (!homePlanet) {
         // This is a critical error if no planets could be assigned as home
         throw new Error("FATAL: Could not designate a home planet during initialization.");
    }

    console.log("Planet initialization complete.");
    return { planets: planetsState, homePlanet }; // Return the map and home planet mesh ref
}

// Update Planet Orbits
export function updateOrbits(planetsState, deltaTime) {
    // Iterate over the passed-in planetsState map
    for (const planetName in planetsState) { 
        const planetData = planetsState[planetName];
        // Ensure planetData and necessary properties exist before proceeding
        if (!planetData || !planetData.config || !planetData.mesh) {
            console.warn(`Skipping orbit update for ${planetName}: Invalid data.`);
            continue; // Skip to the next planet
        }

        const config = planetData.config;
        const mesh = planetData.mesh;
        
        // Use deltaTime for speed calculation if desired in the future,
        // but for now, stick to the constant orbitalSpeed from config.
        planetData.currentAngle += config.orbitalSpeed; // Using constant speed
        // Ensure angle stays within 0 to 2*PI range
        if (planetData.currentAngle < 0) planetData.currentAngle += 2 * Math.PI;
        planetData.currentAngle %= (2 * Math.PI);
        
        const newX = config.orbitalDistance * Math.cos(planetData.currentAngle);
        const newZ = config.orbitalDistance * Math.sin(planetData.currentAngle);
        
        mesh.position.set(newX, 0, newZ);
    }
} 