# StarSeed Game Development Plan

This document outlines the planned features and implementation phases for the StarSeed game.

## Phase 1: Orbital Mechanics

This phase focuses on creating a dynamic solar system where planets move.

1.  **Solar System Setup:**
    *   **Reposition & Resize Star:** Move the star to the center of the scene (0, 0, 0). Make it significantly larger and adjust its light properties.
    *   **Planet Configuration:** Define a data structure (e.g., array of objects) for multiple planets, including `name`, `radius`, `color`, `orbitalDistance`, `orbitalSpeed`, `mass`, `initialAngle` and an `inventory` object.
    *   **Instantiate Planets:** Modify `init` to loop through the configuration, creating each planet sphere and adding it to the scene. Designate one as the initial "home planet".
    *   **Adjust Camera:** Increase the camera's `far` clipping plane.

2.  **Implement Orbits:**
    *   **`updateOrbits` Function:** Create this function, called within the `animate` loop.
    *   **Circular Motion:** Calculate each planet's new position based on its config using trigonometry (`Math.cos`, `Math.sin`) around the star at (0,0,0).
    *   **Data Storage:** Store each planet's current orbital angle.

3.  **Player & Gem Relative Positioning:**
    *   **Scene Graph Hierarchy:** Make `playerSphere` and gems children of the `homePlanet` mesh (`homePlanet.add(...)`).
    *   **Local Coordinates:** Player/gem positions become local to the home planet.
    *   **Coordinate Conversion:** Update functions (`updatePlayerMovement`, `updateGems`, `updateCamera`) to use `getWorldPosition()` for world coordinate calculations.

4.  **Testing & Verification:**
    *   Thoroughly test movement, camera, and collection on the orbiting home planet.

## Phase 2: Physics-Based Resource Launching

This phase focuses on simulating projectile motion under gravity.

1.  **Physics Core:**
    *   **Manual N-Body Gravity:** Implement physics in an `updateProjectiles` function.
    *   **Gravitational Constant:** Define a gameplay-scaled `G`.
    *   **Masses:** Use the `mass` property defined for planets/star. Assign mass to projectiles.
    *   **Time Step:** Use `deltaTime` in the `animate` loop for physics updates.

2.  **Projectile State:**
    *   Object with `mesh`, `mass`, `position` (Vector3), `velocity` (Vector3), `payload` ({fuel, seeds, food}), `targetPlanet`. Store active projectiles in an array.

3.  **Targeting System:**
    *   Implement target planet selection (e.g., 'T' key).
    *   Provide visual indication of the target.

4.  **Launch Sequence & UI:**
    *   **Activate Launch Mode:** Key press ('L') enters aiming mode.
    *   **Payload Selection UI:** Allow selecting resources from player inventory.
    *   **Fuel Determines Max Impulse:** Loaded Fuel sets max launch force.
    *   **Timing/Power Meter:** UI meter stopped by player determines actual launch impulse (percentage of max).
    *   **Launch Angle Adjustment:** Allow adjusting angle (up/down keys) with visual display.

5.  **`launchProjectile` Function:**
    *   Triggered after timing meter.
    *   Takes `payload`, `targetPlanet`, `angle`, `impulseMagnitude`.
    *   Calculates initial `velocity` (based on angle, impulse, player position, surface normal). **Important:** Add planet's orbital velocity to projectile's initial velocity.
    *   Instantiates projectile mesh.
    *   Sets initial state and adds to scene/array.
    *   Deducts payload from player inventory.

6.  **`updateProjectiles` Function (Physics Simulation):**
    *   Called every frame.
    *   Loops through `activeProjectiles`.
    *   **Calculate Net Gravity:** Sum gravitational forces from star and all planets (F = G * m1 * m2 / r^2 * direction).
    *   **Update Velocity:** `a = netForce / projectile.mass`; `projectile.velocity.add(a * deltaTime)`.
    *   **Update Position:** `projectile.position.add(velocity * deltaTime)`; update `mesh.position`.

