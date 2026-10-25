// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotoKeyboard, isDesktopMoto } from '../src/moto_keyboard.js';

function desktop(overrides = {}) {
  return { platform: 'browser', navigator: { userAgent: 'Desktop browser', userAgentData: { mobile: false } },
    matchMedia: () => ({ matches: true }), ...overrides };
}

test('desktop selection respects Telegram mobile platforms and touch-only browser signals', () => {
  assert.equal(isDesktopMoto(desktop()), true);
  for (const platform of ['android', 'android_x', 'ios']) assert.equal(isDesktopMoto(desktop({ platform })), false);
  for (const platform of ['tdesktop', 'macos']) {
    assert.equal(isDesktopMoto(desktop({ platform, matchMedia: () => ({ matches: false }) })), true);
  }
  assert.equal(isDesktopMoto(desktop({ navigator: { userAgentData: { mobile: true } } })), false);
  assert.equal(isDesktopMoto(desktop({ navigator: { userAgent: 'Android tablet' } })), false);
  assert.equal(isDesktopMoto(desktop({ navigator: { userAgent: 'iPhone' } })), false);
  assert.equal(isDesktopMoto(desktop({ navigator: { platform: 'MacIntel', maxTouchPoints: 5 } })), false);
  assert.equal(isDesktopMoto(desktop({ matchMedia: () => ({ matches: false }) })), false);
});

function setup() {
  const window = new EventTarget(), document = new EventTarget();
  const changes = [], samples = [];
  let active = true;
  const keyboard = createMotoKeyboard({ window, document, isActive: () => active,
    onControls: () => changes.push(keyboard.controls()), onSample: sample => samples.push(sample) });
  function key(type, key, extra = {}, target = null) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { key, repeat: false, ctrlKey: false, altKey: false, metaKey: false }, extra);
    if (target) Object.defineProperty(event, 'target', { value: target });
    window.dispatchEvent(event);
    return event;
  }
  return { keyboard, key, changes, samples, window, document, deactivate() { active = false; } };
}

test('arrow holds are independent, opposite steering cancels and either release preserves the other', () => {
  const s = setup();
  assert.equal(s.key('keydown', 'ArrowLeft').defaultPrevented, true);
  s.key('keydown', 'ArrowUp');
  assert.deepEqual(s.keyboard.controls(), { steering: -1, gas: true, brake: false });
  s.key('keydown', 'ArrowRight');
  s.key('keydown', 'ArrowDown');
  assert.deepEqual(s.keyboard.controls(), { steering: 0, gas: true, brake: true });
  s.key('keyup', 'ArrowLeft');
  s.key('keyup', 'ArrowUp');
  assert.deepEqual(s.keyboard.controls(), { steering: 1, gas: false, brake: true });
  s.key('keyup', 'ArrowRight');
  s.key('keyup', 'ArrowDown');
  assert.deepEqual(s.keyboard.controls(), { steering: 0, gas: false, brake: false });
});

test('editing and modified arrows remain native, but a modified release clears an earlier hold', () => {
  const s = setup();
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { isContentEditable: true }]) {
    assert.equal(s.key('keydown', 'ArrowRight', {}, target).defaultPrevented, false);
  }
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    assert.equal(s.key('keydown', 'ArrowRight', { [modifier]: true }).defaultPrevented, false);
  }
  assert.equal(s.changes.length, 0);
  const xterm = { tagName: 'TEXTAREA', readOnly: true, classList: { contains: value => value === 'xterm-helper-textarea' } };
  assert.equal(s.key('keydown', 'ArrowRight', {}, xterm).defaultPrevented, true);
  s.key('keyup', 'ArrowRight', { ctrlKey: true }, { tagName: 'INPUT' });
  assert.equal(s.keyboard.controls().steering, 0);
});

test('pause reset cannot be undone by an automatic repeat until the key is pressed again', () => {
  const s = setup();
  s.key('keydown', 'ArrowUp');
  s.keyboard.cancel();
  s.key('keydown', 'ArrowUp', { repeat: true });
  assert.equal(s.keyboard.controls().gas, false);
  s.key('keyup', 'ArrowUp');
  s.key('keydown', 'ArrowUp');
  assert.equal(s.keyboard.controls().gas, true);
});

test('virtual samples are neutral during preparation and bounded independently of a high refresh host', () => {
  const s = setup();
  s.key('keydown', 'ArrowRight');
  for (let now = 0; now < 1000; now += 4) s.keyboard.pump(now, false);
  assert.ok(s.samples.length <= 21);
  assert.ok(s.samples.every(sample => sample.beta === 0 && sample.gamma === 0));
  assert.ok(s.samples.slice(1).every((sample, index) => sample.now - s.samples[index].now >= 50));
  s.keyboard.pump(1100, true);
  assert.equal(s.samples.at(-1).gamma, Math.PI / 4);
  s.key('keyup', 'ArrowRight');
  s.keyboard.pump(1150, true);
  assert.equal(s.samples.at(-1).gamma, 0);
});

test('blur, visibility, inactivity and disposal stop stale delivery and remove listeners', () => {
  const s = setup();
  s.key('keydown', 'ArrowLeft');
  s.window.dispatchEvent(new Event('blur'));
  assert.equal(s.keyboard.controls().steering, 0);
  s.key('keydown', 'ArrowUp');
  s.document.hidden = true;
  s.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(s.keyboard.controls().gas, false);
  s.deactivate();
  assert.equal(s.key('keydown', 'ArrowDown').defaultPrevented, false);
  s.keyboard.pump(100, true);
  assert.equal(s.samples.length, 0);
  s.keyboard.dispose();
  const count = s.changes.length;
  s.key('keydown', 'ArrowDown');
  s.keyboard.pump(200, true);
  assert.equal(s.changes.length, count);
  assert.equal(s.samples.length, 0);
});
