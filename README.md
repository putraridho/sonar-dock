# Sonar Dock

A cinematic HUD mod for [Claude Code](https://claude.com/claude-code): a live radar sweep, threat level, usage gauges and a telemetry feed of everything Claude does, docked beside your transcript, plus a phosphor-style chat skin.

## Install

In a Claude Code terminal session:

```
/plugin install sonar-dock --marketplace putraridho/sonar-dock
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). The mod is active right away.

## Usage

| Command | What it does |
| --- | --- |
| `/sonar` | Open the Sonar Dock HUD and the chat skin |
| `/sonar light` · `/sonar dark` · `/sonar auto` | Pick the palette (auto follows your theme) |
| `/sonar off` | Stand down and restore the normal chat |

The HUD docks as a sidebar in fullscreen terminals that are wide enough (144+ columns when it opens on its own).

## Development

```sh
claude --plugin-dir .          # run Claude Code with this checkout loaded
claude plugin validate .       # check the manifest and hooks module
claude plugin test .           # run the tests
```

## Architecture

`hooks/register.tsx` only composes: each feature installs its hooks over one shared context.

| Folder | Holds | Touches the engine |
| --- | --- | --- |
| `lib/`, `text/` | Math and formatting helpers | No |
| `theme/` | One palette per mode; rasters take its numbers, the interface its hex | No |
| `domain/` | The rules: tool kinds, the threat matrix, usage windows, how calls read, spinner words | No |
| `motion/` | The 30 fps frame clock, text effects (decode, glitch, glint), entrances | No |
| `raster/` | Pure drawings to cells: radar, AI core, shimmer, meter, timeline, voiceprint | No |
| `runtime/` | Session state: the scene clock, the live feed and stream pacing, the HUD, what is on screen | No |
| `features/` | Hooks: lifecycle and clocks, telemetry, the stream, the chat skin, the pane | Yes |

Three rules come from the engine's static scan of hooks modules, and shape the layout:

- `$` is handed only to functions in the same file, so everything below `features/` is pure, and the clocks reach the engine through a small `Ports` interface built where the session starts.
- Each file that reads or writes state declares its own `atom(...)` with literal names; their starting values live once, in `runtime/state.ts`.
- One hook per event and matcher: `turn.step` both counts the stream for the meter and paces it.

