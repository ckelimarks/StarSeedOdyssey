// Physics Constants
export const MAX_VELOCITY = 30; // Resetting to a more moderate value
export const ACCELERATION = 50; // Resetting to a more moderate value
export const FRICTION = 0.98; // <<< MUST be less than 1 for friction
export const POLE_THRESHOLD = 1e-8;

// Path Trail Constants
export const MAX_PATH_POINTS = 200;
export const MIN_PATH_DISTANCE = 0.5;

// Object Sizes & Distances
export const HOME_PLANET_RADIUS = 60; // NEW: Radius of the home planet
export const PLAYER_RADIUS = 0.5; // Restored from 0.1, physics boundary
export const GEM_SIZE = 0.8;
export const STAR_RADIUS = 80;

// Resource Constants (previously Gem Interaction)
export const INITIAL_SEEDS = 3; // Starting seed count
export const MAX_SEEDS = 10; // Maximum seed capacity
export const INITIAL_SEED_GEMS = 15; // Number of visual seed items to spawn initially
export const SEED_GEM_COLOR = 0x00ff00; // Color for visual seed items
export const COLLECTION_DISTANCE = 2.5; // Increased from 1.8 (Used for FUEL now)
export const TREE_COLLECTION_DISTANCE = 5.0; // NEW: Larger distance for trees
export const GEM_MAGNET_DISTANCE = 8.0; // (Disabled for trees)
export const GEM_MAGNET_STRENGTH = 0.05; // (Disabled for trees)
export const MIN_GEM_DISTANCE = 2.5;
export const SEED_REGEN_TIME = 10; // seconds

// Decorative Item Config (NEW)
export const NUM_MOSSY_LOGS = 15;
export const MOSSY_LOG_SCALE = 1.2;
export const MIN_DECOR_DISTANCE = 4.0; // Min distance between decorative items

// Fuel Constants
export const INITIAL_FUEL = 0; // Starting fuel units (Changed from 50)
export const MAX_FUEL = 100; // Maximum fuel capacity
export const INITIAL_FUEL_ITEMS = 20; // INCREASED from 10
export const FUEL_ITEM_COLOR = 0xff0000; // Red color for fuel items
export const FUEL_REGEN_TIME = 15; // seconds
export const FUEL_CONSUMPTION_RATE = 2; // Fuel units consumed per second of thrust (UNUSED?)
export const THRUST_FORCE = 1.0; // Acceleration provided by thrust (Increased from 0.05) (UNUSED?)
export const FUEL_PER_PICKUP = 10; // NEW: Fuel units gained per pickup item
export const FUEL_COST_PER_SEED = 5; // NEW/Ensure: Fuel units required for each seed launched

// Terraforming Constants
export const SEEDS_REQUIRED_TERRAFORM = 10; // Seeds needed to terraform a planet
export const TERRAFORM_DURATION = 7.0; // SHORTER: Duration in seconds for color change (was 10.0)

// Rocket Constants
export const ROCKET_MAX_PAYLOAD = 5; // Max seeds per rocket launch
export const ROCKET_RADIUS = 0.5;
export const ROCKET_HEIGHT = 2;
export const ROCKET_COLOR = 0xcccccc;
export const ROCKET_TRAVEL_DURATION = 10.0; // Seconds for rocket to reach target (lerp)
export const ROCKET_LANDING_LINGER = 2.0; // Seconds to linger camera after landing
export const ROCKET_LAUNCH_DELAY = 2.0; // Seconds between launch trigger and actual liftoff
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
        radius: HOME_PLANET_RADIUS,
        color: 0x6699ff,
        orbitalDistance: 300,
        orbitalSpeed: 0.0005,
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

// NEW Rolling Sound Config
export const ROLLING_SOUND_BASE_VOLUME = 0.2;
export const ROLLING_SOUND_FADE_DURATION = 1.0; // Duration in seconds (Increased from 0.5)

// Add other constants as needed 

// --- Physics ---
export const GRAVITY_CONSTANT = 0.005; 

// Player Configuration
export const PLAYER_SPEED = 0.15;
export const PLAYER_MODEL_SCALE = 7.0; // Scale factor for the player model (Increased from 5.0)
export const PLAYER_ROTATION_SPEED = Math.PI * 2; // Radians per second (e.g., 360 degrees/sec)

// Planet Configuration
export const NUM_PLANETS = 3;
export const SYSTEM_RADIUS = 200; // Radius of the circular path planets orbit on 

// --- Debugging ---
export const DEBUG_SHOW_PLAYER_AXES = true; // Toggle visibility of player's local axes 