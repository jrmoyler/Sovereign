// ============================================================================
// Asset loading & caching. Loads the real rigged glTF models once, then hands
// out skinned clones (via SkeletonUtils) each with independent animation.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_FILES = {
  soldier: 'assets/models/Soldier.glb',
  robot: 'assets/models/RobotExpressive.glb',
};

// Map an abstract animation hint -> candidate clip names per model.
const CLIP_MAP = {
  soldier: { idle: ['Idle'], walk: ['Walk'], run: ['Run'], work: ['Walk'], attack: ['Idle'], die: ['Idle'] },
  robot: {
    idle: ['Idle'], walk: ['Walking'], run: ['Running'], work: ['Walking'],
    attack: ['Punch'], die: ['Death'],
  },
};

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.gltf = {};        // model key -> gltf
    this.clips = {};       // model key -> { name: AnimationClip }
  }

  async load(onProgress) {
    const keys = Object.keys(MODEL_FILES);
    let done = 0;
    for (const key of keys) {
      const g = await this.loader.loadAsync(MODEL_FILES[key]);
      this.gltf[key] = g;
      this.clips[key] = {};
      for (const c of g.animations) this.clips[key][c.name] = c;
      // ensure meshes cast/receive shadows
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.metalness = Math.min(o.material.metalness ?? 0.5, 0.6); } });
      done++; onProgress && onProgress(done / keys.length, key);
    }
  }

  // Return { root, mixer, actions:{hint:action}, baseScale } for a model.
  instance(modelKey, tint) {
    const g = this.gltf[modelKey];
    const root = cloneSkinned(g.scene);
    root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.material = o.material.clone();
        if (tint) {
          // strong faction tint so units read as their division at a glance
          o.material.color = new THREE.Color(o.material.color).lerp(new THREE.Color(tint), 0.55);
          if ('emissive' in o.material) { o.material.emissive = new THREE.Color(tint); o.material.emissiveIntensity = 0.22; }
        }
      }
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    const map = CLIP_MAP[modelKey];
    for (const hint in map) {
      for (const name of map[hint]) {
        if (this.clips[modelKey][name]) { actions[hint] = mixer.clipAction(this.clips[modelKey][name]); break; }
      }
    }
    return { root, mixer, actions };
  }
}
