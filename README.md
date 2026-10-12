# Gun Game

A 3D first-person shooter built with TypeScript and Three.js, shipped as a desktop app through Electron.

Modes:
- **Gun Game** (playable): each kill upgrades your weapon, and a kill with the Golden Gun wins.
- **Campaign** (in progress): story missions. Chapter 1, *The Mansion*, is a layout preview with no enemies yet.
- **Multiplayer** (in progress): online matches against an authoritative server.

## Quick start

```bash
npm install          # once
npm run dev          # play in the browser at http://localhost:5173 (hot reload)
npm run dev:desktop  # same, inside the Electron window
npm start            # production build + desktop app
npm run dev:server   # multiplayer server on ws://localhost:7777 (restarts on change)
npm run check        # typecheck every package + run tests
```

You can also launch the desktop app from the app menu ("Gun Game") or with `./gungame.sh`.

## Project layout

```
packages/
  shared/    Game rules with no rendering: runs in both client and server
    src/constants.ts        physics and player tuning
    src/physics/            AABB collision, player movement (used for prediction AND server sim)
    src/maps/               map data, registry by id
      builder.ts            MapBuilder: slabs with holes, walls with door/window openings, stairs, railings
      materials.ts          block surface kinds (solid? see-through?)
      arena.ts              Gun Game arena
      furniture.ts          furniture catalog: sizes and collision boxes for ~100 prop types
      mansion.ts            The Mansion: 4 storeys + basement, grounds, security cameras
    src/weapons.ts          every weapon's stats and model params
    src/difficulty.ts       bot difficulty presets
    src/gungame.ts          gun game weapon ladder
    src/protocol.ts         multiplayer message types (bump PROTOCOL_VERSION on change)
    src/ballistics.ts       bullet penetration: per-material resistance, box raycasts, ricochet

  client/    The game: Three.js + DOM UI, built with Vite
    index.html              HUD + menu markup
    public/                 static assets (models, textures, audio), copied into the build as-is
    src/main.ts             entry point
    src/core/               Game (engine + state machine), Graphics, Input, Audio, Settings, storage
    src/world/              builds MapDef into meshes; line of sight, spawn points
    src/entities/           Player, Bot, BotManager (AI)
    src/weapons/            WeaponSystem (firing, reload, view model), gun models
    src/fx/                 sparks, tracers, bullet holes
    src/ui/                 Hud, Menu, styles
    src/modes/              GameMode interface + GunGameMode; campaign/ holds mission data types
    src/net/                NetClient (typed WebSocket)

  server/    Node WebSocket server; simulates movement with shared code
    src/index.ts            connection handling + handshake
    src/Room.ts             one match: players, tick loop, snapshots

  desktop/   Electron shell; loads the Vite dev server in dev, client/dist otherwise
```

## Architecture

- **Engine vs. rules.** `Game` owns the systems (rendering, input, world, player, weapons, bots, HUD, menus).
  A `GameMode` owns the rules of a match: loadout, spawning, win and lose conditions.
  New modes implement `GameMode` and register in `client/src/modes/index.ts`.
- **Shared simulation.** Movement and collision live in `@gungame/shared` and use plain `{x, y, z}` vectors,
  so the client (for prediction) and the server (as the authority) run identical code.
  Keep `shared` free of `three`, DOM and Node APIs.
- **Maps are data.** A `MapDef` is boxes + props (cameras, lights, monitors) + named zones + spawn.
  Author maps with `MapBuilder`; the client merges blocks per material into a few meshes, the server only needs colliders.
  Zones name each room ("Second Floor · Master Suite") and show in the HUD during campaign missions.
- **Furniture is detailed props.** Maps place furniture by type (`m.furniture('sofa', x, y, z, 'west')`); shared code
  adds invisible collision boxes, and the client builds a detailed model for each type
  (`client/src/world/furniture/`) and merges every static part by material into a few meshes.
- **Security cameras** pan and feed live video to monitor banks (`client/src/world/SecuritySystem.ts`).
  The player's body is drawn only for security cameras, so you appear on the monitors.
- **Bullets are projectiles** (`client/src/weapons/Projectiles.ts`): muzzle velocity, drag and drop, and penetration
  through walls, furniture, glass and bodies by material and thickness (`shared/src/ballistics.ts`). Damage scales with
  remaining speed. Tune materials in `PENETRATION_RESISTANCE` and furniture via `resistance` in `furniture.ts`.
