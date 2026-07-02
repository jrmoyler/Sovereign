# Credits & Asset Licenses

SOVEREIGN is built entirely from **real, legitimately-licensed open assets and libraries** and
**procedurally generated** content. **No AI-generated assets are used** anywhere in this project.

---

## Engine / library

- **Three.js** `r169` — 3D engine (core build + addons: GLTFLoader, SkeletonUtils,
  EffectComposer, RenderPass, UnrealBloomPass, OutputPass, MaskPass, CopyShader,
  LuminosityHighPassShader, OutputShader, RoomEnvironment, BufferGeometryUtils).
  License: **MIT**. © mrdoob and the three.js authors.
  https://github.com/mrdoob/three.js — vendored locally under `vendor/three/`.

## 3D models (real, rigged, skeletally animated)

Both models ship with the official Three.js example assets and are used here for the game's
rigged characters (workers, engineers, researchers, scouts, security, media, legal units,
combat robots and faction specialists).

- **RobotExpressive.glb** — used for robotic / combat / specialist units.
  Author: **Tomás Laulhé**. Modifications: **Don McCurdy**.
  License: **CC0 1.0 (Public Domain)**.
  Animations used: Idle, Walking, Running, Punch, Death.
  Source: https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive

- **Soldier.glb** — used for humanoid workers and personnel.
  From the Three.js example assets (glTF sample model, rigged with Idle / Walk / Run clips).
  License: **CC-BY** (attribution to the three.js example asset authors).
  Source: https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf

> Faction colour tinting is applied at runtime to the real model materials; the meshes,
> skeletons and animations are the original downloaded assets.

## Textures / environment

- **Terrain, buildings, resource nodes, data routes, boundary** — procedurally generated
  geometry with physically-based (`MeshStandardMaterial`) and emissive materials. No external
  texture files.
- **Image-based lighting / reflections** — Three.js `RoomEnvironment` (part of three.js, MIT),
  generated at runtime via `PMREMGenerator`.

## Audio (real-time synthesized — no third-party audio files)

- **Sound effects & cinematic ambient music** — synthesized live in the browser with the
  **Web Audio API** (oscillators, filtered noise, envelopes, a slowly-modulated pad and a
  sparse arpeggio). This is classic DSP synthesis, authored by hand in
  `src/audio/AudioManager.js` — **not sampled and not AI-generated**.
- The audio layer is **extensible**: drop real CC0/CC-BY `.ogg`/`.wav` files into
  `assets/sounds/` and register them in `OPTIONAL_FILES` in `AudioManager.js`; they will be
  loaded and used in place of the synthesized equivalents.

## Fonts

- System UI font stack (Segoe UI / system-ui / Helvetica / Arial) and a monospace stack — no
  bundled font files.

---

## Attribution summary

| Asset | Author | License |
| --- | --- | --- |
| Three.js r169 | mrdoob & three.js authors | MIT |
| RobotExpressive.glb | Tomás Laulhé, mod. Don McCurdy | CC0 1.0 |
| Soldier.glb | three.js example assets | CC-BY |
| RoomEnvironment | three.js authors | MIT |
| Terrain / buildings / VFX | procedural (this project) | — |
| SFX & music | procedural Web Audio (this project) | — |

If you extend the game with additional downloaded assets, add their author, source URL and
license to this file.
