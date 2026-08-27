# Modulo:Alive

A top-down 2D survival and settlement-management game. Eight survivors start with a
campfire, three bedrolls and a forest that does not end. Everything after that is up
to you.

Built with Next.js + TypeScript and a canvas renderer. The whole game runs in the
browser — no server, no account, saves live in `localStorage`.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

Deploying to Vercel needs no configuration: it is a standard Next.js app with no
server-side state and no filesystem persistence.

## Playing it

| Input | Does |
| --- | --- |
| Left click | Select a survivor (or a building). Drag a box to select several. |
| Right click | Order the selection: walk there, chop that tree, mine that rock, forage that bush, or explore a discovered site. |
| `B` | Build menu. Blueprints are hauled and built by hand, not spawned. |
| `C` | Clear tool — drag over trees and rocks to mark them for removal. |
| `Space` | Pause / resume. `1` `2` `3` `4` set pause / 1× / 2× / 4×. |
| `WASD` / arrows | Pan. Mouse wheel zooms, middle-drag drags the view. |
| `F` | Follow the selected survivor. `Tab` cycles survivors. |
| `Esc` | Cancel the current tool, then open the menu. |

On a tablet everything is reachable by touch: drag to pan, pinch to zoom, tap to
select, and the **Order** button (or a long press) to command the selection.
Every tool has a **Cancel** button — nothing requires a keyboard.

Work priorities in a survivor's panel decide what they choose to do on their own.
Zero stars means they will never take that kind of job.

## How it is put together

The simulation and the presentation are kept apart on purpose: `src/game/sim/**`
never imports React or touches the DOM, and `src/game/render/**` never mutates the
world. That separation is what lets the same code run headless in CI.

```
src/
  game/
    core/        types, seeded RNG, A* pathfinding, small helpers
    data/        survivors, traits, buildings, crops, recipes, dialogue
    sim/         world state and every rule that changes it
      worldgen     terrain, forest, camp, exploration sites
      simulation   the fixed-step tick that drives everything below
      ai           priority-based autonomous behaviour
      jobs/tasks   the work queue and the work itself
      needs        hunger, energy, morale, stress, health
      movement     path following and separation
      farming, construction (in tasks), exploration, medical
      relationships, events, progression
      save         versioned, migratable localStorage saves
    render/      procedural sprites, camera, canvas renderer
    engine.ts    game loop, input, and the bridge to React
  components/    HUD, panels, menus — all read-only views over the world
  store/         the engine singleton and its React subscription
```

The renderer generates every sprite procedurally at runtime (`render/sprites.ts`),
so the repository ships no image assets and nothing is borrowed from another game.

### Simulation loop

Real time is accumulated, scaled by the speed setting, and stepped in fixed
0.1-second slices. Rendering runs independently at whatever frame rate the browser
gives it. Expensive subsystems are staggered rather than run every step:

| System | Interval (sim-seconds) |
| --- | --- |
| character AI decision | 0.45 – 0.9 per survivor, jittered |
| needs | 1.0 |
| job generation | 1.5 |
| crop growth / regrowth | 2.0 |
| social interaction | 5.0 |
| events, mortality, progression | 30 (one game hour) |

One game day is 1440 game minutes; one simulation second is two game minutes, so a
day takes twelve real minutes at 1× and three at 4×.

## Testing

The simulation runs headless, which makes the core loop testable without a browser:

```bash
npm run simtest        # asserts the full loop: movement, work, food, building,
                       # farming, exploration, injury, permadeath, save/load
npm run simtest:idle    # 12 days with zero player input — the baseline difficulty
```

`simtest` exits non-zero if any check fails.

## Extending it

A few things were built to be replaced rather than rewritten:

- **Fixed character traits.** The starting eight already have authored `fixedStats`
  and `startSkills` in `data/survivors.ts`, so they are the same people every game.
  Traits are still rolled; fill in `fixedTraits` on a template to pin those too.
- **New gear.** `data/gear.ts` is the single source for equipment: adding an entry
  makes it craftable at the workbench, wearable, and drawn on the sprite.
- **Seasons.** `sim/time.ts` already derives day, week, season and year from the
  clock, and every crop carries `plantSeasons` and `seasonYield`. The seasonal yield
  multiplier is live; strict seasonal planting is a condition in `jobs.ts`.
- **Save migrations.** `sim/save.ts` versions every payload and has a `migrate()`
  step to grow with the format.
- **New buildings, crops, traits, recipes.** All data-driven; add an entry and it
  appears in the build menu / farm rotation / trait pool.
