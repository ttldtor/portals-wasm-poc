// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotoInput } from '../src/moto_input.js';

function setup() {
  const captures = new Set();
  function button() {
    const target = new EventTarget();
    target.setAttribute = () => {};
    target.setPointerCapture = id => captures.add(id);
    target.hasPointerCapture = id => captures.has(id);
    target.releasePointerCapture = id => captures.delete(id);
    return target;
  }
  const gas = button(), brake = button(), center = button();
  const controls = [], actions = [];
  let active = true;
  const input = createMotoInput({ gas, brake, center, onControls: (...values) => controls.push(values),
    onPrepare: () => actions.push('prepare'), onRelease: () => actions.push('release'),
    onCancel: () => actions.push('cancel'), isActive: () => active });
  function fire(target, type, properties = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, detail: 1 }, properties);
    target.dispatchEvent(event);
  }
  return { gas, brake, center, fire, input, controls, actions, captures, deactivate() { active = false; } };
}

test('independent fingers and multiple pointers in one pedal release only their own hold', () => {
  const s = setup();
  s.fire(s.gas, 'pointerdown');
  s.fire(s.brake, 'pointerdown', { pointerId: 2 });
  s.fire(s.gas, 'pointerdown', { pointerId: 3 });
  s.fire(s.gas, 'pointerup');
  assert.deepEqual(s.controls.at(-1), [true, true]);
  s.fire(s.brake, 'pointerup', { pointerId: 2 });
  assert.deepEqual(s.controls.at(-1), [true, false]);
  s.fire(s.gas, 'pointerup', { pointerId: 3 });
  assert.deepEqual(s.controls.at(-1), [false, false]);
  assert.equal(s.captures.size, 0);
});

test('moving outside a captured pedal keeps holding until normal release or cancellation', () => {
  const s = setup();
  s.fire(s.gas, 'pointerdown');
  s.fire(s.gas, 'pointermove', { clientX: -100 });
  assert.deepEqual(s.controls.at(-1), [true, false]);
  s.fire(s.gas, 'lostpointercapture');
  assert.deepEqual(s.controls.at(-1), [false, false]);
  s.fire(s.brake, 'pointerdown', { pointerId: 2 });
  s.fire(s.brake, 'pointercancel', { pointerId: 2 });
  assert.deepEqual(s.controls.at(-1), [false, false]);
});

test('only a normal centre release completes preparation; compatibility clicks do not repeat it', () => {
  const s = setup();
  s.fire(s.center, 'pointerdown');
  assert.deepEqual(s.actions, ['prepare']);
  s.fire(s.center, 'pointerup');
  s.fire(s.center, 'click');
  assert.deepEqual(s.actions, ['prepare', 'release']);
  s.fire(s.center, 'pointerdown');
  s.fire(s.center, 'pointercancel');
  assert.deepEqual(s.actions.slice(-2), ['prepare', 'cancel']);
});

test('cancel/dispose clear captures, prevent a late release and remove handlers', () => {
  const s = setup();
  s.fire(s.center, 'pointerdown');
  s.fire(s.gas, 'pointerdown', { pointerId: 2 });
  s.input.cancel();
  s.fire(s.center, 'pointerup');
  assert.deepEqual(s.actions, ['prepare', 'cancel']);
  assert.deepEqual(s.controls.at(-1), [false, false]);
  assert.equal(s.captures.size, 0);
  s.input.dispose();
  const count = s.controls.length;
  s.fire(s.gas, 'pointerdown');
  s.fire(s.center, 'click', { detail: 0 });
  assert.equal(s.controls.length, count);
  assert.deepEqual(s.actions, ['prepare', 'cancel']);
});

test('keyboard holds cancel on blur; AT centre click supplies exactly one explicit pair', () => {
  const s = setup();
  s.fire(s.gas, 'keydown', { key: ' ', repeat: false });
  assert.deepEqual(s.controls.at(-1), [true, false]);
  s.fire(s.gas, 'blur');
  assert.deepEqual(s.controls.at(-1), [false, false]);
  s.fire(s.center, 'keydown', { key: 'Enter', repeat: false });
  s.fire(s.center, 'keydown', { key: 'Enter', repeat: true });
  s.fire(s.center, 'keyup', { key: 'Enter' });
  assert.deepEqual(s.actions, ['prepare', 'release']);
  s.fire(s.center, 'click', { detail: 0 });
  assert.deepEqual(s.actions, ['prepare', 'release', 'prepare', 'release']);
});

test('inactive and disabled controls do not start a hold and inactive release cancels preparation', () => {
  const s = setup();
  s.center.disabled = true;
  s.fire(s.center, 'pointerdown');
  assert.deepEqual(s.actions, []);
  s.center.disabled = false;
  s.fire(s.center, 'pointerdown');
  s.deactivate();
  s.fire(s.center, 'pointerup');
  s.fire(s.gas, 'pointerdown');
  assert.deepEqual(s.actions, ['prepare', 'cancel']);
  assert.deepEqual(s.controls, []);
});
