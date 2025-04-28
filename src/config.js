// Physics Constants
export const MAX_VELOCITY = 0.008;
export const ACCELERATION = 0.0005;
export const FRICTION = 0.92;
export const POLE_THRESHOLD = 1e-8;

// Path Trail Constants
export const MAX_PATH_POINTS = 200;
export const MIN_PATH_DISTANCE = 0.5;

// Object Sizes & Distances
export const HOME_PLANET_RADIUS = 40; // Base value, might be superseded by config
export const PLAYER_RADIUS = 1;
export const GEM_SIZE = 0.8;
export const STAR_RADIUS = 80;

// Resource Constants (previously Gem Interaction)
export const INITIAL_SEEDS = 3; // Starting seed count
export const MAX_SEEDS = 10; // Maximum seed capacity
export const INITIAL_SEED_GEMS = 15; // Number of visual seed items to spawn initially
export const SEED_GEM_COLOR = 0x00ff00; // Color for visual seed items
export const COLLECTION_DISTANCE = PLAYER_RADIUS + GEM_SIZE; // Distance to collect visual items
export const GEM_MAGNET_DISTANCE = 8; // Distance at which visual items start moving towards player
export const GEM_MAGNET_STRENGTH = 0.1; // How strongly visual items are pulled
export const MIN_GEM_DISTANCE = 5; // Minimum distance between spawned visual items
export const SEED_REGEN_TIME = 20; // Seconds before a collected seed regenerates

// Fuel Constants
export const INITIAL_FUEL = 50; // Starting fuel units
export const MAX_FUEL = 100; // Maximum fuel capacity
export const INITIAL_FUEL_ITEMS = 10; // Number of visual fuel items
export const FUEL_ITEM_COLOR = 0xff0000; // Red color for fuel items
export const FUEL_REGEN_TIME = 30; // Regeneration time for fuel
export const FUEL_CONSUMPTION_RATE = 2; // Fuel units consumed per second of thrust
export const THRUST_FORCE = 1.0; // Acceleration provided by thrust (Increased from 0.05)
export const FUEL_COST_PER_SEED = 2; // Fuel units required for each seed launched

// Terraforming Constants
export const SEEDS_REQUIRED_TERRAFORM = 10; // Seeds needed to terraform a planet

// Rocket Constants
export const ROCKET_MAX_PAYLOAD = 5; // Max seeds per rocket launch
export const ROCKET_RADIUS = 0.5;
export const ROCKET_HEIGHT = 2;
export const ROCKET_COLOR = 0xcccccc;
export const ROCKET_TRAVEL_DURATION = 10.0; // Seconds for rocket to reach target (lerp)
export const LAUNCH_PAD_OFFSET = { x: 1, y: 0, z: 0 }; // Local offset from North Pole (Reduced x offset)
export const LAUNCH_TRIGGER_DISTANCE = 5.0; // How close player must be to launch rocket

// Camera Constants
export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 10000;
export const CAMERA_OFFSET = { x: 0, y: 10, z: 20 }; // Default offset for player
export const ROCKET_CAMERA_OFFSET = { x: 0, y: 5, z: -15 }; // Behind and slightly above the rocket
export const CAMERA_SMOOTH_FACTOR = 0.05; // Lower value = smoother/slower interpolation

// Planet Configuration Data Structure
export const planetConfigs = [
    {
        name: 'AquaPrime',
        radius: 40,
        color: 0x0055ff,
        orbitalDistance: 300,
        orbitalSpeed: 0.001,
        initialAngle: 0,
        isHome: true
    },
    {
        name: 'Infernia',
        radius: 30,
        color: 0xff6600,
        orbitalDistance: 500,
        orbitalSpeed: 0.0007,
        initialAngle: Math.PI / 2,
        isHome: false
    },
    {
        name: 'Verdant Minor',
        radius: 25,
        color: 0x00ff88,
        orbitalDistance: 700,
        orbitalSpeed: 0.0005,
        initialAngle: Math.PI,
        isHome: false
    }
];

// Sound Configuration
export const pickupSoundSegments = [
    { offset: 0, duration: 2 }, // 0-2 seconds
    { offset: 3, duration: 2 }, // 3-5 seconds
    { offset: 6, duration: 2 }  // 6-8 seconds
];

// Add other constants as needed 

// --- Physics ---
export const GRAVITY_CONSTANT = 0.005; 