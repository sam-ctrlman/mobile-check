# mobile-check

<!-- created by /memlayout 2026-10-30 · board prefix TOOL-MOBC · workspace tools -->

## Goal
Checks web pages at phone size with touch (Playwright), read-only: dead buttons, blocked resources, overflow, small tap targets.

## Users
A developer who runs Claude Code on their own machine and wants this step done the same way every time.

## Scope
- In: the commands in `README.md`, `mobile-check install` / `uninstall` (symlinks onto PATH and into `~/.claude`).
- Out (non-goals): anything that needs a server or a network service of its own.

## Depends on / used by
Other tools in the workspace only through their CLI. See `~/tools/docs/PROJECTS.md`.
