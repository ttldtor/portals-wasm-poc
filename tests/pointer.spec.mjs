// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { test, expect } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/js/**', route => route.fulfill({
    contentType: 'application/javascript', body: `
      const events = new Map();
      window.Telegram = { WebApp: { platform: 'android', isActive: true,
        viewportStableHeight: 844, safeAreaInset: { top: 8 }, contentSafeAreaInset: { top: 12 },
        isVersionAtLeast: () => true, ready() {}, expand() {},
        onEvent(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
        offEvent(name, fn) { events.get(name)?.delete(fn); }
      } };
    `
  }));
  await page.goto('./');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('.xterm-rows')).toContainText('Portals gallery');
  await expect(page.locator('#environment')).toContainText('Telegram');
});

async function point(page, row) {
  const box = await page.locator('.xterm-rows > div').nth(row).boundingBox();
  return { x: box.x + 12, y: box.y + box.height / 2 };
}

for (const method of ['mouse', 'touchscreen']) {
  test(`${method} activates real gallery controls once and focuses text input`, async ({ page }, testInfo) => {
    const activate = async row => {
      const { x, y } = await point(page, row);
      if (method === 'mouse') await page.mouse.click(x, y);
      else await page.touchscreen.tap(x, y);
    };
    const screen = page.locator('.xterm-accessibility-tree');
    await activate(3);
    await expect(screen).toContainText('[x] Alerts');
    // Wait past compatibility mouse dispatch: one tap must not toggle twice.
    await page.waitForTimeout(400);
    await expect(screen).toContainText('[x] Alerts');
    await activate(2);
    await page.locator('.xterm-helper-textarea').pressSequentially(' pointer');
    await expect(screen).toContainText('Portals pointer');
    const beforeResize = await page.locator('.xterm-screen').boundingBox();
    await page.setViewportSize({ width: 480, height: 700 });
    await expect.poll(async () => (await page.locator('.xterm-screen').boundingBox()).width).toBeGreaterThan(beforeResize.width);
    await activate(3);
    await expect(screen).toContainText('[ ] Alerts');
    await activate(4);
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
    await page.locator('.xterm-helper-textarea').press('Space');
    await expect(screen).toContainText('[ ] Alerts');
    await expect(page.locator('.xterm-cursor')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${method}-gallery.png`) });
    await activate(5);
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'finished');
    await activate(3);
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'finished');
  });
}

test('touch swipe and cancellation do not activate a checkbox', async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  const { x, y } = await point(page, 3);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 50, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(600);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('[ ] Alerts');
  await page.touchscreen.tap(x, y);
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('[x] Alerts');
});
