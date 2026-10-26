# mobile-check

Check web pages at phone size with touch (Playwright, read-only).
It finds dead pages (client JS never ran), blocked `/_next` resources, sideways scrolling and small tap targets, and it taps every safe control to prove it reacts.

## Install

```sh
git clone <remote-url> ~/scripts/mobile-check
sudo pacman -S --needed nss alsa-lib at-spi2-core libcups libxkbcommon mesa libxcomposite libxdamage libxrandr cairo pango   # libs the cached Chromium needs (Arch)
python3 ~/scripts/mobile-check/bin/mobile-check.py setup     # npm ci: playwright-core 1.60.0 (pinned to the cached chromium-1223)
python3 ~/scripts/mobile-check/bin/mobile-check.py install   # ~/.local/bin/mobile-check + ~/.claude/skills/mobile-check
```

After install, `mobile-check` works in any shell, and the `/mobile-check` skill works in Claude Code.

## Actions

| Action | What it does |
|--------|-------------|
| `mobile-check [ROUTE …]` | Check the routes (default `/`) on 390×844 and 360×800; write screenshots, `report.json` and `report.md` |
| `mobile-check all` | Crawl same-origin GET links from `/` (max `--max-routes`), then check each route |
| `--base URL` | Default `http://127.0.0.1:3200` |
| `--phone` | Base URL from `~/.config/mobile-check/phone-url` (the URL the phone opens) |
| `--label NAME` | Output `~/Documents/ws01/<project>/screenshots/<YYYY-mon-DD>-<label>/` |
| `mobile-check setup` | `npm ci` |
| `mobile-check install` / `uninstall` | Manage the bin + skill symlinks |

Exit codes: 0 all pass, 1 a check failed, 2 usage, 3 setup missing.

## Layout

```
~/scripts/mobile-check/
├── bin/mobile-check.py     # CLI, report.md, install
├── bin/runner.mjs          # Playwright runner (writes report.json)
├── skills/mobile-check/SKILL.md
└── package.json            # playwright-core 1.60.0, pinned
```
