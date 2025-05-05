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
export function createSphere(radius, color, position, name, isHome = false) {
    const geometry = new THREE.SphereGeometry(radius, 64, 64); // Increased segments for potential displacement later
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
            roughness: 1.0, // Default roughness (will be modulated by map)
            metalness: 0.0, // Default metalness (non-metallic grass)
            transparent: false,
            opacity: 1.0
        };

        // Define the base path for the PBR textures
        const texturePath = 'textures/grasstextures/Grass003/2k/';

        // Apply specific textures
        if (name === 'player') {
            try {
                const playerTexture = textureLoader.load('textures/Cracked_Asphalt_DIFF.png');
                materialProps.map = playerTexture;
                materialProps.color = 0xffffff; // Player uses texture directly
            } catch (error) {
                console.error("Failed to load player texture:", error);
            }
        } else { // Apply PBR grass texture to all non-player, non-star spheres
            try {
                // Load PBR Textures
                const diffuseMap = textureLoader.load(`${texturePath}Grass003_Diffuse.png`);
                const normalMap = textureLoader.load(`${texturePath}Grass003_Normal.png`);
                const roughnessMap = textureLoader.load(`${texturePath}Grass003_Roughness.png`);
                const aoMap = textureLoader.load(`${texturePath}Grass003_Ambient Occlusion.png`);
                // const heightMap = textureLoader.load(`${texturePath}Grass008_Height.png`); // Optional: For displacement/bump

                // --- Configure Texture Wrapping and Repetition ---
                const repeatValue = 8; // Repeat 8x8 times (doubled from 4x4)
                const texturesToRepeat = [diffuseMap, normalMap, roughnessMap, aoMap];
                texturesToRepeat.forEach(texture => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(repeatValue, repeatValue);
                });
                // -----------------------------------------------
                
                // Ensure sRGBEncoding for color textures
                diffuseMap.colorSpace = THREE.SRGBColorSpace;

                // Assign maps to material properties
                materialProps.map = diffuseMap;
                materialProps.normalMap = normalMap;
                materialProps.roughnessMap = roughnessMap;
                materialProps.aoMap = aoMap;
                materialProps.aoMapIntensity = 1.0; // Adjust AO intensity if needed
                // materialProps.displacementMap = heightMap; // Add if using displacement
                // materialProps.displacementScale = 0.1; // Adjust displacement scale

                // --- Conditional Tinting ---
                if (isHome) {
                    // Home planet: Use white to show original texture color
                    materialProps.color = 0xffffff; 
                    // <<< DEBUG: Make home planet semi-transparent >>>
                    // materialProps.transparent = true; // REMOVED DEBUG
                    // materialProps.opacity = 0.5;    // REMOVED DEBUG
                    // <<< END DEBUG >>>
                } else {
                    // Other planets: Use config color to tint the texture
                    materialProps.color = color; 
                }
                // ---------------------------

                // Add UV2 attribute for AO map
                geometry.setAttribute('uv2', new THREE.BufferAttribute(geometry.attributes.uv.array, 2));

            } catch (error) {
                console.error(`Failed to load PBR grass textures for planet ${name}:`, error);
                // Fallback to simple color if textures fail
                materialProps.color = color;
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
        let planetObject; // Use generic name

        if (pConfig.name === 'Verdant Minor') {
            // For Verdant Minor, create an empty group - model loaded later
            console.log(`  Planet ${pConfig.name} will be loaded later. Creating group.`);
            planetObject = new THREE.Object3D();
            planetObject.name = pConfig.name; // Name the group
        } else {
            // For other planets, create the sphere mesh as before
            planetObject = createSphere(pConfig.radius, pConfig.color, new THREE.Vector3(), pConfig.name, pConfig.isHome);
        }
        
        scene.add(planetObject); // Add the group or mesh to the scene
        
        // Calculate initial position based on orbital parameters
        const initialX = pConfig.orbitalDistance * Math.cos(pConfig.initialAngle);
        const initialZ = pConfig.orbitalDistance * Math.sin(pConfig.initialAngle);
        planetObject.position.set(initialX, 0, initialZ); // Position the group or mesh
        
        planetsState[pConfig.name] = {
            mesh: planetObject, // Store the group or mesh
            config: pConfig,
            originalColor: new THREE.Color(pConfig.color), // Store original color
            currentAngle: pConfig.initialAngle,
            seedsDelivered: 0, // Initialize seed count
            seedsRequired: config.SEEDS_REQUIRED_TERRAFORM // Store requirement
        };

        console.log(`  Planet ${pConfig.name} object initialized at angle ${pConfig.initialAngle.toFixed(2)}.`);

        if (pConfig.isHome) {
            homePlanet = planetObject; // Store the mesh reference
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