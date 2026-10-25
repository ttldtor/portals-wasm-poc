// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

async function openMoto(page, sensor = true) {
  await page.route('https://telegram.org/js/**', route => route.fulfill({ contentType: 'application/javascript',
    body: sensor ? `
      const events = new Map();
      window.motoProbe = { starts: 0, stops: 0, beta: 0, gamma: 0, angle: 0,
        emit(name) { for (const fn of [...(events.get(name) || [])]) fn(); },
        sample() { Object.assign(Telegram.WebApp.DeviceOrientation, { beta: this.beta, gamma: this.gamma }); this.emit('deviceOrientationChanged'); },
        run() { this.timer = setInterval(() => this.sample(), 50); },
        stopSamples() { clearInterval(this.timer); }
      };
      Object.defineProperty(screen.orientation, 'angle', { get: () => motoProbe.angle });
      window.Telegram = { WebApp: { platform: 'android', isActive: true, viewportStableHeight: 760,
        isVersionAtLeast: () => true, ready() {}, expand() {},
        onEvent(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
        offEvent(name, fn) { events.get(name)?.delete(fn); },
        DeviceOrientation: {
          start(params, callback) { motoProbe.starts++; callback?.(true); motoProbe.emit('deviceOrientationStarted'); },
          stop(callback) { motoProbe.stops++; callback?.(true); }
        }
      } };
    ` : '' }));
  await page.goto('./');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
  await page.getByRole('button', { name: 'Moto', exact: true }).click();
  await expect(page.locator('#moto-panel')).toBeVisible();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'ready');
  if (sensor) await page.evaluate(() => motoProbe.run());
}

async function race(page) {
  await page.locator('#moto-center').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 10000 });
}

test('Moto joins the existing chooser and cannot race on missing sensor data', async ({ page }) => {
  await openMoto(page, false);
  await expect(page.locator('.xterm-helper-textarea')).toHaveAttribute('readonly', '');
  await page.locator('#moto-seed').fill('4294967296');
  await page.locator('#moto-center').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'ready');
  await page.locator('#moto-seed').fill('42');
  await page.locator('#moto-center').click();
  await expect(page.locator('#moto-panel')).not.toHaveAttribute('data-state', 'racing');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expect(page.locator('#moto-panel')).toBeHidden();
  await expect(page.locator('.xterm-rows')).toContainText('Portals gallery');
  await expect(page.locator('.xterm-helper-textarea')).not.toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Level', exact: true }).click();
  await expect(page.locator('.xterm-rows')).toContainText('Phone level');
});

test('release calibration, real two-finger holds, pause and stale samples use real WASM', async ({ page }, testInfo) => {
  await openMoto(page);
  await page.locator('#moto-seed').fill('123456');
  const center = await page.locator('#moto-center').boundingBox();
  await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
  await page.mouse.down();
  await page.evaluate(() => { motoProbe.beta = .4; motoProbe.gamma = .3; });
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'held');
  await page.waitForTimeout(400);
  await page.evaluate(() => { motoProbe.beta = .1; motoProbe.gamma = -.1; });
  await page.mouse.up();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 10000 });
  const gas = await page.locator('#moto-gas').boundingBox();
  const brake = await page.locator('#moto-brake').boundingBox();
  const a = { id: 1, x: gas.x + gas.width / 2, y: gas.y + gas.height / 2 };
  const b = { id: 2, x: brake.x + brake.width / 2, y: brake.y + brake.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await expect(page.locator('#moto-gas')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#moto-brake')).toHaveAttribute('aria-pressed', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [b] });
  await expect(page.locator('#moto-gas')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#moto-brake')).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(350);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('#moto-gas')).toHaveAttribute('aria-pressed', 'false');
  await cdp.detach();
  await page.locator('#moto-center').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('#moto-center')).toBeEnabled();
  const resume = await page.locator('#moto-center').boundingBox();
  await page.mouse.move(resume.x + resume.width / 2, resume.y + resume.height / 2);
  await page.mouse.down();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'countdown');
  await page.waitForTimeout(200);
  await expect(page.locator('#moto-center')).toBeEnabled();
  await page.mouse.up();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 6000 });
  const heldGas = await page.locator('#moto-gas').boundingBox();
  await page.mouse.move(heldGas.x + heldGas.width / 2, heldGas.y + heldGas.height / 2);
  await page.mouse.down();
  await expect(page.locator('#moto-gas')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => motoProbe.stopSamples());
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('#moto-gas')).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.up();
  await expect(page.locator('#moto-center')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('moto-paused.png') });
});

test('rotation invalidates neutral and recalibration completes only on normal release', async ({ page }) => {
  await openMoto(page);
  await race(page);
  await page.evaluate(() => { motoProbe.angle = 90; });
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('#moto-center')).toBeDisabled();
  await page.locator('#moto-recalibrate').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 10000 });
  await page.locator('#moto-center').click();
  await page.locator('#moto-restart').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#moto-seed')).toHaveValue('42');
  await expect(page.locator('#moto-seed')).toBeEnabled();
});

test('narrow portrait and landscape keep all pedals reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await openMoto(page);
  for (const size of [{ width: 390, height: 760 }, { width: 760, height: 390 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('#moto-gas')).toBeInViewport();
    await expect(page.locator('#moto-brake')).toBeInViewport();
    await expect(page.locator('#moto-center')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator('#moto-gas').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(72);
    await page.screenshot({ path: testInfo.outputPath(`moto-${size.width}.png`) });
  }
});