- **Lighting is dynamic**: time of day moves the sun and sky (`Graphics.setTimeOfDay`), lamps turn on after dark,
  and ceiling fixtures and chandeliers can be shot out (`world/LightSystem.ts`).
- **Glass** cracks (large panes), then fractures into small irregular shards with physics. Pieces break down further
  when they land hard or get walked on, and stuck pieces fall out when you push through the frame (`fx/fracture.ts`, `fx/Debris.ts`).
- **Movement** (shared, so the server simulates it too): stand / crouch (C) / prone (Z) with headroom checks, wading and
  swimming with buoyancy, diving (hold C), climbing out of water, breath and drowning (`shared/src/physics/movement.ts`).
- **Weapon customization** (`shared/src/attachments.ts`): optics, muzzle devices, barrels, underbarrel (grips, laser,
  light, bipod), magazines, stocks and finishes, each with stat trade-offs. Saved per weapon (`core/loadouts.ts`) and
  edited in the Armory (`ui/Armory.ts`). Attachments mount on every gun the same way (`weapons/gunModels.ts`); aiming
  lines the chosen optic up with the eye.
- **3D models** (`client/public/models/`, loaded at startup by `assets/AssetLibrary.ts`; credits in
  `models/CREDITS.md`). The golden gun (a gold Walther P38) and sniper (bolt-action 7.62) are PBR scanned-quality
  models. The pistol is a Glock 17 Gen5 built from its real profiles (`weapons/glock.ts`); the SMG, shotgun and
  assault rifle are still built from parts until models are added. Finishes repaint a
  model's materials but keep its surface detail; the "Factory" finish shows the original.
- **The player character** (`entities/character/`) is a rigged, animated character model (Mixamo skeleton). Clips
  drive walking and running; crouch (leg IK keeps the feet planted), prone crawl, swimming, aiming and both hands on the
  gun (two-bone IK, posed fingers) are layered on procedurally. The same model's arms are the first-person arms
  (`weapons/viewArms.ts`): shoulders fixed beside the camera, hands reaching the gun by IK every frame. The body is
  seen only by security cameras and as shadows (render layers in `core/layers.ts`); nothing of it is drawn for the
  first-person camera except the arms.
  If a model file is missing the game falls back to the built-in versions (`entities/ProceduralAvatar.ts`).

### Swapping in your own models
- **Guns:** put a glTF/GLB under `public/models/guns/<name>/`, add its path to `MODEL_FILES` and describe it in
  `weapons/gunAssets.ts`: which parts to show, and where the grip, muzzle, sights, rail, underside and magazine are
  (model space, muzzle along +x). Every attachment and finish then works on it.
- **Character:** any character on a Mixamo skeleton works (Mixamo, Character Creator, many store models). Export as
  GLB with Idle, Walk and Run clips and replace `models/characters/soldier/Soldier.glb` (or point `MODEL_FILES.player`
  at it). Mixamo downloads FBX; convert with Blender (File › Import FBX, then Export glTF 2.0 as .glb).
- **Fire** (`world/fire.ts`): shader-animated flame tongues, ember bed, sparks and charred logs with glowing cracks
  for wood fires; blue-rooted flames over glowing fire glass for gas; a light that flickers, shifts colour and sways.
- **Graphics**: generated normal maps on every surface, ambient occlusion, bloom and SMAA. Settings › Graphics quality
  switches presets (low turns post-processing off).
- **Weapons carried**: the mode hands out a set (`WeaponSystem.setInventory`); 1-9 / mouse wheel switch, Q swaps to
  the last one, and each gun keeps its own magazine. Gun Game gives one weapon at a time (the ladder).
- **Campaign missions are data** (`client/src/modes/campaign/missions.ts`): map, loadout, objectives and story beats.
  In campaign, **V** toggles fly mode (noclip) for reviewing layouts.

## Tooling

- TypeScript (strict) in every package, with workspace packages imported as source (no build step for `shared`).
- Vite for the client, `tsx` for the server, Vitest for tests (`*.test.ts` next to the code).
- Requires Node 18.18+. Node 22 LTS is recommended (see below).

### Planned upgrade

The toolchain is pinned to versions that still support Node 18: Electron 31, Vite 5, Vitest 2.
After moving to Node 22, bump Electron, Vite and Vitest to their current majors to clear the `npm audit` warnings.
