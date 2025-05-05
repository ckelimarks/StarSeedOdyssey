# StarSeed: Odyssey - Project Documentation

## Game Concept

StarSeed: Odyssey is a 3D space exploration and terraforming game prototype. The core concept revolves around piloting a small spacecraft around a home planet within a solar system.

**Core Mechanics (Including Planned Features):**

*   **Player Control:** Navigate the spacecraft across the surface of the home planet using keyboard controls (arrow keys for movement, Shift for boost).
*   **Resource Gathering:** Collect "Seeds" (currently represented by tree models) and "Fuel" (represented by semi-transparent crystal models) scattered on the home planet's surface. Seeds are required for terraforming, and Fuel is needed to launch rockets.
*   **Inventory Management:** Track collected Seeds and Fuel via a UI display.
*   **Enemy & Deactivation:** Avoid or manage a patrolling enemy robot on the home planet. The enemy enters a sleep cycle. When awake, it spawns three deactivation nodes. The player must stand near each node for a duration to activate it (turning it green). Activating all three forces the enemy back to sleep and plays a positional sound effect.
*   **Rocket Launch:** Fly to a designated launchpad area near the planet's pole. If sufficient Seeds and Fuel are available, the player can initiate a rocket launch sequence (currently triggered by 'L') to send Seeds to a target planet. *Planned: RNG chance of launch failure.*
*   **Terraforming Multiple Planets:** Deliver enough Seeds via rockets to designated target planets (e.g., 'Infernia', 'Verdant Minor') to meet their requirements. Once met, the player can trigger the terraforming process (via a UI button), which visually changes the target planet.
*   *Planned: Compass & Navigation:* Implement UI elements and systems to help the player navigate towards target planets, the launchpad, or other points of interest.
*   *Planned: Planet Health & Resource Management:* Implement a system where the home planet has a "health" or ecological score. Extracting resources too rapidly could damage the planet, reducing resource availability or introducing negative consequences.
*   *Planned: Asteroid Threat:* Introduce time-sensitive events where an asteroid threatens the home planet, requiring player intervention (e.g., launching a defensive rocket).

**Goal:**

