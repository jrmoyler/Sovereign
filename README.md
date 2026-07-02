# SOVEREIGN — Collective AI Inc.

A playable, cinematic **3D real-time strategy game** in the browser. Age-of-Empires-style
bird's-eye gameplay reimagined as a strategic simulation of **Collective AI Inc.** becoming a
full-stack AI civilization. You lead **any of the company's 20 divisions** — every division is
fully playable — and race rival divisions to build **Sovereign Intelligence** —
superintelligence — before they do.

Built with **Three.js + plain ES modules. No build step. No framework. No TypeScript.**
Runs from a local static server.

![Faction select](docs/faction-select.png)

---

## Run it locally

You need any static file server (the module graph + `.glb` assets must be served over HTTP,
not opened as `file://`).

**Option A — the bundled Python server (recommended):**

```bash
python3 serve.py            # then open http://localhost:8000
python3 serve.py 8080       # custom port
```

**Option B — any other static server:**

```bash
npx serve .                 # or:  php -S localhost:8000  /  ruby -run -e httpd . -p 8000
```

Then open the printed URL, pick a division, and **Begin the Race**. A short in-game tutorial
runs the first time; press **H** any time for the full how-to-play guide.

> Requires a browser with WebGL2 and ES-module + import-map support (any modern Chrome, Edge,
> Firefox or Safari). Everything is served locally — no internet connection needed at runtime.

---

## How to play

You win by completing the **8-stage Sovereign Intelligence stack** (top-left panel) before any
rival — not by destruction. Military conquest only *slows rivals down*; the real race is
economic and technological acceleration.

**The stack:** Compute Supremacy → Data Dominance → Talent Network → Trust Threshold →
Governance Clearance → Recursive Agent Breakthrough → Physical Infrastructure Lock-in →
Sovereign Intelligence Activation. Each stage completes when you *sustain* its resource
threshold for a short time.

### Controls (trackpad-first)

| Action | Control |
| --- | --- |
| Select | Left-click |
| Box-select units | Left-drag |
| Move / Attack / Gather | Right-click (two-finger click) |
| Add to selection | Shift-click |
| Set building rally | Right-click with a building selected |
| Pan camera | `W A S D` / arrow keys / minimap |
| Rotate camera | `Q` / `E` or middle-drag |
| Zoom | Scroll / `+` `−` |
| Center on selection | `Space` |
| Control groups | `Ctrl+1…9` assign · `1…9` recall (double-tap to center) |
| Research tree | `T` · Strategic actions `A` · Help `H` · Pause `Esc` |

### Touch controls (phones & tablets)

| Action | Gesture |
| --- | --- |
| Select unit / building | Tap it |
| Box-select units | One-finger drag |
| Move / Attack / Gather | Tap ground, enemy or resource node with units selected |
| Set building rally | Tap ground with a building selected |
| Pan / Zoom / Rotate camera | Two-finger drag / pinch / twist |
| Clear selection · fullscreen | On-screen `✕` / `⛶` buttons |

The HUD reflows for small screens, touch targets grow, and build placement gets a floating
cancel button.

### The economy (8 resources)

- **Workers** gather **Compute, Data, Energy, Talent** from map nodes.
- **Buildings** generate **Capital, Trust, Infrastructure, Governance**.
- **Energy** powers Data Centers — keep it positive or output throttles.
- **Strategic Actions** (Recruit Talent, Buy Compute, Public Campaign, Secure Gov Favor,
  Sabotage, Alliance) feed the stack and disrupt rivals.
- **Risk events** — public backlash, regulation, poaching, model failure, overload, cyber
  attacks, energy shortages, agent misalignment — keep you honest.

---

## The 20 divisions — all fully playable

Every division has a unique colour palette, HQ, economy bonus, **specialist unit**,
**ultimate technology**, weakness, and AI personality profile (any division can also appear
as an AI rival).

