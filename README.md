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
