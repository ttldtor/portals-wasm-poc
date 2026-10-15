// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { test, expect } from '@playwright/test';
import { activateControl, controlPoint, galleryRow } from './gallery_helpers.mjs';

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/js/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('./');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
});

test('gallery has an in-terminal header, actions, inline editor and explicit blank rows', async ({ page }) => {
  const rows = page.locator('.xterm-rows > div');
  await expect(rows.nth(10)).toContainText('(S)omething');
  expect((await rows.allTextContents()).slice(0, 11).map(text => text.trimEnd())).toEqual([
    ' Portals gallery', '=================', '[ Theme |   F2  ]', '[ Quit  |   F10 ]', '',
    'Name : Portals', '[ ] Alerts', '', '[ Run something ]', '', '   (S)omething'
  ]);
  await expect(page.locator('#theme-toggle, #action-result')).toHaveCount(0);
  const header = rows.nth(0).locator('span').filter({ hasText: 'Portals gallery' });
  const background = await header.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(await header.evaluate(element => getComputedStyle(element).color)).not.toBe(
    await rows.nth(1).locator('span').first().evaluate(element => getComputedStyle(element).color));
});

test('gallery heading uses the HEADER palette in every built-in theme', async ({ page }, testInfo) => {
  const header = galleryRow(page, 'Portals gallery').locator('span').filter({ hasText: 'Portals gallery' });
  const palettes = [
    ['modern', 'rgb(75, 180, 220)', 'rgb(24, 28, 36)'],
    ['turbo', 'rgb(255, 255, 255)', 'rgb(0, 0, 170)'],
    ['nord', 'rgb(180, 142, 173)', 'rgb(46, 52, 64)'],
    ['gruvbox', 'rgb(250, 189, 47)', 'rgb(40, 40, 40)'],
    ['tokyo-night', 'rgb(255, 158, 100)', 'rgb(26, 27, 38)'],
    ['catppuccin-latte', 'rgb(254, 100, 11)', 'rgb(239, 241, 245)']
  ];
  for (const [index, [theme, foreground, background]] of palettes.entries()) {
    await expect(header, `${theme}: header foreground`).toHaveCSS('color', foreground);
    await expect(header, `${theme}: header background`).toHaveCSS('background-color', background);
    expect(Number(await header.evaluate(element => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
    if (theme === 'modern' || theme === 'catppuccin-latte') {
      await page.screenshot({ path: testInfo.outputPath(`theme-header-${theme}.png`) });
    }
    if (index % 2 === 0) await activateControl(page, 'Theme');
    else await page.locator('.xterm-helper-textarea').press('F2');
  }
  await expect(header).toHaveCSS('color', palettes[0][1]);
});

test('Name separator uses the label background in every gallery theme', async ({ page }, testInfo) => {
  const row = galleryRow(page, 'Name :');
  const cells = () => row.evaluate(element => [...element.querySelectorAll('span')].flatMap(span =>
    [...span.textContent].map(text => ({ text, background: getComputedStyle(span).backgroundColor }))));
  for (const theme of ['modern', 'turbo', 'nord', 'gruvbox', 'tokyo-night', 'catppuccin-latte']) {
    const colors = await cells();
    expect(colors.slice(0, 8).map(cell => cell.text).join('')).toBe('Name : P');
    expect(colors[6].background, `${theme}: separator matches label`).toBe(colors[5].background);
    if (theme === 'modern' || theme === 'catppuccin-latte') {
      await page.screenshot({ path: testInfo.outputPath(`name-separator-${theme}.png`) });
    }
    await page.locator('.xterm-helper-textarea').press('F2');
    await expect.poll(async () => (await cells())[5].background).not.toBe(colors[5].background);
  }
});

test('Run animates forward and backward once, ignores activation while disabled, and can restart', async ({ page }) => {
  await activateControl(page, 'Run something');
  const frames = ['(S)omething', 's(O)mething', 'so(M)ething', 'som(E)thing', 'some(T)hing',
    'somet(H)ing', 'someth(I)ng', 'somethi(N)g', 'somethin(G)', 'somethi(N)g',
    'someth(I)ng', 'somet(H)ing', 'some(T)hing', 'som(E)thing', 'so(M)ething', 's(O)mething', '(S)omething'];
  const row = page.locator('.xterm-rows > div').nth(10);
  await expect(row).toContainText(frames[0]);
  const started = Date.now();
  for (const [index, frame] of frames.slice(1).entries()) {
    await expect.poll(() => row.textContent(), { intervals: [30], timeout: 1100 }).toContain(frame);
    if (index === 2) await activateControl(page, 'Run something');
  }
  expect(Date.now() - started).toBeGreaterThanOrEqual(4000);
  expect(Date.now() - started).toBeLessThan(6500);
  await page.waitForTimeout(650);
  await expect(row).toContainText('(S)omething');
  await activateControl(page, 'Run something');
  await expect.poll(() => row.textContent(), { intervals: [30], timeout: 1100 }).toContain('s(O)mething');
  await page.locator('.xterm-helper-textarea').press('F10');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'finished');
  const final = await row.textContent();
  await page.waitForTimeout(500);
  expect(await row.textContent()).toBe(final);
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

test('editor input and theme remain responsive while Run is disabled', async ({ page }) => {
  await activateControl(page, 'Run something');
  await expect.poll(() => page.locator('.xterm-rows > div').nth(10).textContent(), { intervals: [30] }).toContain('s(O)mething');
  const editor = await controlPoint(page, 'Portals', 'Name :');
  await page.mouse.click(editor.x, editor.y);
  await page.locator('.xterm-helper-textarea').pressSequentially(' active');
  await expect(galleryRow(page, 'Name :')).toContainText('Portals active');
  await page.locator('.xterm-helper-textarea').press('Enter');
  await activateControl(page, 'Theme');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'running');
  // From Alerts, disabled Run is skipped and the next Tab reaches Theme.
  await activateControl(page, 'Alerts');
  await page.locator('.xterm-helper-textarea').press('Tab');
  await page.locator('.xterm-helper-textarea').press('Tab');
  await page.locator('.xterm-helper-textarea').press('Enter');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'finished');
});

for (const touch of [false, true]) {
  test(`terminal Theme and Quit work with ${touch ? 'touch' : 'mouse'}`, async ({ page }) => {
    const before = await page.locator('#terminal').screenshot();
    await activateControl(page, 'Theme', touch);
    await expect.poll(async () => (await page.locator('#terminal').screenshot()).equals(before)).toBe(false);
    await activateControl(page, 'Run something', touch);
    await expect.poll(() => page.locator('.xterm-rows > div').nth(10).textContent(), { intervals: [30] }).toContain('s(O)mething');
    await activateControl(page, 'Quit', touch);
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'finished');
  });
}

test('gallery fits a phone and recovers desktop size', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const rows = page.locator('.xterm-rows > div');
  await expect(rows.nth(10)).toContainText('(S)omething');
  await page.screenshot({ path: testInfo.outputPath('phone-fit.png') });
  const phoneRow = await rows.first().boundingBox();
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(async () => (await rows.first().boundingBox()).height).toBeGreaterThanOrEqual(phoneRow.height);
  await page.screenshot({ path: testInfo.outputPath('desktop-fit.png') });
  await expect(galleryRow(page, 'Name :')).toContainText('Portals');
  await expect(page.locator('#status')).toBeInViewport();
});
