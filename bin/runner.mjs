// mobile-check runner: opens routes at phone size with touch, checks them, taps the
// safe controls, writes screenshots + report.json. Read-only: never submits a form.
// Called by bin/mobile-check.py with one JSON argument (see buildConfig there).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cfg = JSON.parse(process.argv[2]);

const DEVICES = [
  {
    name: "iphone-390",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  {
    name: "android-360",
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  },
];

// Controls the runner never taps (TH | DE | EN labels). They are only measured
// and listed for the user's real-phone check.
const DESTRUCTIVE =
  /delete|remove|publish|unpublish|hide|logout|log out|sign out|save|submit|ลบ|เผยแพร่|ซ่อน|ออกจากระบบ|บันทึก|löschen|entfernen|veröffentlich|ausblenden|abmelden|speichern/i;

const TAPPABLE = 'a[href], button, [role="button"], [role="tab"], [role="menuitem"], summary, select, input[type="checkbox"], input[type="radio"]';
const TAP_SCOPE = "header, main, nav, [role=dialog]";
const MIN_FAIL = 24; // WCAG 2.5.8 minimum
const MIN_WARN = 44; // Apple HIG / Material comfortable target

const slug = (s) => s.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";

async function waitHydrated(page) {
  // React attaches __reactFiber$… / __reactProps$… keys to DOM nodes on hydration.
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector("button, a[href], body > *");
        return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"));
      },
      null,
      { timeout: cfg.hydrateTimeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function open(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  const hydrated = await waitHydrated(page);
  return { status: res ? res.status() : 0, hydrated };
}

// Visible, enabled controls in the tap scope, in document order.
async function controls(page) {
  return page.evaluate(
    ({ TAPPABLE, TAP_SCOPE }) => {
      const seen = new Set();
      const out = [];
      for (const scope of document.querySelectorAll(TAP_SCOPE)) {
        for (const el of scope.querySelectorAll(TAPPABLE)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
          const label = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("href") || el.tagName)
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 60);
          out.push({
            label,
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type") || "",
            href: el.getAttribute("href") || "",
            disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
      return out;
    },
    { TAPPABLE, TAP_SCOPE }
  );
}

// The n-th control from controls(), as a handle (same walk, same order).
async function nthControl(page, n) {
  const handle = await page.evaluateHandle(
    ({ TAPPABLE, TAP_SCOPE, n }) => {
      const seen = new Set();
      let i = 0;
      for (const scope of document.querySelectorAll(TAP_SCOPE)) {
        for (const el of scope.querySelectorAll(TAPPABLE)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
          if (i++ === n) return el;
        }
      }
      return null;
    },
    { TAPPABLE, TAP_SCOPE, n }
  );
  return handle.asElement();
}

const snapshot = (page) =>
  page.evaluate(() => ({
    url: location.href,
    dialogs: document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]').length,
    expanded: [...document.querySelectorAll("[aria-expanded]")].map((e) => e.getAttribute("aria-expanded")).join(","),
    size: document.body.innerHTML.length,
  }));

function isSkipped(c, base) {
  if (c.disabled) return "disabled";
  if (c.type === "submit") return "submit";
  if (DESTRUCTIVE.test(c.label)) return "destructive";
  if (c.href && /^(https?:)?\/\//.test(c.href) && !c.href.startsWith(base)) return "external";
  if (c.href.startsWith("/cdn-cgi/")) return "destructive";
  if (c.href.startsWith("mailto:") || c.href.startsWith("tel:")) return "external";
  return null;
}

async function checkRoute(browser, device, route) {
  const url = new URL(route, cfg.base).href;
  const ctx = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    userAgent: device.userAgent,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  const blocked = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().split("\n")[0].slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/_next/") && !r.url().includes("/_next/webpack-hmr") && !r.url().includes("/_next/hmr"))
      blocked.push(`${r.failure()?.errorText ?? "failed"} ${new URL(r.url()).pathname}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/_next/") && r.status() >= 400) blocked.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });

  const result = { route, device: device.name, url, fails: [], warns: [], taps: [], skipped: [], screenshots: [] };
  const { status, hydrated } = await open(page, url);
  result.status = status;
  if (status >= 400) result.fails.push(`HTTP ${status}`);
  if (!hydrated) result.fails.push(`not hydrated after ${cfg.hydrateTimeout} ms: client JS did not run, taps will do nothing`);

  const shot = join(cfg.out, `${slug(route)}--${device.name}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  result.screenshots.push(shot);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) result.fails.push(`horizontal overflow ${overflow}px (page scrolls sideways)`);

  const list = await controls(page);
  for (const c of list) {
    const small = Math.min(c.w, c.h);
    if (small < MIN_FAIL) result.fails.push(`tap target ${c.w}×${c.h} < ${MIN_FAIL}px: "${c.label}"`);
    else if (small < MIN_WARN) result.warns.push(`tap target ${c.w}×${c.h} < ${MIN_WARN}px: "${c.label}"`);
  }

  // Tap every safe control and check that something reacted.
  const limit = Math.min(list.length, cfg.maxTaps);
  const baseOrigin = new URL(cfg.base).origin;
  for (let i = 0; i < limit; i++) {
    const c = list[i];
    const why = isSkipped(c, baseOrigin);
    if (why) {
      result.skipped.push({ label: c.label, why });
      continue;
    }
    if (!hydrated) {
      result.taps.push({ label: c.label, reacted: false, note: "page not hydrated" });
      continue;
    }
    const el = await nthControl(page, i);
    if (!el) {
      result.taps.push({ label: c.label, reacted: null, note: "control gone after previous tap" });
      continue;
    }
    const before = await snapshot(page);
    try {
      await el.tap({ timeout: 3000 });
    } catch (e) {
      result.taps.push({ label: c.label, reacted: false, note: `tap failed: ${e.message.split("\n")[0]}` });
      result.fails.push(`tap failed: "${c.label}"`);
      continue;
    }
    await page.waitForTimeout(cfg.settleMs);
    const after = await snapshot(page);
    const how =
      after.url !== before.url ? `navigated → ${new URL(after.url).pathname}${new URL(after.url).search}`
      : after.dialogs !== before.dialogs ? "opened a dialog/sheet"
      : after.expanded !== before.expanded ? "toggled aria-expanded"
      : after.size !== before.size ? "changed the page"
      : null;
    result.taps.push({ label: c.label, reacted: !!how, note: how ?? "no visible reaction" });
    if (!how) result.fails.push(`no reaction to tap: "${c.label}"`);
    if (how === "opened a dialog/sheet") {
      const s = join(cfg.out, `${slug(route)}--${device.name}--tap${i}.png`);
      await page.screenshot({ path: s });
      result.screenshots.push(s);
      const dlgOverflow = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return 0;
        const r = d.getBoundingClientRect();
        return Math.max(0, Math.round(r.right - window.innerWidth), Math.round(-r.left));
      });
      if (dlgOverflow > 1) result.fails.push(`dialog from "${c.label}" sticks out ${dlgOverflow}px`);
    }
    // Restore the start state for the next control.
    if (after.url !== url) await open(page, url);
    else if (after.dialogs > before.dialogs || after.expanded !== before.expanded) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      if ((await snapshot(page)).dialogs > before.dialogs) await open(page, url);
    }
  }
  if (list.length > limit) result.warns.push(`only the first ${limit} of ${list.length} controls were tapped (--max-taps)`);

  result.errors = [...new Set(errors)];
  result.blocked = [...new Set(blocked)];
  if (result.errors.length) result.fails.push(...result.errors.map((e) => `JS ${e}`));
  if (result.blocked.length) result.fails.push(...result.blocked.map((b) => `/_next resource blocked or failed: ${b}`));
  result.pass = result.fails.length === 0;
  await ctx.close();
  return result;
}

// `all`: crawl same-origin links (GET only) breadth-first from the start routes.
async function crawl(browser, starts) {
  const ctx = await browser.newContext({ viewport: DEVICES[0].viewport, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const origin = new URL(cfg.base).origin;
  const seen = new Set();
  const queue = [...starts];
  while (queue.length && seen.size < cfg.maxRoutes) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);
    try {
      await page.goto(new URL(route, cfg.base).href, { waitUntil: "load", timeout: 30000 });
    } catch {
      continue;
    }
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    for (const h of hrefs) {
      const u = new URL(h);
      if (u.origin !== origin || u.pathname.startsWith("/cdn-cgi/") || u.pathname.startsWith("/api/")) continue;
      const r = u.pathname + u.search;
      if (!seen.has(r) && !queue.includes(r)) queue.push(r);
    }
  }
  await ctx.close();
  return [...seen];
}

// channel "chromium" = full Chromium in new headless mode, so the cached chromium-1223
// is enough (no separate headless-shell download).
const browser = await chromium.launch({ headless: true, channel: "chromium" });
mkdirSync(cfg.out, { recursive: true });
const routes = cfg.crawl ? await crawl(browser, cfg.routes) : cfg.routes;
const results = [];
for (const route of routes) {
  for (const device of DEVICES) {
    try {
      const r = await checkRoute(browser, device, route);
      results.push(r);
      process.stderr.write(`[${r.pass ? "ok" : "FAIL"}] ${device.name} ${route}  (${r.fails.length} fail, ${r.warns.length} warn)\n`);
    } catch (e) {
      results.push({ route, device: device.name, pass: false, fails: [`runner error: ${e.message.split("\n")[0]}`], warns: [], taps: [], skipped: [], screenshots: [] });
      process.stderr.write(`[FAIL] ${device.name} ${route}  runner error: ${e.message.split("\n")[0]}\n`);
    }
  }
}
await browser.close();
writeFileSync(join(cfg.out, "report.json"), JSON.stringify({ cfg, results }, null, 2));
