Overview
Core Mechanic: Collect Seeds on the home planet, launch them to hit orbiting planets to terraform them, balancing launch strength (more Seeds) vs. terraforming progress (more Seeds delivered).

Scope: 1 star, 2 planets, 1 resource (Seeds), ~15-30 minute playtime.

Key Features:
Economy: Collect scarce Seeds, use them for launches and terraforming.

Launching: Physics-based projectile motion with gravity, timed for orbital alignments.

Progression: Terraform 2 planets to win, with visual feedback and rewards.

Phase 1: Simplified Orbital Mechanics
Set up a basic solar system with orbiting planets, adapted from the original plan, to support the launching mechanic.
Solar System Setup:
Star: Place at (0, 0, 0), large sphere, emits light (e.g., PointLight).

Planets: Define 2 planets in a config array:
Planet A: radius: 1, orbitalDistance: 10, orbitalSpeed: 0.05, initialAngle: 0.

Planet B: radius: 1.5, orbitalDistance: 15, orbitalSpeed: 0.1, initialAngle: π/2.

Each has name, mesh, terraformProgress: 0, seedsNeeded (5 for A, 8 for B).

Home Planet: Designate Planet A as the initial home planet (player starts here).

Instantiate: Create planet spheres, add to scene.

Camera: Set far clipping plane to 1000, position to follow player.

Implement Orbits:
Function: updateOrbits(deltaTime) in the animate loop.

Circular Motion: Update each planet’s position using x = orbitalDistance * cos(angle), z = orbitalDistance * sin(angle), angle += orbitalSpeed * deltaTime.

Storage: Track each planet’s current angle in its config.

Player Positioning:
Scene Graph: Make playerSphere a child of the home planet (homePlanet.add(playerSphere)).

Local Coordinates: Player position is local to the home planet’s surface (e.g., y = radius + 0.5).

Movement: Simple WASD movement on the surface, use getWorldPosition() for world calculations.

Testing:
Verify planets orbit smoothly, player moves on home planet, camera follows correctly.

Phase 2: Barebones Economy and Physics-Based Launching
This phase implements a single-resource economy (Seeds) and a simplified launching mechanic, combining collection, physics-based projectiles, and terraforming progression.
1. Economy Setup
Resource: Seeds (used for launch strength and terraforming).

Player Inventory:
Max: 10 Seeds.

Start: 3 Seeds.

Collection:
Seeds spawn as glowing orbs on the home planet.

Spawn Rate: 1 Seed every 60 seconds, max 5 on map.

Mechanics: Player moves to collect (like gems in original plan), adds to player.inventory.seeds.

Planet Terraforming:
Planet A: Needs 5 Seeds (seedsNeeded: 5, terraformProgress: 0).

Planet B: Needs 8 Seeds (seedsNeeded: 8, terraformProgress: 0).

Rewards:
Planet A terraformed: Drops 3 Seeds on home planet, unlocks Planet B.

Planet B terraformed: Drops 5 Seeds, triggers game win.

2. Physics Core
Gravitational Constant: G = 0.1 (gameplay-scaled).

Masses:
Star: mass: 1000.

Planets: mass: 20 (both A and B).

Projectile: mass: 0.1.

Time Step: Use deltaTime in animate loop, cap at 0.016 (60 FPS) for stability.

Simplification: Only projectiles feel gravity from star and planets; planets follow fixed orbits.

3. Projectile State
Properties:
mesh: Small sphere with a glowing trail (e.g., THREE.Line).

mass: 0.1.

position: THREE.Vector3.

velocity: THREE.Vector3.

seeds: Number of Seeds in payload (1-5).

targetPlanet: Reference to target planet.

Storage: activeProjectiles array, max 3 projectiles to prevent lag.

4. Targeting System
Input: Press T to toggle between Planet A and B (start with A, unlock B after A is terraformed).

Feedback: Highlight target planet with a glowing outline (e.g., THREE.OutlinePass) and show its name + “Terraform: X%” on HUD.

5. Launch Sequence & UI
Activate Launch Mode:
Press L to enter aiming mode (freezes player movement).

Show UI: Slider to select 1-5 Seeds, target planet info, “Launch Window” indicator.

Launch Window:
Check angle between home planet and target planet.

Show green HUD light if target is within 30° of closest approach, red otherwise.

Charge Mechanic:
Hold Space to charge launch (0-100% over 2 seconds, determines impulse).

Release to launch, press Esc to cancel.

Impulse: impulse = seeds * 5 * chargePercentage (e.g., 3 Seeds at 80% = 12 impulse).

Angle:
Fixed launch angle (along surface normal) to simplify for MVP.

Future enhancement: Add up/down keys for angle adjustment.

