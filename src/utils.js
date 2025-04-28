import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';

// Note: These functions might need access to the 'planets' state or 'homePlanet' 
// if they need to be generic for any planet in the future.
// For now, they assume access to a global or passed 'homePlanet'.

// Function to generate a random position on the planet surface (LOCAL COORDINATES)
// Needs reference to homePlanet and its config
export function getRandomPositionOnPlanet(homePlanet, planetsState) {
    if (!homePlanet || !planetsState[homePlanet.name]) return new THREE.Vector3(); // Safety return
    const homePlanetConfig = planetsState[homePlanet.name].config;
    
    const phi = Math.random() * 2 * Math.PI;
    const theta = Math.acos(2 * Math.random() - 1);
    
    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(theta);
    
    const position = new THREE.Vector3(x, y, z);
    position.multiplyScalar(homePlanetConfig.radius + config.GEM_SIZE/2);
    return position;
}

// Check if a position (local) is too close to existing gems (local)
// Needs access to the gem arrays
// Updated to handle the structure { gem: mesh, type: ... } from resources.js
export function isTooCloseToOtherGems(position, allGemsData, minDistance) {
    const minDistanceSq = minDistance * minDistance;
    for (const gemData of allGemsData) {
        // Safety check: Ensure gemData has a .gem property and it has a .position
        if (gemData && gemData.gem && gemData.gem.position) {
            // Compare squared distances for efficiency
            if (position.distanceToSquared(gemData.gem.position) < minDistanceSq) {
                return true;
            }
        } else {
            console.warn("isTooCloseToOtherGems: Skipping invalid gem data:", gemData);
        }
    }
    return false;
} 