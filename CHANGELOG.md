# Changelog

What changed in each version of Sonar Dock, newest first.

## 0.7.2 — 2026-10-29

The watch counts from the first contact.

- The debrief's time on watch no longer reads 0m after `/plugin` reloads in a session that began before 0.7.1: it counts from the oldest call on record whenever that is earlier than the start kept.

## 0.7.1 — 2026-10-29

The watch survives a reload.

- The debrief's time on watch runs from the session's start, kept across `/reload-plugins`; it no longer resets to 0m.
- For a session that began before 0.7.1, it counts from the oldest call still on record.

## 0.7.0 — 2026-10-29

More diagrams, a forecast, and a debrief.

- State diagrams: states in rounded boxes, `[*]` as a start dot and an end dot, choices as diamonds, transitions with their words; composites are flattened and notes left out.
- Class diagrams: each class a box with its name over a rule, then its fields and its methods; inheritance (△), composition (◆), aggregation (◇) and plain or dotted links, parents above.
- Pie charts are drawn as bars, largest first, each in a color of the palette, with the share (and the value under `showData`).
- The usage gauges forecast: a window filling fast enough to run out before it resets says when (`full ~40m`) in place of the reset time, and a toast warns once when that is under 45 minutes away.
- `/sonar debrief` sums up the session: how long on watch, turns, actions by kind, edits and files touched, errors, the peak threat and the cost. `/sonar off` ends with it.

## 0.6.0 — 2026-10-29

The matrix reads more than commands.

- Edits are weighed by the file they write: keys and `~/.ssh` sound a red alert, `.env` and credential files a caution, lockfiles a nudge.
- Shell commands catch more: `rm -r` without `-f`, disk overwrites (`dd` to a device, `mkfs`), package publishes and pushes to `main` or `master`.
- Connector calls that send something out (a message, a post, a reply) raise the threat a step; drafts and reads do not.
- Each signature raises the level by its own weight, and the toast says RED ALERT or CAUTION to match.
- Skills, artifacts, messages to other agents and scheduling tools get their own kinds: their own pill, color and radar letter. Workflows count as agents, LSP as a search. The radar's legend adds any such kind on the scope.
- Sonar Dock has an icon.

## 0.5.0 — 2026-10-13

Replies draw their mermaid diagrams.

- A ` ```mermaid ` block in a reply is drawn as a diagram in box-drawing characters, in the palette, under a small title; its rows sweep in from the top behind a scan line.
- Flowcharts in all four directions: node shapes, edge labels, dotted and thick edges, `&` groups, chains and cycles. Lines that meet join, and edges into one node share a track. A left-to-right chart too wide for the terminal turns top-down.
- Sequence diagrams: lifelines, solid, dashed and cross arrows, messages to self, notes, and `loop`/`alt`/`opt` blocks as dotted rules.
- A reply with a diagram takes the full width like a table: the speaker on its own row. Kinds it does not draw stay as code.

## 0.4.1 — 2026-10-08

The totals open their lists.

- Edits, files and errors in the pane's totals are buttons: each opens its list under the row (newest first, eight rows, then how many more), and a second press closes it. An open list takes its rows from the activity log.
- Errors list the call and the first line of why it failed.
- The totals keep their own capped record of edits and failures, since the activity log keeps only its newest lines.

## 0.4.0 — 2026-10-08

The small rows wear the skin; pastes read clean.

- `/sonar` answers with its own row: a SONAR pill, the message decrypting in, and a readout of palette, threat, turns and actions as they stood.
- The run-in-background hint under a call reads as the skin's key and action.
- Notices under the logo and the footer's mode labels take the palette.
- A raised threat rides at the end of the prompt hint; the engine's line and its pills stay as they are.
- Pasted text shows as the words pasted, without its wrapper, in the YOU row and the activity log.

## 0.3.3 — 2026-10-07

Replies with tables keep the skin.

- A block holding a table no longer falls back to the engine's drawing: the CLAUDE pill and voiceprint take a row of their own and the block runs full width beneath, so the table keeps its borders.

## 0.3.2 — 2026-10-07

CLAUDE speaks in the band from the first word.

- The band's live lines sit in a speaker row: the CLAUDE pill powers on as the reply starts, not when it lands.
- Streamed lines read as plain words: markdown marks are stripped in the band (the transcript is untouched), and long lines cut on a word with an ellipsis.

## 0.3.1 — 2026-10-07

The band glitches while a reply streams; prompts log once.

- Text arriving for the band marks it as moving, so the chat redraws it from the first word instead of waiting for something else to animate.
- A prompt seen twice in quick succession is logged and counted once.

## 0.3.0 — 2026-10-07

Subagent tracking, prompts in the log, threat fix.

- The threat matrix reads the command itself, not its description.
- Prompts you send appear in the Activity log; agent reports and notifications don't.
- Subagents are numbered: clustered radar contacts, A1 log lines, a working count under the core, and a lane each in the DONE timeline.
- Held stream text reaches the transcript even if the stream breaks.
- DONE rows claim one turn record each; settled entrances are kept capped.

## 0.2.0 — 2026-10-07

Layered architecture, streaming glitch.

- Split the hooks module into lib, theme, domain, motion, raster, runtime and features; `register.tsx` only composes.
- One palette per mode, one tool table, one Pill and SpeakerRow, one dot canvas shared by the radar and the core.
- Replies stream into the band above the prompt and glitch as they settle, then land in the transcript unchanged and in order.
- Every glitch effect runs on the shared 30 fps frame clock.

## 0.1.6 — 2026-10-07

- Replies glitch as they land, without retyping: letters and digits flicker to noise for 0.6 s and the row jitters; markdown symbols stay put.

## 0.1.5 — 2026-10-07

- Replies land as streamed: no decrypt replay over finished text.

## 0.1.4 — 2026-10-07

- The core trace keeps past states as it scrolls; new states enter on the right.

## 0.1.3 — 2026-10-07

- The chat animates at 30 fps; the stream meter redraws per sample.

## 0.1.2 — 2026-10-07

- Radar and core draw at 30 fps while working. Idle they draw at 7.5 fps on a scene clock slowed to 0.4x, and the pane clock redraws once a minute.
- Compass labels are gone.

## 0.1.1 — 2026-10-07

- Tool text and prompts show in full instead of truncating: chat tool rows, MCP arguments, grouped lookups, the YOU row and the Activity log wrap, and the log fills its room by wrapped rows.

## 0.1.0 — 2026-10-06

- First release: the radar HUD mod for Claude Code.
