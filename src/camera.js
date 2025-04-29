import * as THREE from 'https://esm.sh/three@0.128.0';
import * as config from './config.js';
import { isRocketApproachingLanding } from './rocket.js'; // Import the new state checker

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

// --- State for Fixed Landing Camera --- 
let fixedLandingCamPos = null; // Store the position camera should move to
let fixedLandingLookAt = null; // Store the point camera should look at
const _tempFixedLookAt = new THREE.Vector3(); // Temp vec for lerping lookAt

export function updateCamera(camera, targetObject, referenceFrameObject) {
    if (!targetObject || !referenceFrameObject || !camera) return;

    // Get target and reference frame WORLD positions
    targetObject.getWorldPosition(_targetWorldPos);
    referenceFrameObject.getWorldPosition(_referenceWorldPos);

    let upVector = _worldUp.clone(); // Default to world up
    let offsetVector;
    let finalLookAtTarget = _lookAtTarget; // Use a variable for the final lookAt target

    const isRocketActive = targetObject.name === 'rocket';
    const approachingLanding = isRocketActive && isRocketApproachingLanding();

    if (isRocketActive) {
        // --- Rocket Camera Logic --- 
        targetObject.updateMatrixWorld(); 
        const rocketQuaternion = targetObject.quaternion;
        targetObject.getWorldPosition(_targetWorldPos); // Get rocket's current world position

        if (approachingLanding) {
            // --- Fixed Landing View --- 
            if (fixedLandingCamPos === null) {
                // First frame of approach: Calculate and store the fixed view
                console.log("Camera: Fixing landing view reference points.");
                offsetVector = _offsetVectorRocket.clone();
                // Calculate desired position based on *current* state
                fixedLandingCamPos = _desiredPosition.copy(offsetVector).applyQuaternion(rocketQuaternion).add(_targetWorldPos);
                // Target lookAt is the rocket's current position
                fixedLandingLookAt = _targetWorldPos.clone(); 
                _tempFixedLookAt.copy(fixedLandingLookAt); // Initialize lerp target
            }

            // Smoothly move camera to the fixed position
            _desiredPosition.copy(fixedLandingCamPos);
            // Smoothly lerp the lookAt target towards the fixed rocket landing point
            _tempFixedLookAt.lerp(fixedLandingLookAt, config.CAMERA_SMOOTH_FACTOR * 2); // Lerp faster?
            finalLookAtTarget = _tempFixedLookAt; 
            // Use world up for fixed view?
            // upVector = _worldUp.clone(); 
            // Or derive from camera position and target?
            upVector.subVectors(camera.position, finalLookAtTarget).cross(_worldUp).normalize(); // Right vector
            upVector.cross(upVector).normalize(); // Recompute up vector
            if (upVector.length() < 0.1) upVector.copy(_worldUp); // Fallback

        } else {
             // --- Normal Rocket Following View --- 
             fixedLandingCamPos = null; // Reset fixed view state
             fixedLandingLookAt = null;

             offsetVector = _offsetVectorRocket.clone(); 
             _desiredPosition.copy(offsetVector).applyQuaternion(rocketQuaternion).add(_targetWorldPos);
             // Calculate look-at target slightly ahead
             _rocketForward.set(0, 0, 1).applyQuaternion(rocketQuaternion).normalize(); 
             _lookAtTarget.copy(_targetWorldPos).add(_rocketForward.multiplyScalar(20)); 
             finalLookAtTarget = _lookAtTarget;
             // Derive up vector from rocket orientation? Maybe not necessary if looking ahead.
             upVector = _worldUp.clone(); // Simpler for now
        }

    } else {
        // --- Player Camera Logic --- 
        fixedLandingCamPos = null; // Reset fixed view state when not following rocket
        fixedLandingLookAt = null;

        upVector = _targetWorldPos.clone().sub(_referenceWorldPos).normalize(); // Player's surface normal
        offsetVector = _offsetVectorPlayer.clone();
        _positionQuaternion.setFromUnitVectors(_worldUp, upVector);
        const rotatedOffset = offsetVector.applyQuaternion(_positionQuaternion);
        _desiredPosition.copy(_targetWorldPos).add(rotatedOffset);
        _lookAtTarget.copy(_targetWorldPos);
        finalLookAtTarget = _lookAtTarget;
    }

    // --- Apply Smooth Camera Movement --- 
    camera.position.lerp(_desiredPosition, config.CAMERA_SMOOTH_FACTOR);

    // --- Calculate Smooth Camera Orientation --- 
    _lookAtMatrix.lookAt(camera.position, finalLookAtTarget, upVector);
    _positionQuaternion.setFromRotationMatrix(_lookAtMatrix); 
    camera.quaternion.slerp(_positionQuaternion, config.CAMERA_SMOOTH_FACTOR); 
} 