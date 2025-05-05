// Physics Constants
export const MAX_VELOCITY = 25; // Reduced from 30
export const ACCELERATION = 50; // Rate of acceleration
export const BOOST_MAX_VELOCITY = 60; // NEW: Max speed when boosting
export const BOOST_ACCELERATION = 100; // NEW: Acceleration when boosting
export const BOOST_COOLDOWN_DURATION = 10.0; // NEW: Seconds before boost can be used again
export const BOOST_MAX_DURATION = 3.0; // NEW: Max time boost can be active (seconds)
export const FRICTION = 0.98; // <<< MUST be less than 1 for friction
export const OUT_OF_FUEL_FRICTION = 0.94; // NEW: Stronger friction when fuel is depleted (Closer to 1.0 = gentler)
export const POLE_THRESHOLD = 1e-8;

// Path Trail Constants
export const MAX_PATH_POINTS = 1500; // INCREASED from 200
export const MIN_PATH_DISTANCE = 0.5;

// Object Sizes & Distances
export const HOME_PLANET_RADIUS = 60; // NEW: Radius of the home planet
export const PLAYER_RADIUS = 0.5; // Restored from 0.1, physics boundary
export const GEM_SIZE = 0.8;
export const STAR_RADIUS = 80;

// Resource Constants (previously Gem Interaction)
export const INITIAL_SEEDS = 0; // Changed from 3 to start with 0 seeds
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
export const NUM_MOSSY_LOGS = 5;
export const MOSSY_LOG_SCALE = 0.08;
export const MIN_DECOR_DISTANCE = 4.0; // Min distance between decorative items

// Fuel Constants
export const INITIAL_FUEL = 10; // Starting fuel units (Changed from 0)
export const MAX_FUEL = 100; // Maximum fuel capacity
export const INITIAL_FUEL_ITEMS = 20; // INCREASED from 10
export const FUEL_ITEM_COLOR = 0xff0000; // Red color for fuel items
export const FUEL_REGEN_TIME = 15; // seconds
export const FUEL_CONSUMPTION_RATE = 2; // Fuel units consumed per second of thrust (UNUSED?)
export const THRUST_FORCE = 1.0; // Acceleration provided by thrust (Increased from 0.05) (UNUSED?)
export const FUEL_PER_PICKUP = 10; // NEW: Fuel units gained per pickup item
export const FUEL_COST_PER_SEED = 5; // NEW/Ensure: Fuel units required for each seed launched

// NEW: Fuel Consumption Rates
export const FUEL_CONSUMPTION_PER_SECOND_MOVE = 0.5; // Fuel units consumed per second of normal movement
export const FUEL_CONSUMPTION_PER_SECOND_BOOST = 2.0; // Fuel units consumed per second while boosting

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
        orbitalSpeed: 0.0009,
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
export const ROLLING_SOUND_BASE_VOLUME = 1;
export const ROLLING_SOUND_FADE_DURATION = 1.0; // Duration in seconds (Increased from 0.5)
export const SLOWDOWN_SOUND_BASE_VOLUME = 0.7; // NEW: Base volume for slowdown sound

// Add other constants as needed 

// --- Physics ---
export const GRAVITY_CONSTANT = 0.005; 

// Player Configuration
export const PLAYER_SPEED = 0.15;
export const PLAYER_MODEL_SCALE = 7.0; // Scale factor for the player model (Increased from 5.0)
export const PLAYER_ROTATION_SPEED = Math.PI * 2; // Radians per second (e.g., 360 degrees/sec)

// --- Pal Configuration (NEW) ---
export const PAL_ACCELERATION = ACCELERATION * 0.27; // Reduced further from 0.7
export const PAL_MAX_VELOCITY = MAX_VELOCITY * 0.5; // Reduced further from 0.8
export const PAL_FRICTION = FRICTION; // Keep friction same for now
export const PAL_FOLLOW_DISTANCE = 3.5; // Increase slightly
export const PAL_STOPPING_DISTANCE = 2.0; // NEW: Distance at which pal stops moving towards player
export const PAL_ROTATION_SPEED = PLAYER_ROTATION_SPEED * 0.5; // Slower turning
export const PAL_ROCK_ANGLE = Math.PI / 32; // Max angle for rocking (radians, ~5.6 degrees)
export const PAL_ROCK_SPEED = 8.0; // Speed of the rocking motion (Increased from 3.0)
export const PAL_MOVE_SOUND_BASE_VOLUME = 0.8; // Base volume for pal movement (at ref distance)
export const PAL_SOUND_STOP_THRESHOLD_SQ = 0.5 * 0.5; // Speed squared threshold to start fading out sound (0.25)
export const PAL_SOUND_REF_DISTANCE = 2.5; // NEW: Distance for base volume (Reduced from 3.0)
export const PAL_SOUND_ROLLOFF_FACTOR = 0.3; // NEW: How quickly sound fades with distance
export const PAL_ARRIVAL_SOUND_COOLDOWN = 3.0; // NEW: Minimum seconds between arrival sounds
// ----------------------------

// Planet Configuration
export const NUM_PLANETS = 3;
export const SYSTEM_RADIUS = 200; // Radius of the circular path planets orbit on 

// --- Debugging ---
export const DEBUG_SHOW_PLAYER_AXES = false; // Toggle visibility of player's local axes 

// --- Player Jump --- (NEW)
export const JUMP_INITIAL_VELOCITY = 5.0; // Initial upward speed (Reduced from 12.0)
export const JUMP_GRAVITY = -19.0; // Gravity affecting the jump (Increased magnitude from -15.0)
export const BOOST_JUMP_GRAVITY = -10.0; // STRONGER gravity when boosting during a jump (Reduced magnitude from -25.0)
export const BOOST_JUMP_INITIAL_VELOCITY_MULTIPLIER = 0.7; // Reduce initial jump velocity if boosting (Increased from 0.5)
export const BOOST_JUMP_ACCELERATION_MULTIPLIER = 0.6; // Reduce horizontal boost acceleration while jumping (NEW)
// -------------------

// --- Boost Trail --- (NEW)
export const BOOST_TRAIL_COLOR = 0x00aaff; // Light blue
export const BOOST_TRAIL_LENGTH = 30; // Number of segments
export const BOOST_TRAIL_WIDTH = 1.5; // Width at player
export const BOOST_TRAIL_MIN_WIDTH = 0.1; // Width at tail end 

// --- NEW: Enemy Configuration ---
// <<< REMOVE DUPLICATE BLOCK >>>

// --- NEW: Purple Tree Config ---
export const NUM_PURPLE_TREES = 3;
export const PURPLE_TREE_SCALE = 0.7;

// --- NEW: Enemy Deactivation Node Constants ---
export const NODES_REQUIRED = 3;
export const NODE_ACTIVATION_DURATION = 2.0; // seconds to stand near node
export const NODE_INTERACTION_DISTANCE = 5.0; // How close player needs to be to activate
export const MIN_NODE_DISTANCE = 20.0; // Minimum distance between spawned nodes

// Enemy Constants
export const ENEMY_RADIUS = PLAYER_RADIUS * 5.0; // <<< INCREASED Multiplier AGAIN: Approximate radius for collision
export const ENEMY_ACCELERATION = 15.0;
export const ENEMY_FRICTION = 0.95;
export const ENEMY_MAX_VELOCITY = 8.0;

// --- Audio System Constants ---
// ... existing code ...

// --- END OF FILE (Remove duplicated sections below) --- 