6. launchProjectile Function
Inputs: seeds (1-5), targetPlanet, chargePercentage (0-1).

Logic:
Check: player.inventory.seeds >= seeds.

Calculate initial velocity:
Direction: Home planet’s surface normal (player.position.normalize()).

Magnitude: impulse = seeds * 5 * chargePercentage.

Add home planet’s orbital velocity (from updateOrbits).

Create projectile: mesh, mass: 0.1, position: player.position, velocity, seeds, targetPlanet.

Add to scene and activeProjectiles.

Deduct: player.inventory.seeds -= seeds.

7. updateProjectiles Function
Called: Every frame in animate loop.

Logic:
For each projectile:
Gravity: Sum forces from star and planets (F = G * m1 * m2 / r^2 * direction).

Velocity: acceleration = netForce / mass, velocity += acceleration * deltaTime.

Position: position += velocity * deltaTime, update mesh.position.

Trail: Update glowing trail effect.

Damping: velocity *= 0.999 to prevent infinite orbits.

8. Collision Detection
Method: Check projectile.position.distanceTo(planet.position) < planet.radius for star and planets.

Optimization: Skip home planet for 0.5 seconds post-launch.

Timeout: Remove projectiles after 20 seconds or if distance > 50.

9. Impact Handling
Hit Target Planet:
Add projectile.seeds to planet.terraformProgress.

Update HUD: “Terraform: X%” (e.g., progress / seedsNeeded * 100).

Remove projectile.

Play success effect (green particles, chime sound).

If terraformProgress >= seedsNeeded:
Trigger terraforming: Add green texture or plant models to planet.

Drop reward Seeds on home planet (3 for A, 5 for B).

For Planet A: Unlock Planet B. For Planet B: Win game.

Hit Wrong Planet/Star:
Remove projectile, lose Seeds.

Play failure effect (red particles, thud sound).

HUD: “Missed: Seeds Lost.”

Timeout: Same as wrong hit.

10. UI and Feedback
HUD:
Show: Seeds: X/10, target planet name, “Terraform: X%”, launch window indicator (green/red).

Launch mode: Slider for Seeds (1-5), charge meter (radial, fills while holding Space).

Visuals:
Seeds: Glowing orbs on home planet.

Projectiles: Small spheres with glowing trails.

Planets: Turn green with simple plant models when terraformed.

Audio:
Collect Seed: Soft ping.

Launch: Whoosh (louder with more Seeds).

Success: Cheerful chime.

Failure: Low thud.

Balancing
Playtime: ~15-30 minutes (5-10 launches, ~50% success rate).

Success Rates:
Planet A: ~80% with 2-3 Seeds, easy orbit.

Planet B: ~50% with 3-4 Seeds, faster orbit.

Resource Scarcity: 1 Seed/min ensures ~1-2 minute retry after miss.

Rewards: 3-5 Seeds per planet prevent players from getting stuck.

Difficulty Curve: Planet A teaches launching, Planet B adds challenge with distance and speed.

Implementation Notes
Tech Stack: Assume Three.js for 3D rendering, JavaScript for logic.

Key Functions:
updateOrbits(deltaTime): Move planets.

updatePlayerMovement(deltaTime): WASD on home planet.

collectSeeds(): Add Seeds to player.inventory.

launchProjectile(seeds, targetPlanet, chargePercentage): Create projectile.

updateProjectiles(deltaTime): Physics simulation.

Data Structure:
javascript

const player = { inventory: { seeds: 3 }, maxSeeds: 10, mesh: /* THREE.Mesh */ };
const planets = [
  { name: "A", radius: 1, orbitalDistance: 10, orbitalSpeed: 0.05, angle: 0, mass: 20, seedsNeeded: 5, terraformProgress: 0, mesh: /* THREE.Mesh */ },
  { name: "B", radius: 1.5, orbitalDistance: 15, orbitalSpeed: 0.1, angle: Math.PI / 2, mass: 20, seedsNeeded: 8, terraformProgress: 0, mesh: /* THREE.Mesh */ }
];
const activeProjectiles = [];

Testing:
Ensure orbits are smooth, launches feel responsive.

Check success rates (adjust G, impulse, or orbital speeds if too hard/easy).

Verify terraforming visuals and rewards trigger correctly.

Why It’s Fun and Barebones
Simple: One resource (Seeds), two planets, one goal (terraform).

Fun: Launching feels like a space slingshot, with orbits adding timing strategy.

Trade-Offs: More Seeds = easier hit, but fewer launches to terraform.

Dynamic Challenges: Time launches for orbiting planets.

Feedback Loop: Success grows planets, rewards Seeds; failures push smarter tries.

Quick: ~15-30 minutes, easy to prototype and test.

