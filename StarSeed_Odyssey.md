# StarSeed: Odyssey - Project Documentation

## Game Concept

StarSeed: Odyssey is a 3D space exploration and terraforming game prototype. The core concept revolves around piloting a small spacecraft around a home planet within a solar system.

**Core Mechanics (Including Planned Features):**

*   **Player Control:** Navigate the spacecraft across the surface of the home planet using keyboard controls (arrow keys for movement, Shift for boost).
*   **Resource Gathering:** Collect "Seeds" (currently represented by tree models) and "Fuel" (represented by crystal models) scattered on the home planet's surface. Seeds are required for terraforming, and Fuel is needed to launch rockets.
*   **Inventory Management:** Track collected Seeds and Fuel via a UI display.
*   **Rocket Launch:** Fly to a designated launchpad area near the planet's pole. If sufficient Seeds and Fuel are available, the player can initiate a rocket launch sequence (currently triggered by Spacebar) to send Seeds to a target planet. *Planned: RNG chance of launch failure.*
*   **Terraforming Multiple Planets:** Deliver enough Seeds via rockets to designated target planets (e.g., 'Infernia', 'Verdant Minor') to meet their requirements. Once met, the player can trigger the terraforming process (via a UI button), which visually changes the target planet.
*   *Planned: Compass & Navigation:* Implement UI elements and systems to help the player navigate towards target planets, the launchpad, or other points of interest.
*   *Planned: Planetary Enemies:* Introduce hostile entities or environmental hazards on planets that the player must avoid or manage.
*   *Planned: Planet Health & Resource Management:* Implement a system where the home planet has a "health" or ecological score. Extracting resources too rapidly could damage the planet, reducing resource availability or introducing negative consequences.
*   *Planned: Asteroid Threat:* Introduce time-sensitive events where an asteroid threatens the home planet, requiring player intervention (e.g., launching a defensive rocket).

**Goal:**

The primary objective is to explore the solar system, gather resources sustainably from the home planet, manage threats, and successfully terraform multiple target planets by launching seed-carrying rockets.

## File Structure

```
.
├── .git/               # Git repository data
├── textures/           # Texture files for models and planets
├── style.css           # Basic CSS styling for HTML elements
├── src/                # Core source code modules (JavaScript)
│   ├── scene.js        # Scene, camera, lighting setup
│   ├── config.js       # Game constants and configurations
│   ├── player.js       # Player ship logic, movement, controls
│   ├── planets.js      # Planet creation, orbits, terraforming state
│   ├── resources.js    # Resource management (Seeds, Fuel), pickup logic, UI updates
│   ├── rocket.js       # Rocket logic, launch sequence, camera control
│   ├── utils.js        # Utility functions
│   └── main.js         # Main application entry point, game loop, initialization
├── ship/               # Player ship GLTF model files
├── index.html          # Main HTML file, canvas container, static UI elements
├── .DS_Store           # macOS system file
├── .gitignore          # Specifies intentionally untracked files for Git
├── ship.zip            # Zipped player ship model (likely unused now)
├── sfx/                # Sound effect files
├── models/             # GLTF models for resources (trees, crystals, logs)
├── phaseIIplan.md      # Planning document (likely outdated)
├── rocket_plan.md      # Planning document (likely outdated)
├── game.js             # Potentially unused/outdated JS file
└── plan.md             # Planning document (likely outdated)
```

## Code Architecture Overview

The project follows a modular JavaScript structure using ES Modules. Key modules and their responsibilities:

*   **`main.js`**: The main entry point. Initializes all other modules, manages the main game loop (`animate`), orchestrates high-level game state transitions (like launch sequences, terraforming triggers), and handles creation/updates for some core UI elements not managed by `resources.js`.
*   **`config.js`**: Centralized configuration file containing constants for physics, resource tuning, planet properties, UI settings, etc. Allows for easy tweaking of game balance and parameters.
*   **`scene.js`**: Sets up the fundamental Three.js components: `Scene`, `PerspectiveCamera`, `WebGLRenderer`, lighting (ambient and directional), and the `AudioListener`.
*   **`player.js`**: Manages the player spacecraft, including:
    *   Loading the player model.
    *   Handling keyboard input (`keyState`).
    *   Calculating movement physics (velocity, acceleration, friction, gravity) relative to the home planet's surface.
    *   Managing player orientation (aligning with surface normal and velocity).
    *   Handling the boost mechanic and its state.
    *   Generating the path trail effect.
