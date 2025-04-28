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
    config.planetConfigs.forEach(configItem => {
        const geometry = new THREE.SphereGeometry(configItem.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: configItem.color });
        const planetMesh = new THREE.Mesh(geometry, material);
        planetMesh.name = configItem.name; // Assign name to mesh

        // Calculate initial position based on angle and distance
        const initialX = Math.cos(configItem.initialAngle) * configItem.orbitalDistance;
        const initialZ = Math.sin(configItem.initialAngle) * configItem.orbitalDistance;
        planetMesh.position.set(initialX, 0, initialZ);

        scene.add(planetMesh);

        // Store planet data including mesh, config, angle, and terraforming state
        planets[configItem.name] = {
            mesh: planetMesh,
            config: configItem,
            currentAngle: configItem.initialAngle,
            seedsDelivered: 0, // Initialize seed count
            seedsRequired: config.SEEDS_REQUIRED_TERRAFORM // Store required amount
        };

        console.log(`  Planet ${configItem.name} initialized at angle ${configItem.initialAngle.toFixed(2)}.`);

        if (configItem.isHome) {
            homePlanet = planetMesh;
            console.log(`  -> Identified ${configItem.name} as the home planet.`);
        }
    });

    if (!homePlanet) {
        console.warn("No home planet specified in config. Defaulting to the first planet.");
        // Fallback: use the first planet in the config as home if none is explicitly marked
        if (config.planetConfigs.length > 0) {
            const firstPlanetName = config.planetConfigs[0].name;
            homePlanet = planets[firstPlanetName]?.mesh;
            if(homePlanet) console.log(`  -> Defaulted home planet to ${firstPlanetName}.`);
        }
    }
    
    if (!homePlanet) {
         // This is a critical error if no planets could be assigned as home
         throw new Error("FATAL: Could not designate a home planet during initialization.");
    }

    console.log("Planet initialization complete.");
    return { planets, homePlanet }; // Return the map and home planet mesh ref
}

// Update Planet Orbits
export function updateOrbits() {
    for (const planetName in planets) {
        const planetData = planets[planetName];
        const config = planetData.config;
        const mesh = planetData.mesh;
        
        planetData.currentAngle += config.orbitalSpeed; 
        planetData.currentAngle %= (2 * Math.PI);
        
        const newX = config.orbitalDistance * Math.cos(planetData.currentAngle);
        const newZ = config.orbitalDistance * Math.sin(planetData.currentAngle);
        
        mesh.position.set(newX, 0, newZ);
    }
} 