# mobile-check

**Read-only Playwright mobile QA CLI and Claude Code skill to test web apps at iPhone (`390×844`) and Android (`360×800`) viewports with touch emulation, React hydration checks, WCAG tap-target sizing, overflow detection, and interactive tap verification.**

Desktop browser checks often miss mobile-specific failures: unhydrated React trees where buttons do nothing on tap, blocked `/_next/*` chunks when testing over a phone-reachable dev URL (`allowedDevOrigins`), horizontal page/dialog overflow, and tiny tap targets. `mobile-check` opens your routes in headless Chromium with touch emulation across both iPhone and Android profiles, taps every safe interactive control to prove the UI reacts, blocks all non-`GET` network writes at the browser layer, and generates full-page screenshots, `report.json`, and a Markdown `report.md` with a real-phone checklist.

---

## Why Use `mobile-check`?

- **Hard Read-Only Network Guard:** Every request other than `GET`, `HEAD`, or `OPTIONS` is aborted inside the browser context before leaving the client. Even if a button triggers a `POST` or a Next.js Server Action, it cannot mutate your database (`🛡 write blocked` is logged in the report).
- **Dual Phone Profiles (`iphone-390` + `android-360`):** Tests every route at `390×844` (3× scale, iOS Safari UA) and `360×800` (3× scale, Pixel 8 Chrome Mobile UA) with `isMobile: true` and `hasTouch: true`.
- **React Hydration Verification:** Detects dead pages where server HTML rendered but React never attached `__reactFiber` / `__reactProps` within 15 seconds.
- **Automated Tap-Reaction Probing:** Taps up to `--max-taps` safe controls per route (`<a href>`, `<button>`, `[role="button"]`, `[role="tab"]`, `[role="menuitem"]`, `<summary>`, `<select>`, checkboxes/radios) and verifies that each tap causes navigation, opens a dialog/sheet, toggles `aria-expanded`, or updates the DOM.
- **WCAG 2.5.8 & Apple HIG Tap-Target Auditing:** Fails controls smaller than `24×24 px` (WCAG 2.5.8 minimum) and warns on controls smaller than `44×44 px` (Apple HIG / Material comfort target) or cut off at the viewport edge.
- **Real-Phone Handoff Checklist:** Automatically lists skipped destructive controls (Delete, Publish, Save, Logout, Submit in EN/DE/TH) and write-blocked actions as a Markdown checklist for final human verification on a physical phone.

---

## What It Checks (Per Route × Device)

| Check Category | Fails (`❌`) or Warns (`⚠`) When |
| :--- | :--- |
| **HTTP & Hydration** | ❌ HTTP status `≥ 400`, or React fails to attach to DOM nodes within `15s` (client JS never ran). |
| **Console & Runtime Errors** | ❌ Uncaught `pageerror` or `console.error` (excluding expected aborts from the read-only write guard). |
| **`/_next/*` Assets** | ❌ Any `/_next/*` chunk or resource request fails or returns HTTP `≥ 400` (excluding HMR endpoints). |
| **Horizontal Overflow** | ❌ Document scrolls sideways (`scrollWidth > innerWidth + 1`), an interactive control sits off-screen outside a horizontal scroller, or an opened `[role="dialog"]` overflows the viewport width. |
| **Tap-Target Size** | ❌ Control bounding box `< 24px` wide or tall (WCAG 2.5.8).<br>⚠ Control bounding box `< 44px` wide or tall (Apple HIG / Material). |
| **Interactive Tap Reaction** | ❌ Tapping a safe control produces no URL change, no dialog/sheet change, no `aria-expanded` toggle, and no DOM size change. |

---

## Example `report.md` Output

```markdown
# mobile-check: batch1-phone

**Base:** https://my-dev-host.example.com:3000  ·  **Routes:** 2  ·  **Runs:** 4  ·  **Failed:** 1

| Route | Device | Result | Fails | Warns | Taps ok |
|---|---|---|---|---|---|
| `/` | iphone-390 | ✅ | 0 | 1 | 8/8 |
| `/` | android-360 | ✅ | 0 | 1 | 8/8 |
| `/settings` | iphone-390 | ❌ | 1 | 0 | 4/5 |
| `/settings` | android-360 | ✅ | 0 | 0 | 5/5 |

## `/settings` · iphone-390
- ❌ horizontal overflow 18px (page scrolls sideways)
- 🛡 write blocked by the guard: POST /settings

## Real-phone checklist (tap these by hand)

- [ ] `/settings`: "Save changes" (destructive, not tapped by the runner)
- [ ] `/settings`: "Delete account" (destructive, not tapped by the runner)
- [ ] every screen: no sideways scrolling, text readable without zoom, the keyboard doesn't hide the field you type in
```

---

## Installation

