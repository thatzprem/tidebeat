#!/usr/bin/env node
'use strict';
// Tidebeat Race verification harness.
// Launches headless Chromium (SwiftShader GL), loads index.html from a
// file:// URL and drives the game through window.__test. Prints PASS/FAIL
// for each of nine checks and exits non-zero if any fail.

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const INDEX = path.resolve(__dirname, 'index.html');
const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
];
const GLOBAL_TIMEOUT_MS = 120000;

const results = [];
function report(n, desc, ok, detail) {
  results.push(ok);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + ': ' + desc + (detail ? ' (' + detail + ')' : ''));
}

// Runs inside the page. A simple sailing bot. With opts.layline it heads straight
// for the next gate when it can lay it (>= 48 degrees off the wind), otherwise it
// sails a close-hauled tack toward that gate's layline, tacks onto it and follows
// it in. It trims to the optimal sail angle and rows perfect strokes every 0.5s.
// Without opts.layline it just rows straight ahead. Returns when the race ends or
// maxSeconds of sim time pass.
function runBot(opts) {
  const T = window.__test, S = T._sim, I = T._input, G = T._gates;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const TACK = 0.84;
  let t = 0, nextStroke = 0;
  while (S.state === 'RACING' && t < opts.maxSeconds) {
    const b = S.boat;
    if (opts.layline) {
      const g = G.find((q) => !q.passed) || { x: 0, z: 1200 };
      const src = S.wind.dir + Math.PI;
      const bearing = Math.atan2(g.x - b.x, g.z - b.z);
      let desired;
      if (Math.abs(wrap(bearing - src)) >= TACK) desired = bearing;
      else {
        const cross = (s) => { const h = src + s * TACK; return (b.x - g.x) * Math.cos(h) - (b.z - g.z) * Math.sin(h); };
        let s = cross(-1) < 0 ? 1 : -1;                  // tack that closes on the other tack's layline
        if (Math.abs(cross(-s)) < 3) s = -s;             // on that layline: follow it in
        desired = src + s * TACK;
      }
      const d = wrap(desired - b.heading);
      I.left = d > 0.02; I.right = d < -0.02;
      const want = T.optimalSail(wrap(S.wind.dir - b.heading));
      I.up = S.sailAngle < want - 0.02; I.down = S.sailAngle > want + 0.02;
    }
    if (t >= nextStroke) { T.stroke('perfect'); nextStroke += 0.5; }
    T.tick(0.05); t += 0.05;
  }
  I.left = I.right = I.up = I.down = false;
  return { distance: T.distance, simSeconds: t };
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const killer = setTimeout(() => {
    console.error('FAIL: global timeout after ' + GLOBAL_TIMEOUT_MS + 'ms');
    browser.close().finally(() => process.exit(1));
  }, GLOBAL_TIMEOUT_MS);

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

    await page.goto(pathToFileURL(INDEX).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__test && window.__test.ready === true, null, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1. Clean load.
    const errCount = consoleErrors.length + pageErrors.length;
    report(1, 'Page loads with zero console errors and zero uncaught exceptions', errCount === 0,
      errCount ? [...consoleErrors, ...pageErrors].slice(0, 3).join(' | ') : undefined);

    // 2. Initial state.
    const s0 = await page.evaluate(() => window.__test.state);
    report(2, '__test.state equals "MENU" on load', s0 === 'MENU', 'state=' + s0);

    // 3. startRace() -> COUNTDOWN -> RACING via tick().
    const s3 = await page.evaluate(() => {
      const t = window.__test;
      t.startRace();
      const afterStart = t.state;
      t.tick(1.0);
      const mid = t.state;
      t.tick(2.5);
      return { afterStart, mid, end: t.state };
    });
    report(3, 'startRace() moves state through COUNTDOWN to RACING',
      s3.afterStart === 'COUNTDOWN' && s3.mid === 'COUNTDOWN' && s3.end === 'RACING',
      JSON.stringify(s3));

    // 4. The wind blows up the course, so a layline-sailing, trimming, rowing bot must finish.
    const t4 = Date.now();
    const r4 = await page.evaluate(`(${runBot})({ layline: true, maxSeconds: 400 })`);
    const wall4 = Date.now() - t4;
    report(4, 'sailing the laylines + trimming + perfect strokes via tick() makes distance exceed 1200', r4.distance > 1200,
      'distance=' + r4.distance.toFixed(1) + ', sim=' + r4.simSeconds.toFixed(1) + 's, wall=' + wall4 + 'ms');

    // 5. Finished with sane results.
    const r5 = await page.evaluate(() => ({ state: window.__test.state, results: window.__test.results }));
    const res = r5.results;
    const ok5 = r5.state === 'FINISHED' && res && typeof res.time === 'number' && Number.isFinite(res.time) && [1, 2, 3].includes(res.stars);
    report(5, 'state is FINISHED, results.time is a number, results.stars is 1, 2 or 3', ok5,
      'state=' + r5.state + ', results=' + JSON.stringify(res));

    // 6. Rendering performance: 300 animation frames, average under 150ms, no errors.
    const errBefore = consoleErrors.length + pageErrors.length;
    const avg = await page.evaluate(() => new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      function step() { if (++n >= 300) resolve((performance.now() - t0) / 300); else requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }));
    const errDuring = consoleErrors.length + pageErrors.length - errBefore;
    report(6, '300 frames render with no errors and average frame time under 150ms', avg < 150 && errDuring === 0,
      'avg=' + avg.toFixed(1) + 'ms, errors=' + errDuring);

    // 7. reset() returns to a clean MENU.
    const r7 = await page.evaluate(() => {
      window.__test.reset();
      return { state: window.__test.state, distance: window.__test.distance, results: window.__test.results };
    });
    report(7, 'reset() returns state to MENU with distance 0 and results null',
      r7.state === 'MENU' && r7.distance === 0 && r7.results === null, JSON.stringify(r7));

    // 8. Wind matters: rowing straight into the wind for as long as the sailing
    // run took must not finish the course.
    const r8 = await page.evaluate(`(() => {
      const T = window.__test;
      T.startRace(); T.tick(3.5);
      return (${runBot})({ layline: false, maxSeconds: ${r4.simSeconds + 5} });
    })()`);
    report(8, 'rowing straight for as long as the sailing run took does not finish', r8.distance < 1200,
      'distance=' + r8.distance.toFixed(1) + ' after ' + r8.simSeconds.toFixed(1) + 's');

    // 9. The zig-zag course is winnable: the layline bot clears every gate with no penalties.
    const ok9 = res && res.penalties === 0 && res.gates === 7;
    report(9, 'layline bot clears all 7 gates with 0 penalties', ok9, 'gates=' + (res && res.gates) + ', penalties=' + (res && res.penalties));
  } catch (e) {
    console.error('FAIL: harness error: ' + (e && e.stack ? e.stack : e));
    results.push(false);
  } finally {
    clearTimeout(killer);
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(failed === 0 ? 'ALL 9 CHECKS PASSED' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 && results.length === 9 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