7.  **Collision Detection:**
    *   In `updateProjectiles`, check projectile collisions with all planets and the star (bounding sphere checks).

8.  **Impact Handling:**
    *   **Hit Target:** Remove projectile, add payload to target planet's `inventory`, success feedback.
    *   **Hit Wrong Body/Fly Off:** Remove projectile, resources lost, failure feedback.
    *   **Miss (Timeout/Distance):** Remove projectiles that travel too far/long.

9.  **Trajectory Prediction & Assistance (Future Enhancements):**
    *   Consider adding a predicted trajectory line.
    *   Consider a computer assist feature for optimal launch windows.

## Phase 3: Enemy & Node Mechanics

This phase introduces an antagonist and an objective involving deactivation nodes.

1.  **Enemy Setup & AI:**
    *   **GLTF Loading:** Load the spider bot model (`models/spider_bot/scene.gltf`) and animations.
    *   **Initialization:** Place the enemy on the home planet, aligned to the surface, near the player's start position.
    *   **Spotlight:** Add a `SpotLight` as a child of the enemy model for detection, including emissive origin markers.
    *   **AI States:** Implement a state machine (`PATROLLING`, `HUNTING`, `SCANNING`, `SLEEPING`).
    *   **Patrol Logic:** Use Fibonacci lattice points for systematic patrolling on the planet surface.
    *   **Detection & Hunting:** Use `isPlayerInSpotlight` check (distance, angle, sensitivity) to trigger `HUNTING` state. Target player with prediction error, give up after a timer.
    *   **Scanning:** Implement random scanning behavior at patrol points.
    *   **Sleeping:** Implement timed sleep periods (`PATROL_DURATION`, `SLEEP_DURATION`) where the enemy is inactive and nodes are despawned.
    *   **Sound & Music:** Integrate positional movement/scanning sounds, detection sounds (roar/siren with cooldown), and music transitions (`playAppropriateMusic`) based on AI state (awake/danger vs asleep/normal).

2.  **Deactivation Node System:**
    *   **Model Loading:** Load the tech aperture model (`models/tech_aperture/scene.gltf`) and animations.
    *   **Spawning (`spawnDeactivationNodes`):**
        *   Spawn `NODES_REQUIRED` nodes on the home planet when the enemy wakes up.
        *   Use `getRandomPositionOnPlanet` for initial placement.
        *   Implement retry logic with distance (`MIN_NODE_DISTANCE`) and alignment (`MIN_NODE_ALIGNMENT_DOT_PRODUCT`) checks to ensure nodes are spread out and not directly opposite.
        *   Attach looping spawn sound and animation (`LoopPingPong`).
    *   **Visual Indicators:**
        *   **Ripple Effect:** Add a `CircleGeometry` mesh with a custom `ShaderMaterial` (ripple shaders) below each node, offset slightly from the surface. Update `uTime` uniform for animation.
        *   **Connection Lines (`updateNodeToEnemyLines`):** Draw dashed blue lines (`LineDashedMaterial`, `computeLineDistances` workaround) from each active node to the enemy's current position, updated each frame.
    *   **Activation:**
        *   Player must be within `NODE_INTERACTION_DISTANCE` for `NODE_ACTIVATION_DURATION`.
        *   Track progress (`activationProgress`, `activationTimers`).
        *   On activation: change node material emissive to green, stop spawn sound, play single activation sound, remove ripple effect.
    *   **Despawning (`despawnDeactivationNodes`):**
        *   Remove all nodes, ripples, and connection lines when the enemy goes to sleep or all nodes are activated.
        *   Dispose of geometries and materials properly.

3.  **Debugging & Refinement:**
    *   Added temporary debug features like BoxHelpers and planet transparency.
    *   Refactored line drawing logic (node-to-node -> node-to-enemy).
    *   Adjusted visual parameters (ripple height, line offset, colors).