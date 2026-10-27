---
name: mobile-check
description: Check a web app at PHONE size with touch (390×844 iPhone + 360×800 Android), using Playwright. It finds pages whose client JS never ran (dead buttons), blocked /_next resources, horizontal overflow and too-small tap targets, and it taps every safe control to prove it reacts. It saves screenshots, report.md and a real-phone checklist. Use when the user types /mobile-check [routes…] [--phone], or says "mobile check", "test on mobile", "check the phone layout", "buttons don't work on my phone". Also REQUIRED at the end of every UI batch (dashboard, site) before a worklog may say "Tested ✔". Read-only: a network guard aborts every non-GET request, so no tap can write.
---

# /mobile-check

The tool is `~/scripts/mobile-check/` (a forge tool). Run it with the Bash tool, from the project's repo directory, so the notes folder is named after the right project:

```
mobile-check [ROUTE …] [--base URL] [--phone] [--label NAME] [--max-taps N]
mobile-check all [--phone] [--label NAME]     # crawl same-origin links from /
```

- Default base: `http://127.0.0.1:3200` (dashboard). For the site, use `--base http://127.0.0.1:3000`.
- `--phone` reads the base URL from `~/.config/mobile-check/phone-url`, the same URL the user's phone opens.
  - Always run once with `--phone` as well. A 127.0.0.1 run hides problems that only the phone's host triggers (Next dev `allowedDevOrigins`).
  - If the file is missing, ask the user for the URL. Writing that file is outside the project, so it needs no gate.
- `--label`: the batch name (`M0`, `D4` …). Output goes to `~/Documents/ws01/<project>/screenshots/<YYYY-mon-DD>-<label>[-phone]/`.
- `setup` / `install` / `uninstall` maintain the tool itself.
- Exit codes: 0 all pass, 1 a check failed, 2 usage, 3 `mobile-check setup` needed.

## Which routes

- `/mobile-check` with routes: check exactly those.
- At the end of a UI batch:
  - Choose the routes from the batch's diff (changed `src/app/**/page.tsx`, and the routes that render the changed components).
  - Fill in dynamic segments with real slugs from the dev DB.
  - Always include `/`, because the shell and menu appear on every page.
- `all` crawls GET links only: use it for an audit (M0) or when the shell changed.

## What it checks (per route × device)

| Check | Fails when |
|---|---|
| Hydration | React never attached to the DOM within 15 s, so client JS didn't run and taps do nothing |
| JS errors | `pageerror` or `console.error` |
| `/_next/*` | a dev or chunk resource is blocked or fails (≥ 400) |
| Overflow | the page scrolls sideways; an opened sheet or dialog sticks out of the screen |
| Tap targets | a target is smaller than 24 px (fail); smaller than 44 px is a warning |
| Taps | a safe control shows no reaction: no navigation, no dialog or sheet, no `aria-expanded` change, no DOM change |

**Read-only by a network guard.** Every request that isn't GET, HEAD or OPTIONS is aborted inside the browser before it leaves, and Next server actions are POSTs. A control that tries to write shows up as `write blocked (POST …)` (🛡 in the report) and goes on the real-phone checklist. Before 2026-10-27 the runner relied on labels alone, and it reordered FAQ posts in the dev DB through the ↑/↓ arrows. Labels are not a safety net.

Also skipped: links to the same page, links that open a new tab, and editor toolbar buttons (they need a selection or a caret the runner doesn't set up). A toolbar button that is cut off at the screen edge still **fails** (`off-screen`).

Destructive controls are never tapped: Delete, Publish, Hide, Save, Logout, submit buttons and `/cdn-cgi/` links, matched in TH, DE and EN. They are only measured, and then listed in the **real-phone checklist** in `report.md`.

## After the run

1. Show the user the results table from `report.md`: ❌ fails first, then ⚠ warns, with the screenshot folder path.
2. Read one or two screenshots (Read tool), at least the one for `/`, and say what you see. Don't rely only on the numbers.
3. For each fail, name the likely cause and the file. Fixing it is a new batch: risk brief, then `proceed`.
4. Give the user the **real-phone checklist**. The batch counts as "Tested ✔" only when both the runner passes and the user confirms the checklist on a real phone.
5. Anything not tested goes into the worklog's "Not tested" list and the next HANDOFF's open list. Never drop it.

## Limits (say so when they matter)

- Chromium with mobile emulation is not real iOS Safari: safe areas, the on-screen keyboard and rubber-band scrolling only show up on the real phone.
- "Reacted" only means the DOM changed, not that the result is right. The screenshots and the user's phone check cover that.
- Tapping is capped by `--max-taps` (default 30) per route and device. The report says when the cap was hit.
