# The Meridian

A 3D stealth-action first-person shooter built with TypeScript and Three.js, shipped as a desktop app through Electron. (It started life as "Gun Game": that's still the name of the weapon-ladder mode, the `@gungame/*` packages and the `gungame.sh` launcher.)

Modes:
- **Gun Game** (playable): each kill upgrades your weapon, and a kill with the Golden Gun wins.
- **Campaign**: story missions. Chapter 1, *The Mansion*: a stealth hostage rescue during a party. Chapter 2, *The Aurelia*: undercover on a cruise ship to reach the Meridian's boss. Chapter 3, *The Port*: sabotage at a container terminal.
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

You can also launch the desktop app from the app menu ("The Meridian") or with `./gungame.sh`.

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
- **Facial hair** (`entities/character/facialHair.ts`): each style is a density field over the face (cheeks, jaw,
  moustache, chin); a fine copy of the head's surface is pushed out by it, sinking under the skin where it fades, so
  edges taper and the mouth stays clear. The head's shape is shared (`shapeHead` in `entities/human.ts`).
- **Character customization** (`shared/src/character.ts`, Character screen in `ui/CharacterScreen.ts`): uniform camo,
  headgear, vest, skin tone, facial hair, hair, gloves and boots. `entities/character/soldierOutfit.ts` generates the
  soldier's clothing and gear as skinned meshes on the character's skeleton for the chosen look (saved in
  `core/characterLook.ts`); the body, cutscenes and first-person arms all use it.
- **Party guests** (`guest` props in `buildParty`; `world/PartySystem.ts`, `entities/party/PartyGuest.ts`): dressed
  people on the character rig who dance on the beat of the music (several dance styles), chat in pairs with
  drinks (sipping, talking with their hands, nodding, laughing), DJ, tend bar and lounge by the pool. Each guest's
  look comes from its seed; bodies are generated once, shared, and drawn in one call with a per-guest palette
  (`crowdMaterial`), and prebuilt in the background while the main menu is up.
- **Poses** (`entities/character/poseKit.ts`): shared procedural layers over the animation clips: sitting (and
  rising naturally), crouching with planted feet, placing hands, head look. Cutscenes drive the player's body with
  `AvatarState.seat / hold / touchEar / lookAt` (e.g. elbows-on-knees in the van, low-ready pistol carry).
- **The Mansion party** (`buildParty` in `shared/src/maps/mansion.ts`, models in `world/furniture/party.ts`): rooftop
  searchlights, coloured uplights, DJ booth with moving heads and lasers, bars, champagne tower, red carpet and balloon
  arch, glowing orbs. The mission starts at 9 pm under a starry sky.
  Live-synthesised house music plays from the DJ booth (`audio/PartyMusic.ts`): positional, and muffled through walls.
- **Voice lines** (`client/src/audio/voicelines.json`, `audio/Voice.ts`): every spoken line with its subtitle text and
  speaker. Radio voices (Overwatch, Viper, Security) play in your ear with a squelch and duck the music; guards and
  Reyes speak from where they are, muffled through walls. Guards call out when they notice, spot, search, give up,
  fight and get hit (`bark` events from `GuardManager`), each in their own voice. The audio is rendered offline with
  Piper TTS by `tools/voice/generate.py` (credits in `public/audio/CREDITS.md`); a test fails if a line's recording
  is missing or out of date. Without the files, lines are subtitles only.
- **Chapter 1: The Mansion** (`modes/campaign/mansionMission.ts`): rescue Daniel Reyes. Stages: get inside (the side
  door, or pick the library's garden door off the quiet west lawn), find out where he's held (any three of six leads:
  the camera log on the security terminal, the wine cellar, Castell's laptop, a kitchen order, Castell's phone, two
  guards on a smoke break to listen in on; text in `mansionLeads.ts`, models in `world/ClueSystem.ts`), Kessler's
  keycard, free Reyes (lockdown), get him to the van, then the getaway (`cutscenes/mansionEscape.ts`). The party must
  not find out before the escape (gunshots heard, a guest hit, a body seen by a guest, a fight near guests). Each
  stage, and each lead, saves a checkpoint (including where bodies lie). Six optional challenges
  (`mansionChallenges.ts`: ghost, no kills, no bodies found, every lead, Castell's ledger from the vault, under 20:00)
  are scored at the end and kept for good; the pause screen shows the objective, the leads with what they said, and
  the challenges.
- **Chapter 2: The Aurelia** (`modes/campaign/aurelia/`, map `shared/src/maps/aurelia.ts`): a cruise liner at sea,
  six decks (crew, staterooms, promenade with casino and lounge, lido, the Meridian's deck, bridge). You board as
  "Marco Navarro", unarmed and in a suit. **Undercover** (`cover.ts`): your clothes decide where you can be (guest,
  steward, ship security); guards ignore you unless you give them a reason (trespassing, after a warning; a gun in
  your hand, H holsters it; running, sneaking, takedowns, bodies). Uniforms lie about the ship or come off officers
  you've knocked out (`modes/campaign/wardrobe.ts`, shared with Chapter 3); the player's outfit is drawn over their own look (`Game.setOutfit`).
  **The story** (`story.ts`): Felix, your contact, in the casino; a suppressed pistol in a spa locker; five things to
  read or overhear about the Meridian (three needed); Castell in his suite (conversation: he gives up Vale's keycard,
  or you threaten him); then **Vale** (`vale.ts`): the Board in the lounge (poison the decanter for his toast), his
  desk, his balcony (push him over, or shoot). Out through the stern to Overwatch's boat (`cutscenes/aureliaEscape.ts`).
  Six challenges (`challenges.ts`). Named characters are `npc/StoryNPC.ts`; conversations (`conversation.ts`) are
  scripts of voiced lines with numbered replies. The sea, outer hull, wake and coast lights are `world/Seascape.ts`.
- **Chapter 3: The Port** (`modes/campaign/port/`, map `shared/src/maps/port.ts`): Terminal Est, a container
  terminal at Marseille-Fos at night. Plant a charge on the Meridian's reserve before it's loaded on the Sirocco.
  You start outside the fence in your own clothes; the same undercover rules as the ship (`port/cover.ts`: civilian,
  docker, terminal security; nobody is allowed in the Meridian's compound, and they don't warn). The story
  (`port/story.ts`): the docker's kit behind Nadia's car; Nadia in the canteen (conversation: security took her bag
  with the charge at the shift's bag checks); the bag off the evidence rack in the gate office (security only: take
  a guard's uniform, or sneak); any three of four leads to find which of the four boxes is the reserve (the
  planner's load plan upstairs in Ops, customs' X-ray scans, the gate office bookings, two Meridian men overheard
  by the reefers); plant the charge on its doors in the compound (in through a cut in the quay-side fence, round two
  patrols inside and two outside, a camera sweeping the centre lane); then Marchetti's men take the gates and you
  leave through the hole in the west fence, where Overwatch brings the van round. Guards and cameras notice you
  faster here (`PORT_PERCEPTION`). Restricted areas are marked in the world (signs, red and white hatching across
  each threshold), on screen (a warning card and a red edge while you're in; shared with Chapter 2) and on the
  tactical map (shaded red for what you're wearing). Intro and outro: `cutscenes/portArrival.ts`
, `cutscenes/portEscape.ts` (the Sirocco leaving, and the charge).
  The water, far shore, other terminals and breakwater light are `world/Harbour.ts`; the yard's props (containers,
  gantry cranes, straddle carriers, light masts, the X-ray portal) are `world/furniture/port.ts`. Six challenges.
- **Field kit** (`modes/campaign/fieldKit.ts`): tag guards (T) to track them through walls (colour = alertness), throw
  coins (G; `coins.ts`) that draw the nearest guard at ease to look without raising the alarm, the tactical map (M;
  `ui/TacticalMap.ts`) drawn from the level (walkable floor, walls, glass, room names) with you, the objective, tagged
  guards, cameras, doors, hiding spots and the van. Bodies dragged to any wardrobe or locker are hidden for good.
- **Balance**: campaign security per difficulty is data (`DIFFICULTIES[...].stealth` in `shared/src/difficulty.ts`):
  perception, guard accuracy, damage and reaction, how many guards hunt you in a lockdown (the rest hold their posts on
  alert), reinforcement waves, coins. Guards go for Reyes only when they can't see you or he's much nearer; he takes
  less damage when ducking and recovers like you do.
  `tools/balance/coverage.cjs` (with the dev server running) draws heat maps of every floor showing how fast a
  crouched player is spotted anywhere: use it when moving guards, cameras or entrances.
- **Guards** (`npc/Guard.ts`, `npc/GuardManager.ts`; `guard` props in `buildSecurityTeam`): patrol routes, an
  awareness meter (distance, stance, light, night), noise from footsteps, shots and glass, cameras, body discovery,
  alarm levels 0–3 with reinforcement waves. Paths come from `shared/src/nav/NavGrid.ts` (0.5 m grid built from
  colliders); sight uses `World.clearLine`. Doors (`world/DoorSystem.ts`) can need key items.
- **Beverly Hills around the estate** (`world/Neighborhood.ts`, enabled by the map's `backdrop`): neighbouring
  estates behind ficus hedges (Mediterranean villas with terracotta hip roofs, a few modern houses, lit windows and
  glowing pools at night), tall fan palms and lamps lining the street, the canyon rising behind the house with house
  lights and winding roads, the LA basin's lights to the south and the Century City towers. It's scenery only: merged
  meshes, instanced palms and lamps, no shadows or real lights (about 1-2 ms a frame). Distant pieces use a longer fog
  (`farFog`), and everything stays inside the night sky sphere (880 m). The across-street hedges, palm trunks and lamp
  posts are real map geometry (`NEIGHBOR_DRIVES`, `STREET_PALMS`, `STREET_LAMPS` in `mansion.ts`), so the street
  has edges.
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
- **God rays** (`core/GodRaysPass.ts`): volumetric sunlight. Each pixel's view ray is marched through the sun's
  shadow map, so beams show through windows and between trees, columns and palms, warm at sunset and faint by moonlight.
  On for medium and high quality.
- **Graphics**: generated normal maps on every surface, ambient occlusion, bloom and SMAA. Settings › Graphics quality
  switches presets (low turns post-processing off).
- **Weapons carried**: the mode hands out a set (`WeaponSystem.setInventory`); 1-9 / mouse wheel switch, Q swaps to
  the last one, and each gun keeps its own magazine. Gun Game gives one weapon at a time (the ladder).
- **Loading** (`ui/LoadingScreen.ts`, `Game.startMatch`): matches load behind a loading screen with the mission's art,
  briefing and tips. Loading is staged (build the map, set up the mode and intro, compile shaders in the background,
  render a warm-up frame) so the first frames don't stall, then waits for a click, which also captures the mouse.
  Background art lives in `public/images/loading/` (rendered from the game) and is named per mission/mode.
- **Cutscenes** (`client/src/cutscenes/`): scripted scenes a mission names as its `intro`. A scene drives the camera,
  the player's body and its own props each frame, with fades, a title card and subtitles (`CutsceneFrame`), then hands
  over control where it leaves you; hold Space or Enter to skip. The Mansion opens with `mansionArrival` (about 32 s): an
  aerial over the estate, a ride in the back of the van with radio chatter (`ARRIVAL_DIALOGUE`, easy to rewrite), the
  van turning in through the gates, the door sliding open on you, and the camera moving into your eyes.
  The van (`world/vehicles/van.ts`) stays parked on the drive.
- **Sound**: everything is synthesised with WebAudio (`core/Audio.ts`), including the engine, radio squelch, night
  ambience and the party music; Settings has separate main and music volume.
- **Unlocks** (`shared/src/unlocks.ts`, `core/progress.ts`): you start with the assault rifle and pistol. Other guns
  are found in missions (`weaponPickup` props; look at one and press E) and stay unlocked; the Golden Gun also comes
  from winning Gun Game. Locked guns show in the Armory with how to get them.
- **Campaign missions are data** (`client/src/modes/campaign/missions.ts`): map, loadout, objectives and story beats.
  In campaign, **V** toggles fly mode (noclip) for reviewing layouts.

## Tooling

- TypeScript (strict) in every package, with workspace packages imported as source (no build step for `shared`).
- Vite for the client, `tsx` for the server, Vitest for tests (`*.test.ts` next to the code).
- Requires Node 18.18+. Node 22 LTS is recommended (see below).

### Planned upgrade

The toolchain is pinned to versions that still support Node 18: Electron 31, Vite 5, Vitest 2.
After moving to Node 22, bump Electron, Vite and Vitest to their current majors to clear the `npm audit` warnings.