*   **`planets.js`**: Responsible for creating the planets (home and orbiting) based on configurations. It calculates and updates the orbital positions of non-home planets each frame. It also manages the state related to terraforming for each planet (seeds delivered, requirements, terraforming status).
*   **`resources.js`**: Handles the lifecycle of collectible resources (Seeds and Fuel). This includes:
    *   Loading resource models (trees, crystals, decorative logs).
    *   Procedurally placing resources on the home planet surface, ensuring minimum spacing.
    *   Managing resource collection logic (proximity checks).
    *   Handling resource respawning after a set time.
    *   Managing the player's inventory (`inventory` object).
    *   Creating and updating the core inventory UI display.
    *   Loading and providing functions to play various sound effects.
*   **`rocket.js`**: Manages the launch sequence, rocket model, and associated camera control. Includes logic for checking launch conditions, animating the rocket's travel, and handling camera transitions during launch and landing.
*   **`utils.js`**: Contains helper functions used across different modules, such as calculating random positions on a sphere or checking distances.

**Interaction Flow (Simplified):**

1.  `main.js` initializes all modules.
2.  The `animate` loop in `main.js` runs every frame.
3.  `animate` calls update functions in other modules:
    *   `updateOrbits` (`planets.js`) moves orbiting planets.
    *   `updatePlayer` (`player.js`) processes input, calculates physics, and moves/orients the player mesh.
    *   `updateResources` (`resources.js`) checks for collections, handles respawns, and updates the inventory UI.
    *   `updateRocket` (`rocket.js`) manages rocket state if active.
    *   `updateCamera` (`camera.js` - *Note: camera logic seems integrated into `main.js` and `rocket.js` currently*) updates the camera position based on player or rocket focus.
4.  Modules like `player.js` and `resources.js` read values from `config.js`.
5.  Player actions (like collecting resources or launching rockets) trigger functions in `resources.js` or `rocket.js`, often updating shared state managed in `main.js` or `planets.js`.

## Implementation Details

### Physics (Primarily in `player.js`)

*   **Movement Model:** A simple physics model based on applying acceleration (`config.ACCELERATION`) in the direction of input keys, capped by `config.MAX_SPEED`. Velocity is stored in `playerState.velocity`.
*   **Surface-Relative Motion:** Movement calculations happen relative to the player's current orientation on the planet surface. Input vectors (forward/backward) are transformed based on the player's local axes.
*   **Gravity:** A constant force (`config.GRAVITY_CONSTANT` - *Note: This might not be explicitly implemented as a continuous force but rather implicitly handled by keeping the player snapped to the surface*) is simulated by ensuring the player stays on or near the planet's surface. The primary mechanism is adjusting the player's position along the surface normal.
*   **Friction:** A damping factor (`config.FRICTION`) is applied to the velocity each frame (`velocity.multiplyScalar(FRICTION)`) to simulate drag and bring the player to a stop when no input is given.
*   **Boost:** Temporarily overrides normal acceleration/max speed using `BOOST_ACCELERATION` and `BOOST_MAX_VELOCITY`. Includes a cooldown period.
*   **Collision:** Currently limited to simple distance checks between the player and resource items (`config.COLLECTION_DISTANCE`, `config.TREE_COLLECTION_DISTANCE`) within `resources.js`. No complex physics-based collision detection is implemented.

### Planets & Orbits (`planets.js`)

*   **Creation:** Planets are created as `THREE.Mesh` objects with `SphereGeometry`. Materials and properties (radius, color, orbital parameters) are sourced from `config.planetConfigs`.
*   **State Management:** The `planetsState` object (returned by `initPlanets` and used in `main.js`) holds references to each planet's mesh and tracks game state like `seedsDelivered`, `seedsRequired`, and `isTerraformed`.
*   **Orbits:** `updateOrbits` calculates the position of non-home planets using basic trigonometry based on their `orbitalDistance`, `orbitalSpeed`, `initialAngle`, and the elapsed time (`deltaTime`). This results in circular orbits around the origin (0,0,0).
*   **Terraforming Logic:** The state transition for terraforming (color change, UI updates) is primarily handled in `main.js` by checking the relevant planet's state in `planetsState` when the terraform button is clicked or conditions are met.

