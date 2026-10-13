# Sonar Dock

A Claude Code mod; see README.md for usage and the architecture rules.

## Checks

Before a commit: `claude plugin validate .`, `claude plugin test .`, and a type-check with `tsc -p .`.

## Releasing

Every change that ships is a release, made in one commit:

1. Bump `version` in `.claude-plugin/plugin.json`: patch for fixes and small touches, minor for a new feature.
2. Add a section at the top of `CHANGELOG.md`: `## <version> — <YYYY-MM-DD>`, a one-line headline, then bullets saying what changed, from the user's side.
3. Commit as `Sonar Dock <version>: <headline>`, the same bullets in the body, ending with `Bump version to <version>.`

Never ship a version bump without its `CHANGELOG.md` entry.