| Division | Specialist | Ultimate |
| --- | --- | --- |
| **01 ZenFlow** — Agent OS | Agent Swarm | 600-Agent Lattice |
| **02 The Collective** — Strategy | Venture Strategist | Grand Orchestration |
| **03 Hybrid Living** — Human Dev | Mentor | Human Flourishing |
| **04 Nexus Labs** — Media & Worlds | Worldsmith | Dreamforge |
| **05 Terra Axis** — Smart Cities | Gridwright | Instant Metropolis |
| **06 Vital Helix** — Bio-digital | Biomedic (heals) | Longevity Protocol |
| **07 Binary Loom** — Code | Compiler Daemon | Reality Compiler |
| **08 Gaia Synthesis** — Green Energy | Terraformer | Closed Biosphere |
| **09 Animus Prime** — Robotics | Siege Android | Legion Protocol |
| **10 Aether Link** — Comms Mesh | Relay Warden | Omnimesh |
| **11 Obsidian Arc** — Security | Sentinel | Total Blackout |
| **12 Kinetic Edge** — Performance | Pacesetter | Overdrive |
| **13 Civic Core** — Civic Tech | Community Organizer | Public Mandate |
| **14 Quantum Ledger** — Finance | Market Maker | Hostile Buyout |
| **15 Collective Consulting** — Enterprise | Transformation Lead | Total Transformation |
| **16 Cognara Mind** — Behavioral | Mesmerist | Mindshare Monopoly |
| **17 Juris Guard** — Legal | Lead Advocate | Binding Precedent |
| **18 Signal Velocity** — Marketing | Influencer | Total Virality |
| **19 Titan Directorate** — Heavy Industry | Juggernaut | Titanfall Doctrine |
| **20 Nomad Nexus / Eon Core** — Mobile Civ | Pathfinder | Eternal Exodus |

---

## Architecture

The simulation is **fully decoupled from rendering**. The core runs a deterministic
fixed-timestep (20 Hz); the renderer interpolates at 60 fps and reads state + an event stream.

```
index.html            Import-map bootstrap, HUD host, boot splash
serve.py              Zero-dependency static server (correct .glb/.js MIME types)
src/
  main.js             Boot, faction select, game loop, pause/restart/win flow
  core/               SIMULATION (no Three.js, no DOM — unit-testable)
    Game.js             Orchestrator, command API, event stream
    World.js            Grid, resource nodes, occupancy, placement
    Player.js           Faction runtime: resources, tech mods, stack, diplomacy
    Entity.js           Unit / building factories
    Economy.js          Passive generation, energy gating, supply
    Research.js         Tech + Sovereign stack progression
    Combat.js           Targeting, damage, splash, building defense, death
    Risk.js             State-driven risk events
    Actions.js          Strategic actions (recruit/buy/campaign/sabotage/ally)
    util.js             Math, RNG, cost helpers
  render/             THREE.JS RENDERING
    Renderer.js         Scene, lights, fog, bloom, shadows, picking, event → FX
    CameraRig.js        RTS bird's-eye camera (pan/zoom/rotate/pitch, damped)
    Terrain.js          Obsidian ground, grid, glowing data routes, boundary
    ModelFactory.js     Procedural architecture: massing + window-façade
                        textures + roof/detail modules, merged by material
    EntityView.js       Per-entity object, skeletal animation, HP bars, selection
    Effects.js          Tracers, impacts, explosions, floating text, camera shake
    Assets.js           glTF loading + skinned-mesh cloning
  ui/                 HUD & OVERLAYS
    UI.js               Resource bar, Sovereign panel, command panel, modals, alerts
    Input.js            Pointer / keyboard / touch → selection + commands
    Minimap.js          Canvas minimap + click-to-move
    Menus.js            Faction select, pause, win/loss
    Tutorial.js         Coach-mark tutorial
    styles.css          Dark premium cinematic theme
  ai/
    RivalAI.js          Personality-driven opponent behaviour
  audio/
    AudioManager.js     Procedural Web Audio SFX + cinematic ambient music
  data/               DATA-DRIVEN DEFINITIONS (add content without touching the engine)
    factions.js units.js buildings.js tech.js balance.js constants.js
vendor/three/         Vendored Three.js r169 (build + addons) — no CDN at runtime
assets/models/        Real rigged glTF models (see CREDITS.md)
```

### Tests

The simulation is fully decoupled from the DOM/Three.js, so it runs headless under Node:

```bash
node tests/sim.test.mjs
```

This checks data integrity for all 20 divisions (specialists, ultimates, tech gates,
production buildings), plays a scripted match against AI rivals, and verifies research,
training, construction, elimination and both victory paths.

### Performance notes

- Vendored Three.js, no runtime CDN; import maps resolve bare specifiers.
- Pixel ratio capped (tighter on touch devices), PCF soft shadows (1024 on mobile),
  single bloom pass, pooled/short-lived FX.
- Fixed-step sim with a max-steps clamp prevents spiral-of-death on slow frames.
- Skinned models are cloned from two shared glTF sources.
- Buildings are compiled procedurally: canvas-generated window-façade textures (cached per
  faction accent), memoized shared materials, and all static parts merged into one mesh per
  material — a full base renders in a handful of draw calls.

---

## Credits & licenses

See **[CREDITS.md](CREDITS.md)**. In short: Three.js (MIT), two real rigged glTF models from the
Three.js example assets (RobotExpressive — CC0; Soldier — CC-BY), and a fully procedural
Web-Audio soundscape (no third-party audio). No AI-generated assets are used.

This game is a fictional strategic metaphor for Collective AI Inc.'s mission.
