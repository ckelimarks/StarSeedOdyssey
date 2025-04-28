# Rocket Physics Review and Revised Plan

## Physics Review of Current Rocket Code

### Strengths:

*   **Gravity:** Applies a simplified inverse-square law for the star's gravitational force (F = G * M / r^2), which is physically accurate for a central body.
*   **Thrust:** Uses the rocket's forward direction to apply a thrust force, scaled by deltaTime, mimicking real rocket propulsion.
*   **Position Update:** Updates position using velocity (position += velocity * deltaTime), which is standard for physics simulations.
*   **Orientation:** Calculates the rocket's initial orientation using the planet's surface normal, which is a good starting point for launch.

### Issues:

*   **Missing Orbital Velocity:** The rocket starts with `rocketVelocity.set(0, 0, 0)`, ignoring the home planet's orbital velocity around the star. In reality, a rocket inherits the planet's velocity, which significantly affects its trajectory in a heliocentric system.
*   **Thrust Model:** Thrust is applied continuously as long as `inventory.fuel > 0`, but the magnitude (THRUST_FORCE) is constant and doesn't scale with the number of resources (e.g., Seeds in the MVP). Real rockets typically apply a strong initial impulse or a short burn.
*   **Gravity Scope:** Only accounts for the star's gravity, ignoring planets' gravitational influence. While this simplifies calculations, it reduces realism for a multi-body system like your solar system.
*   **Orientation Dynamics:** The commented-out velocity-based rotation (`lookAt` velocity) can cause unrealistic spinning or jittering, especially at low velocities. Real rockets maintain stable orientation or align with their velocity vector smoothly.
*   **Damping Absence:** No velocity damping, which can lead to unrealistic perpetual orbits or runaway trajectories in a gameplay context.
*   **Numerical Stability:** Gravity calculation checks `distanceSq > 1e-6` to avoid division by zero, but there's no cap on `deltaTime`, which can cause instability during frame drops.

### Goals for Realistic Rocket Launch Physics

*   **Orbital Velocity:** Include the home planet's orbital velocity in the rocket's initial velocity to reflect its motion in the solar system.
*   **Thrust Scaling:** Apply a strong initial impulse based on the number of Seeds, mimicking a rocket's main engine burn, rather than continuous thrust.
*   **Multi-Body Gravity:** Account for gravitational forces from the star and both planets for more realistic trajectories.
*   **Stable Orientation:** Smoothly align the rocket with its velocity vector during flight to avoid jittering, simulating aerodynamic or thruster-guided stability.
*   **Damping:** Add slight velocity damping to prevent unrealistic perpetual motion, ensuring trajectories settle or escape naturally.
*   **Numerical Stability:** Cap `deltaTime` and handle edge cases to ensure robust physics updates.
*   **Gameplay Fit:** Tune physics constants (e.g., `GRAVITATIONAL_CONSTANT`, `SEED_IMPULSE`) to feel realistic but fun, aligning with the MVP's ~50% success rate for launches.

## Revised Physics Plan

This plan focuses on modifying the physics components of the rocket launch to achieve a realistic trajectory, assuming a Three.js environment and compatibility with your `config.js` constants.

### 1. Physics Constants

Update `config.js` with tuned values for realism and gameplay:

*   `GRAVITATIONAL_CONSTANT`: 0.1 (game-scaled for visible orbital effects).
*   `STAR_MASS`: 1000 (dominant gravitational source).
*   `PLANET_MASS`: 20 (both planets, for subtle influence).
*   `ROCKET_MASS`: 0.1 (small to amplify forces).
*   `SEED_IMPULSE`: 10 (impulse per Seed, tuned for ~50% success).
*   `ROCKET_RADIUS`: 0.1, `ROCKET_HEIGHT`: 0.5 (for collision).
*   `PLAYER_RADIUS`: 0.5 (for launch offset).
*   `DAMPING_FACTOR`: 0.999 (slight drag to limit runaway trajectories).
*   `MAX_DELTA_TIME`: 0.016 (cap at 60 FPS for stability).

### 2. Initial Conditions

*   **Launch Position:** Set above the player, offset by `ROCKET_HEIGHT/2 + PLAYER_RADIUS + 0.1` along the planet's surface normal.
*   **Initial Velocity:** Combine:
    *   Home planet's orbital velocity (calculated from its orbital motion).
    *   Launch impulse based on Seeds and charge percentage, directed along a pitched surface normal.
*   **Orientation:** Align rocket with launch direction initially, then smoothly transition to velocity vector during flight.

### 3. Thrust Model