```sh
git clone <remote-url> ~/tools/projects/mobile-check

# Optional on Arch Linux: system libraries required by headless Chromium
sudo pacman -S --needed nss alsa-lib at-spi2-core libcups libxkbcommon mesa libxcomposite libxdamage libxrandr cairo pango

# Install pinned playwright-core (1.60.0) and create CLI + Claude Code skill symlinks
python3 ~/tools/projects/mobile-check/bin/mobile-check.py setup
python3 ~/tools/projects/mobile-check/bin/mobile-check.py install
```

Once installed:
1. Run `mobile-check` from **any terminal shell** (inside your web project's git repository so reports are grouped by repo name).
2. Run `/mobile-check` directly **inside Claude Code**.

To remove the symlinks:
```sh
mobile-check uninstall
```

---

## Commands & Options

| Command / Option | Default | Description |
| :--- | :--- | :--- |
| `mobile-check [ROUTE …]` | `/` | Check one or more routes starting with `/` (e.g., `mobile-check / /pricing /login`). |
| `mobile-check all` | — | Crawl same-origin `GET` links starting from `/` (up to `--max-routes`), then test each discovered route. |
| `--base <URL>` | `$MOBILE_CHECK_BASE` or `http://127.0.0.1:3000` | Base URL of the running web server. |
| `--phone` | `false` | Read the base URL from `~/.config/mobile-check/phone-url` (the exact host/origin your physical phone opens, exposing CORS / `allowedDevOrigins` issues hidden on `127.0.0.1`). |
| `--label <NAME>` | `check` | Batch name used in the output folder (`<date>-<label>[-phone]`). |
| `--out <DIR>` | `$MOBILE_CHECK_NOTES/<project>/screenshots/<date>-<label>` | Custom output directory for `report.md`, `report.json`, and `.png` screenshots. |
| `--max-taps <N>` | `30` | Maximum number of safe controls tapped per route and device. |
| `--max-routes <N>` | `30` | Maximum number of routes crawled when running `mobile-check all`. |
| `mobile-check setup` | — | Run `npm ci` inside the tool directory (`playwright-core` 1.60.0). |
| `mobile-check install` / `uninstall` | — | Create or remove `~/.local/bin/mobile-check` and `~/.claude/skills/mobile-check` symlinks. |

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MOBILE_CHECK_BASE` | `http://127.0.0.1:3000` | Default base URL when `--base` and `--phone` are not passed. |
| `MOBILE_CHECK_NOTES` | `~/Documents/notes` | Root folder where `<project>/screenshots/<date>-<label>/` reports are written. |

---

## Exit Codes & Project Layout

### Exit Codes
- `0` — All route × device runs passed with zero failures (`warns` are permitted).
- `1` — One or more route × device runs failed a check, or runner error.
- `2` — Invalid CLI arguments (e.g., route missing leading `/` or missing `~/.config/mobile-check/phone-url` with `--phone`).
- `3` — `playwright-core` not installed (`run mobile-check setup`).
- `130` — Interrupted by user (`Ctrl-C`).

### Directory Structure
```text
~/tools/projects/mobile-check/
├── LICENSE
├── README.md
├── package.json                  # playwright-core 1.60.0 (pinned)
├── package-lock.json
├── bin/
│   ├── mobile-check.py           # CLI entry point & Markdown report generator
│   └── runner.mjs                # Headless Chromium Playwright runner & write guard
├── docs/
│   ├── PROJECT.md
│   └── STATUS.md
└── skills/mobile-check/SKILL.md  # Claude Code /mobile-check skill definition
```

---

## Frequently Asked Questions (FAQ)

**Can `mobile-check` accidentally delete data or submit forms while tapping buttons?**  
No. `runner.mjs` installs a browser-level Playwright route interceptor (`guardWrites`) that aborts every HTTP request whose method is not `GET`, `HEAD`, or `OPTIONS` before it leaves the browser. In addition, buttons with destructive labels (`Delete`, `Publish`, `Save`, `Logout`, `type="submit"`, etc.) are skipped and placed on the manual real-phone checklist.

**Why should I run `mobile-check --phone` in addition to `127.0.0.1:3000`?**  
Testing against `http://127.0.0.1:3000` can hide origin-specific failures (such as Next.js `allowedDevOrigins` blocking `/_next/*` chunks when accessed via a LAN or dev hostname). Storing your phone-reachable URL in `~/.config/mobile-check/phone-url` and passing `--phone` catches those issues automatically.

**Does `mobile-check` replace testing on a real iOS/Android phone?**  
It catches ~90% of layout, hydration, tap-target, and dead-button regressions automatically before you pick up your phone, and outputs a tailored **Real-phone checklist** for things headless Chromium emulation cannot verify (iOS Safari rubber-band scrolling, soft-keyboard field occlusion, and destructive flows).
