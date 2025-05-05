import { updatePlayer } from './player.js'; // <<< REMOVE getPlayerVelocity import
import { initEnemy, updateEnemy, getEnemyState } from './enemy.js'; // Adjust based on your enemy file exports

homePlanet.getWorldPosition(_mapHomePlanetWorldPos);

// <<< Make Home Planet Transparent for Debugging >>>
/* // <<< COMMENTED OUT
if (homePlanet.material) {
    homePlanet.material.transparent = true;
    homePlanet.material.opacity = 0.3; // Adjust opacity as needed (0.0 to 1.0)
    homePlanet.material.needsUpdate = true; // Important for material changes
    console.log("[Debug] Made home planet transparent.");
} else {
    console.warn("[Debug] Could not find material on homePlanet mesh to make transparent.");
}
*/ // <<< COMMENTED OUT
// <<< END Transparency Debug >>>

console.log("Main INIT: Planets initialized."); 

const audioNow = audioListener?.context?.currentTime ?? 0; // Web Audio time for audio scheduling

// <<< Spawn Debug Node Once >>>
/* // <<< COMMENTED OUT Debug Node Spawn Block
if (!debugNodeSpawned && window.playerState?.mesh && techApertureModelProto && homePlanet && _launchPadLocalPos.lengthSq() > 0) { // Added check for launch pad pos
    debugNodeSpawned = true;
    console.log("[Debug Node] Spawning debug node near ROCKET PAD (Scale 1, Offset 0, No Cull)..." ); // Updated log

    const debugNodeVerticalOffset = 0.0; // <<< REVERT to OFFSET 0.0 >>>
    const debugNodeScale = 1.0; // <<< Keep SCALE 1.0 >>>
    const planetRadius = homePlanet.geometry.parameters.radius;

    // 1. Get Launch Pad WORLD position
    const launchPadWorldPos = _launchPadWorldPos.copy(_launchPadLocalPos).applyMatrix4(homePlanet.matrixWorld);
    // _debugPlayerPos.copy(launchPadWorldPos); // Reuse debugPlayerPos temporarily if needed

    // 2. Use launch pad pos as the target surface pos
    const targetWorldSurfacePos = launchPadWorldPos;

    // 3. Calculate final world position with offset
    const finalOffsetNormal = targetWorldSurfacePos.clone().normalize(); // Normal from origin to pad pos
    const finalWorldPos = _vector3_2.copy(finalOffsetNormal).multiplyScalar(planetRadius + debugNodeVerticalOffset);

    // 4. Create and configure the node mesh
    const debugNodeMesh = techApertureModelProto.clone(true);
    debugNodeMesh.scale.set(debugNodeScale, debugNodeScale, debugNodeScale);

    // 5. Set Alignment
    _alignmentQuaternion.setFromUnitVectors(_modelUp, finalOffsetNormal); // Use normal at the final position
    debugNodeMesh.quaternion.copy(_alignmentQuaternion);

    // 6. Set position (WORLD)
    debugNodeMesh.position.copy(finalWorldPos); 

    // <<< Disable Culling and Force Matrix Update >>>
    debugNodeMesh.frustumCulled = false;

    // 7. Add to planet
    homePlanet.add(debugNodeMesh);
    debugNodeMesh.updateMatrixWorld(true); // Force update after adding

    // 8. Add BoxHelper
    const boxHelper = new THREE.BoxHelper(debugNodeMesh, 0x00ffff); // Cyan color
    homePlanet.add(boxHelper);
    debugNodeMesh.userData.boxHelper = boxHelper; // Store for potential removal later

    console.log("[Debug Node] Spawned near pad at world pos approx:", finalWorldPos);
}
*/ // <<< END COMMENTED OUT Debug Node Spawn Block
// <<< END Debug Node Spawn >>>

// --- Update Filter Transition --- 
if (isFilterTransitioning && globalLowPassFilter && audioNow > 0) {
// ... existing code ...
} 

function animate() {
    // ... existing code ...
    const playerMesh = getPlayerMesh(); // Get player mesh
    // <<< Get Velocity from playerState object >>>
    const playerVel = playerState?.velocity; 
    // ... existing code ...
        // Update enemy logic only if it exists AND player velocity is valid
        if (getEnemyState().mesh && playerMesh && playerVel) { // <<< ADD playerVel check
            updateEnemy(deltaTime, playerMesh, playerVel); // <<< PASS playerState.velocity
        } else if (getEnemyState().mesh && playerMesh) {
            // Log if enemy exists but velocity is missing (shouldn't happen after init)
            console.warn("[Animate Loop] Enemy exists but player velocity is invalid. Skipping enemy update.");
        }
    // ... existing code ...
} 