*   **Impulse-Based:** Apply a single strong impulse at launch, scaled by Seeds (`impulse = seeds * SEED_IMPULSE * chargePercentage`).
*   **Direction:** Along the surface normal, adjusted by a pitch angle (-30° to +30°) for player control.
*   **No Continuous Thrust:** Simplify for MVP, avoiding fuel burn over time. (Future enhancement: Add short burn phase if desired.)

### 4. Gravity Model

*   **Multi-Body:** Calculate gravitational forces from the star and both planets using `F = G * m1 * m2 / r^2 * direction`.
*   **Optimization:** Cache planet positions per frame to reduce calculations.
*   **Stability:** Skip gravity if `distanceSq < 1e-6` and cap `deltaTime` at `MAX_DELTA_TIME`.

### 5. Motion Update

*   **Velocity:** `velocity += (netForce / ROCKET_MASS) * deltaTime`.
*   **Position:** `position += velocity * deltaTime`.
*   **Damping:** `velocity *= DAMPING_FACTOR` per frame to prevent perpetual orbits.
*   **Orientation:** Smoothly interpolate quaternion to align rocket with velocity vector (using `setFromUnitVectors` or `slerp`).

### 6. Timeout

*   Remove rocket if it travels too far (`distance > 50` from star) or after 20 seconds to prevent infinite trajectories.

### Physics Changes Explained

*   **Orbital Velocity:**
    *   Added `homePlanetVelocity` to `launchRocket`, copied from the home planet's orbital velocity (calculated in `updateOrbits` from the MVP plan).
    *   Applied to `rocketVelocity` at launch, ensuring the rocket moves with the planet's motion around the star, creating realistic elliptical or hyperbolic trajectories.
*   **Thrust Model:**
    *   Replaced continuous thrust with a single impulse: `impulse = seeds * SEED_IMPULSE * chargePercentage`.
    *   Scales with Seeds (1-5) for the MVP's trade-off (more Seeds = stronger launch).
    *   Directed along a pitched surface normal (`_forwardVector`) for player control.
*   **Multi-Body Gravity:**
    *   Added gravity from planets (`PLANET_MASS`) alongside the star, using the same inverse-square law.
    *   Cached `planets` array externally to access positions and masses dynamically.
*   **Orientation:**
    *   Initial orientation aligns with launch direction using `setFromUnitVectors`.
    *   In-flight orientation smoothly interpolates to the velocity vector via `slerp` (10% per frame), preventing jittering and mimicking thruster-guided stability.
*   **Damping:**
    *   Added `DAMPING_FACTOR`: 0.999 to slightly reduce velocity each frame, ensuring trajectories don't persist indefinitely (realistic for gameplay).
*   **Numerical Stability:**
    *   Capped `deltaTime` at `MAX_DELTA_TIME`: 0.016 to prevent instability.
    *   Kept `distanceSq > 1e-6` check to avoid division by zero in gravity calculations.
*   **Timeout:**
    *   Removes rocket if `distance > 50` from the star, aligning with the MVP's cleanup rule.

### Integration Notes

*   **Planets Array:** The game must call `setPlanets([{ position: Vector3, radius: number, mass: number }, ...])` to provide planet data (from `updateOrbits` in the MVP plan).
*   **Home Planet Velocity:** Pass the home planet's velocity to `launchRocket`, calculated as `v = orbitalSpeed * orbitalDistance * [-sin(angle), 0, cos(angle)]` from the MVP's orbital mechanics.
*   **Pitch Control:** The game should call `setLaunchPitch(angleDegrees)` based on player input (e.g., Up/Down keys) during launch mode.
*   **Config Tuning:** Adjust `SEED_IMPULSE`, `GRAVITATIONAL_CONSTANT`, or `PLANET_MASS` during testing to ensure ~80% success for Planet A (2-3 Seeds) and ~50% for Planet B (3-4 Seeds).
*   **Why This Feels Realistic:**
    *   **Orbital Dynamics:** Inheriting the planet's velocity creates curved, orbit-like trajectories influenced by the star's gravity.
    *   **Thrust Impulse:** A single, scalable impulse mimics a rocket's main engine burn, with player-controlled pitch adding agency.
    *   **Multi-Body Gravity:** Planets' subtle gravitational pulls create natural trajectory deviations, enhancing realism.
    *   **Smooth Orientation:** Gradual alignment with velocity looks stable and professional, like a guided rocket.
    *   **Damping:** Prevents unrealistic perpetual motion, ensuring rockets either hit a target or escape.

</rewritten_file> 