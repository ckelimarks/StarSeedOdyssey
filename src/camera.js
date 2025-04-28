import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';

// Temporary vectors for calculations within this module
const _targetWorldPos = new THREE.Vector3(); // Renamed from _playerWorldPos for clarity
const _referenceWorldPos = new THREE.Vector3(); // Renamed from _homePlanetWorldPos
const _lookAtTarget = new THREE.Vector3(); // Where the camera should look
const _offsetVectorPlayer = new THREE.Vector3(config.CAMERA_OFFSET.x, config.CAMERA_OFFSET.y, config.CAMERA_OFFSET.z);
const _offsetVectorRocket = new THREE.Vector3(config.ROCKET_CAMERA_OFFSET.x, config.ROCKET_CAMERA_OFFSET.y, config.ROCKET_CAMERA_OFFSET.z);
const _positionQuaternion = new THREE.Quaternion();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _desiredPosition = new THREE.Vector3(); // Store desired camera position
const _rocketForward = new THREE.Vector3(); // To store rocket's forward direction

// Reuse matrix for lookAt calculation
const _lookAtMatrix = new THREE.Matrix4();

export function updateCamera(camera, targetObject, referenceFrameObject) {
    if (!targetObject || !referenceFrameObject || !camera) return;

    // Get target and reference frame WORLD positions
    targetObject.getWorldPosition(_targetWorldPos);
    referenceFrameObject.getWorldPosition(_referenceWorldPos);

    let upVector;
    let offsetVector;

    if (targetObject.name === 'rocket') {
        // --- Rocket Camera Logic --- 
        upVector = _worldUp.clone(); // Use world Y up as a base reference
        offsetVector = _offsetVectorRocket.clone(); // Use the rocket-specific offset {x:0, y:5, z:-15}

        // Get rocket's world quaternion and position
        targetObject.updateMatrixWorld(); // Ensure matrix/quaternion are up-to-date
        const rocketQuaternion = targetObject.quaternion;
        targetObject.getWorldPosition(_targetWorldPos); // Get rocket's current world position

        // Calculate desired camera position:
        // Start with the relative offset vector {x:0, y:5, z:-15}
        // Rotate this offset by the rocket's current world orientation
        // Add the rotated offset to the rocket's current world position
        _desiredPosition.copy(offsetVector).applyQuaternion(rocketQuaternion).add(_targetWorldPos);

        // Calculate look-at target slightly ahead of the rocket
        // Extract forward direction from quaternion (more robust than matrix for just direction)
        _rocketForward.set(0, 0, 1).applyQuaternion(rocketQuaternion).normalize(); // Rocket points along its local +Z
        _lookAtTarget.copy(_targetWorldPos).add(_rocketForward.multiplyScalar(20)); // Look 20 units ahead

    } else {
        // --- Player Camera Logic (Existing) --- 
        upVector = _targetWorldPos.clone().sub(_referenceWorldPos).normalize(); // Player's surface normal
        offsetVector = _offsetVectorPlayer.clone();

        // Calculate desired camera position relative to player and planet surface
        _positionQuaternion.setFromUnitVectors(_worldUp, upVector);
        const rotatedOffset = offsetVector.applyQuaternion(_positionQuaternion);
        _desiredPosition.copy(_targetWorldPos).add(rotatedOffset);

        // Look directly at the player
        _lookAtTarget.copy(_targetWorldPos);
    }

    // --- Apply Smooth Camera Movement --- 
    // Lerp camera position towards the desired position
    camera.position.lerp(_desiredPosition, config.CAMERA_SMOOTH_FACTOR);

    // --- Calculate Smooth Camera Orientation --- 
    // Use lookAt matrix method for robust orientation, then slerp quaternion
    _lookAtMatrix.lookAt(camera.position, _lookAtTarget, upVector);
    _positionQuaternion.setFromRotationMatrix(_lookAtMatrix); // Temporary store target rotation
    camera.quaternion.slerp(_positionQuaternion, config.CAMERA_SMOOTH_FACTOR); // Slerp towards target rotation
} 