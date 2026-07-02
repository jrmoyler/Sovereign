// ============================================================================
// RTS camera rig: an orbit-style bird's-eye camera focused on a ground target.
// Smooth pan, zoom (dolly) and yaw/pitch rotation with damping.
// ============================================================================

import * as THREE from 'three';
import { CAMERA, MAP } from '../data/constants.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.target = new THREE.Vector3(0, 0, 0);
    this.desiredTarget = new THREE.Vector3(0, 0, 0);
    this.zoom = CAMERA.START_ZOOM;
    this.desiredZoom = CAMERA.START_ZOOM;
    this.yaw = 0;
    this.desiredYaw = 0;
    this.pitch = CAMERA.START_PITCH;
    this.desiredPitch = CAMERA.START_PITCH;
    this._tmp = new THREE.Vector3();
  }

  focus(x, z) { this.desiredTarget.set(x, 0, z); this.target.set(x, 0, z); }

  panBy(dx, dz) {
    // pan relative to current yaw so screen-space feels natural
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = dx * c - dz * s;
    const wz = dx * s + dz * c;
    const lim = MAP.SIZE / 2 + 8;
    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x + wx, -lim, lim);
    this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z + wz, -lim, lim);
  }
  zoomBy(d) { this.desiredZoom = THREE.MathUtils.clamp(this.desiredZoom + d, CAMERA.MIN_ZOOM, CAMERA.MAX_ZOOM); }
  rotateBy(dyaw, dpitch) {
    this.desiredYaw += dyaw;
    this.desiredPitch = THREE.MathUtils.clamp(this.desiredPitch + dpitch, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
  }

  update(dt) {
    const k = 1 - Math.pow(0.0015, dt); // damping
    this.target.lerp(this.desiredTarget, k);
    this.zoom += (this.desiredZoom - this.zoom) * k;
    this.yaw += (this.desiredYaw - this.yaw) * k;
    this.pitch += (this.desiredPitch - this.pitch) * k;

    const h = Math.sin(this.pitch) * this.zoom;
    const r = Math.cos(this.pitch) * this.zoom;
    this.cam.position.set(
      this.target.x + Math.sin(this.yaw) * r,
      h,
      this.target.z + Math.cos(this.yaw) * r,
    );
    this.cam.lookAt(this.target);
  }
}