The primary objective is to explore the solar system, gather resources sustainably from the home planet, manage threats (including the enemy robot), and successfully terraform multiple target planets by launching seed-carrying rockets.

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
│   ├── enemy.js        # Enemy AI, state machine, deactivation node logic
│   ├── pal.js          # Pal companion logic
│   ├── utils.js        # Utility functions
│   └── main.js         # Main application entry point, game loop, initialization
├── ship/               # Player ship GLTF model files
├── index.html          # Main HTML file, canvas container, static UI elements
├── .DS_Store           # macOS system file
├── .gitignore          # Specifies intentionally untracked files for Git
├── ship.zip            # Zipped player ship model (likely unused now)
├── sfx/                # Sound effect files
├── models/             # GLTF models for resources, player, rocket, enemy, etc.
├── phaseIIplan.md      # Planning document (likely outdated)
├── rocket_plan.md      # Planning document (likely outdated)
├── game.js             # Potentially unused/outdated JS file
└── plan.md             # Planning document (likely outdated)
```

## Code Architecture Overview

The project follows a modular JavaScript structure using ES Modules. Key modules and their responsibilities:

*   **`main.js`**: The main entry point. Initializes all other modules, manages the main game loop (`animate`), orchestrates high-level game state transitions (like launch sequences, terraforming triggers), and handles creation/updates for some core UI elements not managed by `resources.js`.
*   **`config.js`**: Centralized configuration file containing constants for physics, resource tuning, planet properties, UI settings, enemy behavior, etc. Allows for easy tweaking of game balance and parameters.
*   **`scene.js`**: Sets up the fundamental Three.js components: `Scene`, `PerspectiveCamera`, `WebGLRenderer`, lighting (ambient and directional), and the `AudioListener`.
*   **`player.js`**: Manages the player spacecraft, including:
    *   Loading the player model.
    *   Handling keyboard input (`keyState`).
    *   Calculating movement physics (velocity, acceleration, friction, fuel consumption, out-of-fuel state) relative to the home planet's surface.
    *   Managing player orientation (aligning with surface normal and velocity).
    *   Handling the boost mechanic and its state.
    *   Generating the path trail effect.
    *   Managing the toggleable speech bubble.
*   **`planets.js`**: Responsible for creating the planets (home and orbiting) based on configurations. It calculates and updates the orbital positions of non-home planets each frame. It also manages the state related to terraforming for each planet (seeds delivered, requirements, terraforming status).
*   **`resources.js`**: Handles the lifecycle of collectible resources (Seeds and Fuel). This includes:
    *   Loading resource models (trees, crystals, decorative logs, tech apertures).
    *   Procedurally placing resources on the home planet surface, ensuring minimum spacing.
    *   Managing resource collection logic (proximity checks).
    *   Handling resource respawning after a set time.
    *   Managing the player's inventory (`inventory` object).
    *   Creating and updating the core inventory UI display.
    *   Loading and providing functions to play various sound effects.
*   **`rocket.js`**: Manages the launch sequence, rocket model (replacing placeholder), particle effects, and associated camera control. Includes logic for checking launch conditions, animating the rocket's travel, and handling camera transitions during launch and landing.
*   **`enemy.js`**: Manages the enemy robot:
    *   Loading the enemy model.
    *   Implementing the AI state machine (Patrolling, Hunting, Scanning, Sleeping).
    *   Handling movement, orientation, and animation based on state.
    *   Managing the spotlight for player detection.
    *   Spawning, managing, and despawning the deactivation nodes.
    *   Handling node activation logic and visual feedback.
    *   Managing enemy-specific sounds.
*   **`pal.js`**: Manages the Pal companion, including loading its model, follow behavior, and sounds.
*   **`utils.js`**: Contains helper functions used across different modules, such as calculating random positions on a sphere or checking distances.

**Interaction Flow (Simplified):**

1.  `main.js` initializes all modules.
2.  The `animate` loop in `main.js` runs every frame.
3.  `animate` calls update functions in other modules:
    *   `updateOrbits` (`planets.js`) moves orbiting planets.
    *   `updatePlayer` (`player.js`) processes input, calculates physics, and moves/orients the player mesh.
    *   `updateEnemy` (`enemy.js`) updates the enemy state machine, movement, and node logic.
    *   `updatePal` (`pal.js`) updates the Pal's position.
    *   `updateResources` (`resources.js`) checks for collections, handles respawns, and updates the inventory UI.
    *   `updateRocket` (`rocket.js`) manages rocket state if active.
    *   Updates post-processing effects and renders the scene.
    *   Updates and renders the mini-map.
4.  Modules read configuration from `config.js`.
5.  Player actions (collecting resources, activating nodes, launching rockets) trigger logic within relevant modules, often updating shared state.

## Implementation Details

### Physics (Primarily in `player.js`)

*   **Movement Model:** Simple acceleration/velocity/friction model relative to the planet surface.
*   **Fuel Consumption:** Player movement and boosting consume fuel. Running out reduces speed and triggers sound/visual cues.
*   **Surface-Relative Motion & Gravity:** Movement is relative to player orientation. Gravity is implicitly handled by snapping to the surface.
*   **Friction:** Damps velocity.
*   **Boost:** Duration-limited boost with cooldown.
*   **Collision:** Simple distance checks for resource/node interaction.

### Planets & Orbits (`planets.js`)

*   **Creation:** Planets created from config, home planet uses PBR textures, one target planet uses a custom GLTF model.
*   **State Management:** `planetsState` tracks terraforming progress.
*   **Orbits:** Simple circular orbits updated each frame.
*   **Terraforming Logic:** State changes managed in `main.js`, triggered by UI after conditions met.

### Player Orientation (`player.js` - `updatePlayer` function)

*   Uses quaternions to align player Up with surface normal and Forward with velocity/input direction.
*   `slerp` provides smooth visual rotation.

### Enemy AI (`enemy.js`)

*   **State Machine:** Cycles through `SLEEPING`, `PATROLLING` (Fibonacci lattice points), `SCANNING` (rotation, player detection), and `HUNTING` (moves towards player, gives up after timeout).
*   **Player Detection:** Uses spotlight angle, distance, and dynamic sensitivity.
*   **Deactivation Nodes:** Spawns 3 `tech_aperture` nodes when waking. Nodes have ping-pong animation. Player proximity over time activates nodes individually (visualized by green emissive material). Activating all 3 forces enemy to sleep and plays a positional sound.
*   **Sounds:** Includes positional movement, scanning loops, detection sounds (roar/siren with cooldown), and the node deactivation sound.
*   **Music Integration:** Triggers transitions between normal and danger themes based on sleep/wake state.

## Development Log (What We've Done - Key Highlights)

*   **Initial Setup:** Scene, camera, renderer, basic lighting.
*   **Planet System:** Home planet, orbiting targets (one with custom model), orbital mechanics.
*   **Player Implementation:** Model, surface controls, orientation, path trail, boost mechanic (duration-based), fuel consumption.
*   **Resource System:** Seed/Fuel types, GLTF models (tree, crystal, log, aperture), placement/respawn, collection, inventory UI.
*   **Pal Companion:** Model, follow logic, mini-map icon, sounds.
*   **Enemy Robot:**
    *   Model loading and initial placement.
    *   AI State Machine (Sleeping, Patrolling, Scanning, Hunting).
    *   Spotlight-based vision detection.
    *   Deactivation Node system: spawning, activation mechanic, visual feedback (individual green state), win condition (force sleep), positional deactivation sound.
    *   Enemy-specific sounds (movement, scan, detection).
    *   Integration with dynamic music system.
*   **Audio Integration:** Unified loading, various SFX (pickup, impact, rolling, ambient, boost, launch, terraform, inventory, player sounds, enemy sounds, node sounds), dynamic music switching (normal/danger themes) with crossfading.
*   **Rocket Mechanics:** Launchpad, custom rocket model, particle effects, launch sequence (L key trigger), resource cost, travel, landing, camera control.
*   **Terraforming:** Seed delivery tracking, UI trigger, visual feedback (color lerp), camera focus.
*   **UI Elements:** Inventory bars, seed bank, terraform button (pulse), boost meter (dynamic), mini-map (player, pal, rocket, enemy, path), enemy status display, system view hover effects (CSS outline, tooltip).
*   **Visual Enhancements:** Post-processing (Bloom), mini-map shading/wireframe, fuel crystal transparency, speech bubble.
*   **Code Health & Workflow:** Modular structure, Git branching/merging, documentation updates, extensive debugging (positioning, audio, state logic, transparency).

## Next Steps (Current Focus - `feat-gameplay-overhaul` branch)

*   **Sound Refinement:** Continue adding and tuning sound effects.
*   **UI Fixes & Improvements:** Address any remaining layout, styling, or display issues.
*   **Economy/Mechanics Tuning:** Review and adjust game balance parameters (`config.js`).
*   **Gameplay Loop Polish:** Ensure smooth transitions and clear objectives.

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
*   **Planet Health/Ecology System:** Develop mechanics for resource depletion consequences.
*   **Asteroid Threat Event:** Create logic and visuals for asteroid defense scenarios.
*   **Rocket Launch Failures:** Add RNG element to rocket launches.
*   **Advanced Physics:** More sophisticated collision detection, potential for atmospheric effects.
*   **Expanded Solar System:** More planets, moons, asteroid belts.
*   **Ship Upgrades:** Allow players to improve ship speed, capacity, or add tools.
*   **Story/Narrative Elements:** Introduce a background story or mission objectives.
*   **Player Jump Mechanic:** Allow the player ship to perform short jumps. 

## Project Summary

StarSeed: Odyssey is a 3D space exploration prototype where players pilot a ship on a home planet (AquaPrime) to gather Seeds (Trees) and Fuel (Crystals). The objective is to launch rockets carrying these resources to terraform target planets ('Infernia', 'Verdant Minor') by meeting their seed requirements. Key implemented features include player surface navigation (movement, boost, fuel consumption, orientation), resource collection and respawning, inventory management, a Pal companion, an enemy robot patroling the home planet with a sleep/wake cycle and a deactivation mechanic involving three interactable nodes, rocket launch mechanics (triggered near the pole, resource cost checks, travel animation), UI elements (inventory, seed bank, terraform button, boost meter, mini-map, enemy status), basic orbital mechanics for other planets, audio integration (pickups, ambient, music, positional boost, enemy sounds, node sounds), and visual enhancements (post-processing, custom planet/rocket models, transparency effects). Code is structured modularly using ES Modules (`main.js`, `config.js`, `scene.js`, `player.js`, `planets.js`, `resources.js`, `rocket.js`, `enemy.js`, `pal.js`, `utils.js`).

## Potential Areas for Improvement (Based on Document)

*   **Documentation Cleanup:** Remove or update outdated planning files (`phaseIIplan.md`, `rocket_plan.md`, `plan.md`) and unused assets (`ship.zip`, `game.js`).
*   **Camera Logic Consolidation:** The document notes camera logic is currently spread between `main.js` and `rocket.js`. Consolidating this into a dedicated `camera.js` module could improve clarity.
*   **Collision Detection:** Current collision is limited to simple distance checks for resource/node interaction. Implementing more robust physics-based collision detection is listed as a future feature idea and would be needed for advanced interactions.
*   **Hardcoded Values:** The terraforming logic currently targets 'Infernia' directly in `main.js` and potentially `rocket.js`. Making the target dynamic or configurable would support multi-planet terraforming goals.
*   **Physics Refinement:** The branch comparison notes differences in how gravity and friction are handled between branches (`main` vs `player-jump`), suggesting potential for physics model refinement or unification.
*   **Feature Implementation:** Many planned features (Compass, Planet Health, Asteroids, Launch Failures, Ship Upgrades, Story) represent significant areas for future development.
*   **Game Balancing:** The "Next Steps" section explicitly focuses on tuning the game's economy and mechanics via `config.js`, indicating this is a key area needing attention for gameplay feel.
*   **Player Jump Integration:** The "Future Feature Ideas" includes a player jump, and the branch comparison details a `player-jump` branch where this was implemented. Integrating this feature into the main branch is a potential next step. 