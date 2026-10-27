#!/usr/bin/env python3
"""mobile-check — check web pages at phone size: hydration, blocked JS, overflow,
tap-target sizes, and that every safe control reacts to a tap. Read-only.

Usage:
  mobile-check [ROUTE …] [--base URL] [--phone] [--label NAME] [--out DIR]
  mobile-check all [--base URL] …     # crawl same-origin links from /
  mobile-check setup                  # npm ci (playwright-core, pinned)
  mobile-check install | uninstall    # bin symlink + ~/.claude/skills/mobile-check
  mobile-check --help

Routes start with "/". No route = "/". Devices: 390×844 (iPhone) and 360×800
(Android), touch on. Skips destructive controls (Delete, Publish, Hide, Save,
Logout …) and lists them for the real-phone check.

--phone uses the URL in ~/.config/mobile-check/phone-url (the same URL the
phone opens), so problems that a 127.0.0.1 run hides (allowedDevOrigins) show up.

Exit codes: 0 all pass, 1 a check failed, 2 usage, 3 setup missing.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path


def log(tag: str, msg: str) -> None:
    print(f"[{tag}] {msg}", flush=True)


def die(msg: str, code: int = 1):
    log("error", msg)
    sys.exit(code)


TOOL_NAME = Path(__file__).resolve().parent.parent.name
TOOL_DIR = Path(__file__).resolve().parent.parent
SYMLINK_TARGET = Path.home() / ".local" / "bin" / TOOL_NAME
SKILL_TARGET = Path.home() / ".claude" / "skills" / TOOL_NAME
PHONE_URL_FILE = Path.home() / ".config" / TOOL_NAME / "phone-url"
NOTES_ROOT = Path(os.environ.get("MOBILE_CHECK_NOTES", Path.home() / "Documents" / "notes")).expanduser()
DEFAULT_BASE = os.environ.get("MOBILE_CHECK_BASE", "http://127.0.0.1:3000")


def _skill_source() -> Path:
    return TOOL_DIR / "skills" / TOOL_NAME


# ---------- the workflow ----------

def _project_name() -> str:
    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
        ).stdout.strip()
        return Path(top).name
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "misc"


def _out_dir(label: str) -> Path:
    d = date.today()
    stamp = f"{d.year}-{d.strftime('%b').lower()}-{d.day:02d}"
    base = NOTES_ROOT / _project_name() / "screenshots" / f"{stamp}-{label}"
    out, n = base, 2
    while out.exists():
        out = base.with_name(f"{base.name}-{n}")
        n += 1
    return out


def _write_report(out: Path, data: dict) -> tuple[Path, int]:
    results = data["results"]
    cfg = data["cfg"]
    failed = [r for r in results if not r["pass"]]
    lines = [
        f"# mobile-check: {cfg['label']}",
        "",
        f"**Base:** {cfg['base']}  ·  **Routes:** {len({r['route'] for r in results})}  ·  "
        f"**Runs:** {len(results)}  ·  **Failed:** {len(failed)}",
        "",
        "| Route | Device | Result | Fails | Warns | Taps ok |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        ok_taps = sum(1 for t in r["taps"] if t["reacted"])
        lines.append(
            f"| `{r['route']}` | {r['device']} | {'✅' if r['pass'] else '❌'} | {len(r['fails'])} | "
            f"{len(r['warns'])} | {ok_taps}/{len(r['taps'])} |"
        )
    for r in results:
        if not (r["fails"] or r["warns"] or r.get("writesBlocked")):
            continue
        lines += ["", f"## `{r['route']}` · {r['device']}"]
        lines += [f"- ❌ {f}" for f in r["fails"]]
        lines += [f"- ⚠ {w}" for w in r["warns"]]
        lines += [f"- 🛡 write blocked by the guard: {w}" for w in r.get("writesBlocked", [])]
    # Real-phone checklist: what the runner did not tap, once per route.
    lines += ["", "## Real-phone checklist (tap these by hand)", ""]
    seen: set[tuple[str, str]] = set()
    for r in results:
        for s in r["skipped"]:
            key = (r["route"], s["label"])
            if key in seen or s["why"] in ("external", "same-page"):
                continue
            seen.add(key)
            lines.append(f"- [ ] `{r['route']}`: \"{s['label']}\" ({s['why']}, not tapped by the runner)")
    lines.append("- [ ] every screen: no sideways scrolling, text readable without zoom, the keyboard doesn't hide the field you type in")
    report = out / "report.md"
    report.write_text("\n".join(lines) + "\n")
    return report, len(failed)


def cmd_run(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog=TOOL_NAME, description="Check pages at phone size (read-only).")
    p.add_argument("routes", nargs="*", help='routes starting with "/", or "all" to crawl from /')
    p.add_argument("--base", default=None, help=f"base URL (default {DEFAULT_BASE})")
    p.add_argument("--phone", action="store_true", help=f"use the phone URL from {PHONE_URL_FILE}")
    p.add_argument("--label", default="check", help="batch name for the output folder (e.g. batch1)")
    p.add_argument("--out", default=None, help="output folder (default $MOBILE_CHECK_NOTES/<project>/screenshots/<date>-<label>)")
    p.add_argument("--max-taps", type=int, default=30, help="controls tapped per route and device")
    p.add_argument("--max-routes", type=int, default=30, help="route limit for `all`")
    args = p.parse_args(argv)

    if not (TOOL_DIR / "node_modules" / "playwright-core").exists():
        die(f"playwright-core missing: run `{TOOL_NAME} setup`", 3)
    if args.phone:
        if not PHONE_URL_FILE.exists():
            die(f"--phone needs the phone URL in {PHONE_URL_FILE} (one line, e.g. https://my-host.example.com:3000)", 2)
        base = PHONE_URL_FILE.read_text().strip()
    else:
        base = args.base or DEFAULT_BASE

    routes = args.routes or ["/"]
    crawl = routes == ["all"]
    if crawl:
        routes = ["/"]
    bad = [r for r in routes if not r.startswith("/")]
    if bad:
        die(f'routes must start with "/": {bad}', 2)

    label = args.label + ("-phone" if args.phone else "")
    out = Path(args.out).expanduser() if args.out else _out_dir(label)
    cfg = {
        "base": base,
        "routes": routes,
        "crawl": crawl,
        "label": label,
        "out": str(out),
        "maxTaps": args.max_taps,
        "maxRoutes": args.max_routes,
        "hydrateTimeout": 15000,
        "settleMs": 700,
    }
    log("info", f"base {base} · {'crawl from /' if crawl else ' '.join(routes)} · out {out}")
    rc = subprocess.run(["node", str(TOOL_DIR / "bin" / "runner.mjs"), json.dumps(cfg)], cwd=TOOL_DIR).returncode
    report_json = out / "report.json"
    if rc != 0 or not report_json.exists():
        die(f"runner exited {rc}")
    report, failed = _write_report(out, json.loads(report_json.read_text()))
    log("ok" if failed == 0 else "error", f"{failed} failed run(s); report: {report}")
    return 0 if failed == 0 else 1


def cmd_setup() -> int:
    if (TOOL_DIR / "node_modules" / "playwright-core").exists():
        log("skip", "playwright-core already installed")
        return 0
    rc = subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=TOOL_DIR).returncode
    if rc != 0:
        die("npm ci failed")
    log("ok", "playwright-core installed (uses the cached chromium in ~/.cache/ms-playwright)")
    return 0


# ---------- install / uninstall ----------

def cmd_install() -> int:
    script_path = Path(__file__).resolve()
    mode = script_path.stat().st_mode
    if not (mode & 0o111):
        script_path.chmod(mode | 0o755)
        log("ok", f"made script executable: {script_path}")
    else:
        log("skip", f"script already executable: {script_path}")
    _install_symlink(SYMLINK_TARGET, script_path, "bin")
    _install_symlink(SKILL_TARGET, _skill_source(), "skill")
    on_path = shutil.which(TOOL_NAME)
    if on_path:
        log("ok", f"{TOOL_NAME} on PATH: {on_path}")
    else:
        log("notice", f'{SYMLINK_TARGET.parent} is not on PATH — add: export PATH="{SYMLINK_TARGET.parent}:$PATH"')
    return 0


def _install_symlink(target: Path, source: Path, what: str) -> None:
    if not source.exists():
        die(f"{what} source not found at {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_symlink():
        current = target.resolve()
        if current == source:
            log("skip", f"{what} symlink already correct: {target} -> {source}")
            return
        log("info", f"replacing existing {what} symlink ({target} -> {current})")
        target.unlink()
    elif target.exists():
        die(f"{target} exists and is not a symlink — refusing to overwrite")
    target.symlink_to(source)
    log("ok", f"{what} symlink created: {target} -> {source}")


def cmd_uninstall() -> int:
    for target, what in ((SYMLINK_TARGET, "bin"), (SKILL_TARGET, "skill")):
        if not target.is_symlink() and not target.exists():
            log("info", f"no {what} symlink at {target} to remove")
            continue
        if not target.is_symlink():
            die(f"{target} exists but is not a symlink — refusing to remove")
        was = target.resolve()
        target.unlink()
        log("ok", f"removed {what} symlink: {target} (was -> {was})")
    log("info", f"to reinstall: python3 {Path(__file__).resolve()} install")
    return 0


# ---------- entry point ----------

def main() -> int:
    argv = sys.argv[1:]
    if argv[:1] == ["install"]:
        return cmd_install()
    if argv[:1] == ["uninstall"]:
        return cmd_uninstall()
    if argv[:1] == ["setup"]:
        return cmd_setup()
    if argv[:1] == ["run"]:
        argv = argv[1:]
    return cmd_run(argv)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("error", "interrupted")
        sys.exit(130)
