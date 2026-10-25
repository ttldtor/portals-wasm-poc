// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { test, expect } from '@playwright/test';
import { controlPoint, galleryRow } from './gallery_helpers.mjs';

async function openDesktopMoto(page) {
  await page.route('https://telegram.org/js/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('./');
  await page.getByRole('button', { name: 'Moto', exact: true }).click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-input', 'keyboard');
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#status')).toContainText('Keyboard arrows');
}

async function startRace(page) {
  await page.locator('#moto-center').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 10000 });
}

async function speed(page) {
  const text = await page.locator('.xterm-rows').textContent();
  return Number(text.match(/(\d+)\s+km\/h/)?.[1] || 0);
}

test('desktop arrows steer and drive real WASM without Telegram sensors', async ({ page }) => {
  await openDesktopMoto(page);
  await startRace(page);
  const road = page.locator('.xterm-rows > div').nth(12);
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  // Observe a settled simultaneous hold, rather than a single frame between keydowns.
  await page.waitForTimeout(500);
  const neutralRoad = await road.textContent();
  await page.waitForTimeout(200);
  expect(await road.textContent()).toBe(neutralRoad);
  await page.keyboard.up('ArrowRight');
  await expect.poll(() => road.textContent()).not.toBe(neutralRoad);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => speed(page)).toBeGreaterThan(8);
  await expect.poll(async () => {
    const text = await page.locator('.xterm-rows').textContent();
    return Number(text.match(/([\d.]+)\s+km(?!\/h)/)?.[1] || 0);
  }).toBeGreaterThan(0);
  await page.keyboard.down('ArrowDown');
  await expect.poll(() => speed(page)).toBe(0);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowDown');
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing');
});

test('a gas arrow held before Start must be released before preparation completes', async ({ page }) => {
  await openDesktopMoto(page);
  await page.keyboard.down('ArrowUp');
  await page.locator('#moto-center').click();
  await page.waitForTimeout(1100);
  const state = await page.locator('#moto-panel').getAttribute('data-state');
  expect(['countdown', 'racing']).not.toContain(state);
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 10000 });
});

test('blur pauses and a stale repeat cannot restore gas or block Continue', async ({ page }) => {
  await openDesktopMoto(page);
  await startRace(page);
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => speed(page)).toBeGreaterThan(8);
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'paused');
  await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowUp', repeat: true, bubbles: true, cancelable: true
  })));
  await expect(page.locator('#moto-center')).toBeEnabled();
  const pausedSpeed = await speed(page);
  await page.locator('#moto-center').click();
  await expect(page.locator('#moto-panel')).toHaveAttribute('data-state', 'racing', { timeout: 6000 });
  await expect.poll(() => speed(page)).toBeLessThan(pausedSpeed);
  await page.keyboard.up('ArrowUp');
});

test('seed caret editing and Gallery arrow editing retain their native behavior', async ({ page }) => {
  await openDesktopMoto(page);
  const seed = page.locator('#moto-seed');
  await seed.fill('12345');
  await seed.press('End');
  await seed.press('ArrowLeft');
  await seed.press('Backspace');
  await expect(seed).toHaveValue('1235');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expect(page.locator('#moto-panel')).toBeHidden();
  const point = await controlPoint(page, 'Portals', 'Name :');
  await page.mouse.click(point.x, point.y);
  const input = page.locator('.xterm-helper-textarea');
  await input.press('End');
  await input.pressSequentially(' X');
  await input.press('ArrowLeft');
  await input.pressSequentially('Y');
  await expect(galleryRow(page, 'Name :')).toContainText('Portals YX');
});
