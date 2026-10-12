# Gun Game: notes for Claude

See README.md for the layout and commands. Conventions:

- TypeScript everywhere, strict. Run `npm run check` (typecheck + tests) after changes.
- `packages/shared` must stay pure: no `three`, DOM or Node imports. Anything the server needs to simulate (physics, maps, weapon stats, protocol) goes here.
- Gameplay rules belong in a `GameMode` (`packages/client/src/modes/`), not in `Game`. `Game` is the engine and state machine.
- Tunable numbers live in data (`shared/src/weapons.ts`, `difficulty.ts`, `constants.ts`, `gungame.ts`), not inline in systems.
- Changing a type in `shared/src/protocol.ts` requires bumping `PROTOCOL_VERSION`.
- Tests sit next to the code as `*.test.ts` (Vitest). Prefer testing shared logic.
- Electron: VS Code terminals set `ELECTRON_RUN_AS_NODE=1`. Launch through `./gungame.sh` or `npm run dev:desktop`, which unset it.
- Node 18 is installed. Don't bump Vite, Vitest or Electron majors until Node is upgraded.
- Maps: author with `MapBuilder` in `shared/src/maps/`. Mansion conventions: +x east, -z north (back of house), floor tops at `MANSION_LEVELS`. Add a zone for every new room, and a walkthrough test when you change stairs or doors (see `mansion.test.ts`).
- In dev builds `window.game` is the Game instance (handy for teleporting: `game.player.pos.set(x, y, z)`).
- 3D model files live in `packages/client/public/models/` and load before `Game` is built (`assets/AssetLibrary.ts`). Anything that uses a model must keep working without it (procedural fallback). Record every new file's source and license in `models/CREDITS.md`. Geometry from model files is shared between copies: never dispose it.
- Character posing (`entities/character/rig.ts`) works in world space on Mixamo bone names, so it doesn't depend on a rig's local bone axes.
- The packaged app serves the client from `app://game/` (see `desktop/main.cjs`) because `fetch` doesn't work on `file://`. Rebuild (`npm run build`) after client changes; `gungame.sh` only builds when `dist` is missing.