### Player Orientation (`player.js` - `updatePlayer` function)

The player ship's orientation is crucial for intuitive surface navigation and is achieved through a two-step process using Quaternions:

1.  **Align Up Vector with Surface Normal:**
    *   The vector pointing from the planet's center to the player's current position represents the surface normal at that point.
    *   A target quaternion (`alignmentQuaternion`) is calculated to rotate the player model's default "up" vector (usually +Y) to align with this surface normal. This keeps the ship level with the ground beneath it.
2.  **Align Forward Vector with Velocity (or Input):**
    *   A target direction for the ship's "forward" axis is determined based on the current `playerState.velocity`. If the velocity is near zero, it might use the last known direction or a default forward relative to the current orientation.
    *   A second target quaternion (`rotationQuaternion`) is calculated to rotate the player model around its (newly aligned) local "up" axis so that its "forward" vector points in the desired direction of movement.
3.  **Combine Rotations:** The `alignmentQuaternion` (for surface alignment) and the `rotationQuaternion` (for movement direction) are multiplied together.
4.  **Apply Rotation:** The resulting combined quaternion is applied to the `playerState.mesh.quaternion`, often using spherical linear interpolation (`slerp`) for smooth visual rotation (`mesh.quaternion.slerp(combinedQuaternion, smoothingFactor)`).

This ensures the ship stays flat on the terrain while turning smoothly to face the direction it's moving. Handling edge cases like near-zero velocity or movement near the planet's poles requires careful vector math.

## Development Log (What We've Done - Key Highlights)

*   **Initial Setup:** Scene, camera, renderer, basic lighting.
*   **Planet System:** Created home planet and orbiting target planets. Implemented basic orbital mechanics.
*   **Player Implementation:**
    *   Loaded player GLTF model.
    *   Implemented keyboard controls for movement (acceleration, velocity, friction).
    *   Implemented player orientation based on surface normal and velocity.
    *   Added path trail effect behind the player.
    *   Implemented boost mechanic with cooldown and UI meter.
*   **Resource System:**
    *   Implemented Seed and Fuel resource types.
    *   Loaded GLTF models for visual representation (trees for seeds, crystals for fuel).
    *   Implemented random placement and respawning logic for resources.
    *   Implemented collection logic based on player proximity.
    *   Added decorative models (mossy logs).
*   **Pal Companion:**
    *   Implemented Pal companion that follows the player.
    *   Added Pal representation on the mini-map.
*   **Audio Integration:**
    *   Loaded various sound effects (pickup, impact, rolling, ambient, boost, launch, terraform ready/success, inventory full, theme music).
    *   Implemented unified audio loading and playback triggers.
    *   Added positional audio for boost sounds.
    *   Integrated theme music and ambient background sound.
*   **Rocket Mechanics:**
    *   Created and positioned a launchpad.
    *   Implemented rocket model loading and placement logic.
    *   Developed launch sequence triggered by player proximity and 'L' key input (changed from Spacebar).
    *   Implemented resource cost check (Seeds & Fuel) with pending launch state.
    *   Created rocket travel logic (basic lerp towards target).
    *   Implemented camera focus switching during rocket travel and landing.
    *   Refined rocket stationing and visibility logic.
*   **Terraforming:**
    *   Tracked delivered seeds per planet.
    *   Implemented terraforming trigger via UI button when seed requirements are met.
    *   Visualized terraforming via smooth color lerp on the target planet.
    *   Added camera transition to focus on the planet during terraforming, triggering success sound on arrival.
*   **UI Elements:**
    *   Created inventory display (Seeds, Fuel).
    *   Created target planet seed bank display.
    *   Created terraform button with visual pulse effect when ready.
    *   Created dynamic boost meter UI showing duration or cooldown.
    *   Added debug buttons (Fill Resources, Trigger Terraform, Enable Terraform Button).
    *   Implemented improved mission status display messages (centered, styled).
    *   Implemented Mini-Map display showing player, Pal, rocket, and path trail.
*   **Visual Enhancements:**
    *   Added post-processing effects (Unreal Bloom Pass).
*   **Code Health & Workflow:**
    *   Refactored code into modular JavaScript files.
    *   Utilized ES Modules for imports/exports.
    *   Debugging player movement and model loading issues.
    *   Performed UI cleanup, removing redundant hardcoded elements.
    *   Managed code using Git branches (`playerModel`, `ui-economy-tuning`) and merged changes into `main`.
    *   Created initial project documentation (`StarSeed_Odyssey.md`) and expanded with architectural details.

