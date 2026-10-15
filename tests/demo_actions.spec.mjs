// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/js/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('./');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('.xterm-rows')).toContainText('Name (Enter commits; Tab changes focus):');
});

test('Run feedback failure reports an error and permits safe shutdown', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#action-result').evaluate(element => {
    Object.defineProperty(element, 'textContent', { set() { throw new Error('Run feedback failed'); } });
  });
  const row = await page.locator('.xterm-rows > div').nth(4).boundingBox();
  await page.mouse.click(row.x + 12, row.y + row.height / 2);
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: 'Theme', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('loader and WASM use matching versioned cache keys', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/portals-gallery\.(js|wasm)$/.test(url.pathname)) requests.push(url);
  });
  await page.reload();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
  expect(requests).toHaveLength(2);
  const versions = requests.map(url => url.searchParams.get('v'));
  expect(versions[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(versions[1]).toBe(versions[0]);
  expect(new URL(await page.locator('script[type="module"]').getAttribute('src'), page.url()).searchParams.get('v')).toMatch(/^[a-f0-9]{64}$/);
});

for (const touch of [false, true]) {
  test(`Theme and real Run feedback work with ${touch ? 'touch' : 'mouse'}`, async ({ page }) => {
    const theme = page.getByRole('button', { name: 'Theme', exact: true });
    const before = await page.locator('#terminal').screenshot();
    if (touch) await theme.tap();
    else await theme.click();
    await expect.poll(async () => (await page.locator('#terminal').screenshot()).equals(before)).toBe(false);
    const row = await page.locator('.xterm-rows > div').nth(4).boundingBox();
    if (touch) await page.touchscreen.tap(row.x + 12, row.y + row.height / 2);
    else await page.mouse.click(row.x + 12, row.y + row.height / 2);
    await expect(page.locator('#action-result')).toHaveText('Run completed · 1');
    await page.locator('.xterm-helper-textarea').press('Enter');
    await expect(page.locator('#action-result')).toHaveText('Run completed · 2');
    await page.locator('.xterm-helper-textarea').press('F10');
    await expect(theme).toBeDisabled();
  });
}

test('full gallery lines fit a phone and recover the desktop font after resizing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator('.xterm-rows')).toContainText('Name (Enter commits; Tab changes focus):');
  await expect(page.locator('.xterm-rows')).toContainText('Portals gallery | F2 theme | F10 quit');
  await expect(page.getByRole('button', { name: 'Theme', exact: true })).toBeInViewport();
  await expect(page.locator('#status')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('phone-fit.png') });
  const phoneRow = await page.locator('.xterm-rows > div').first().boundingBox();
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(async () => (await page.locator('.xterm-rows > div').first().boundingBox()).height).toBeGreaterThan(phoneRow.height);
  await expect(page.locator('.xterm-rows')).toContainText('Name (Enter commits; Tab changes focus):');
});