## Next Steps (Current Focus - `ui-economy-tuning` branch)

*   **UI Fixes & Improvements:** Address any remaining layout, styling, or display issues in the user interface. Ensure all necessary information is presented clearly.
*   **Economy/Mechanics Tuning:** Review and adjust game balance parameters in `src/config.js` and related logic:
    *   Resource costs (`FUEL_COST_PER_SEED`).
    *   Resource pickup amounts (`FUEL_PER_PICKUP`).
    *   Resource regeneration rates (`SEED_REGEN_TIME`, `FUEL_REGEN_TIME`).
    *   Player movement values (`ACCELERATION`, `MAX_SPEED`, `BOOST_ACCELERATION`, `FRICTION`).
    *   Terraforming requirements (`SEEDS_REQUIRED_TERRAFORM`).
    *   Potentially other factors affecting game feel and difficulty.

## Branch Comparison: player-jump vs main (Internal Note)

This comparison reflects the state after significant development on the `player-jump` branch, focusing on the jump and boost mechanics.

**Main Differences & Evolution:**

1.  **Jump Mechanic:**
    *   **`main` Branch:** No jump mechanic exists. Spacebar triggers rocket launch. Player is clamped to the surface via basic gravity simulation.
    *   **`player-jump` Branch:** Full jump mechanic implemented (`isJumping`, `verticalVelocity`, `isGrounded` state; `JUMP_INITIAL_VELOCITY`, `JUMP_GRAVITY` constants; Spacebar triggers jump). Includes specific gravity logic for boost jumping (`BOOST_JUMP_GRAVITY`) and reduced initial velocity (`BOOST_JUMP_INITIAL_VELOCITY_MULTIPLIER`).

2.  **Boost Mechanic:**
    *   **`main` Branch:** Basic cooldown-based boost (`BOOST_COOLDOWN_DURATION`, `lastBoostTime`). Simple UI meter shows only cooldown.
    *   **`player-jump` Branch:** Boost limited by active time (`BOOST_MAX_DURATION`, `boostStartTime`). UI meter dynamically shows remaining duration *or* cooldown. Includes tuned interactions for boost jumping (gravity, initial velocity, previously acceleration/max speed limits).

3.  **Launch Key:**
    *   **`main` Branch:** Rocket launch triggered by Spacebar (`keyState[' ']`).
    *   **`player-jump` Branch:** Rocket launch triggered by 'l'/'L' keys (`keyState['l']`), freeing Spacebar for jumping.

**Overall Assessment:**

*   The `player-jump` branch adds the core jump feature and significantly refines the boost mechanic with duration limits, tuned jump interactions, and improved UI feedback.
*   The complexity on `player-jump` stems from iterative tuning of the jump/boost feel.
*   The `main` branch lacks these features and refinements.

**Potential Refinement Area:**

*   The underlying physics calculation for applying gravity and friction during movement/jumps differs. `main` used velocity projection and applied friction only to the tangent component. `player-jump` separates vertical jump physics from horizontal movement more explicitly. Exploring the velocity projection method *could* offer an alternative way to handle air friction/control during jumps, potentially simplifying the need for some multipliers, but would likely require re-tuning. The current separated approach is functional and arguably easier to tune directly.

## Future Feature Ideas (Beyond Current Scope)

*   **Compass & Navigation System:** Implement UI and logic for navigation aids.
*   **Multi-Planet Terraforming:** Expand terraforming goals beyond a single planet.
*   **Planetary Enemies/Hazards:** Design and implement threats on planet surfaces.
*   **Planet Health/Ecology System:** Develop mechanics for resource depletion consequences.
*   **Asteroid Threat Event:** Create logic and visuals for asteroid defense scenarios.
*   **Rocket Launch Failures:** Add RNG element to rocket launches.
*   **Advanced Physics:** More sophisticated collision detection, potential for atmospheric effects.
*   **Expanded Solar System:** More planets, moons, asteroid belts.
*   **Ship Upgrades:** Allow players to improve ship speed, capacity, or add tools.
*   **Story/Narrative Elements:** Introduce a background story or mission objectives.
*   **Player Jump Mechanic:** Allow the player ship to perform short jumps. 