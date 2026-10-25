// Copyright (c) 2026 ttldtor.
// SPDX-License-Identifier: BSL-1.0
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { createTerminalBridge } from './terminal_bridge.js';
import { createTelegramHost } from './telegram_host.js';
import { createTouchInput } from './touch_input.js';
import { createOrientationInput } from './orientation_input.js';
import { createMotoInput } from './moto_input.js';

const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 10;
const APPS = [
  { name: 'Gallery', title: 'Portals gallery', columns: 22, rows: 11 },
  { name: 'Level', title: 'Phone level', columns: 25, rows: 19 },
  { name: 'Moto', title: 'Moto', columns: 32, rows: 20 }
];
const RUNTIME_VERSION = __PORTALS_RUNTIME_VERSION__;
const status = document.querySelector('#status');
const container = document.querySelector('#terminal');
let module;
let active = false;
let closed = false;
let suspended = false;
let frame = null;
let touchInput;
let orientation;
let motoInput;
let recalibrateInput;
let preparing = false;
let recalibrating = false;
let motoState = -1;
const motoPanel = document.querySelector('#moto-panel');
const motoCenter = document.querySelector('#moto-center');
const seedInput = document.querySelector('#moto-seed');
let selectedApp = 0;
let currentApp = -1;
let session = 0;
let switching = false;
const appButtons = [...document.querySelectorAll('[data-app]')];
const host = createTelegramHost(setSuspended);
document.querySelector('#environment').textContent = host.telegram ? `Telegram · ${host.platform}` : 'Browser preview';
const terminal = new Terminal({ cursorBlink: false, scrollback: 0, fontSize: DEFAULT_FONT_SIZE, screenReaderMode: true });
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open(container);
terminal.attachCustomKeyEventHandler(event => {
  // Screen reader mode leaves Shift+Tab's browser default enabled in xterm.
  // Keep navigation in the scene while xterm sends its usual Tab/CSI Z bytes.
  if (active && !suspended && event.type === 'keydown' && event.key === 'Tab' &&
      !event.ctrlKey && !event.altKey && !event.metaKey) event.preventDefault();
  return true;
});
// Alternate screen prevents xterm's scrollback reflow from shifting TUI rows on resize.
// Portals paints its own focus; hide xterm's independent terminal cursor (DECTCEM).
terminal.write('\x1b[?1049h\x1b[?25l');
resizeTerminal();

const bridge = createTerminalBridge(terminal);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
orientation = createOrientationInput({
  onSample: sample => sensorCall(sample.session, () => currentApp === 2
    ? module._portals_moto_sample(sample.session, sample.beta, sample.gamma, sample.angle, performance.now())
    : module._portals_orientation(sample.session, sample.beta, sample.gamma, sample.angle)),
  onState: update => sensorCall(update.session, () =>
    module._portals_sensor_state(update.session, { unavailable: 0, waiting: 1, paused: 2 }[update.state]))
});
orientation.pause(suspended);
let listeners = [];
let resizeObserver;

function scheduleStep() {
  if (active && !suspended && frame === null) frame = requestAnimationFrame(step);
}

function setSuspended(value) {
  if (value) pauseMoto();
  suspended = value;
  orientation?.pause(value);
  touchInput?.cancel();
  recalibrateInput?.cancel();
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  scheduleStep();
}

function messageFromWasm() {
  const pointer = module._portals_error();
  const memory = module.HEAPU8;
  const end = memory.indexOf(0, pointer);
  return decoder.decode(memory.subarray(pointer, end < 0 ? memory.length : end));
}

function finish(error) {
  if (closed) return;
  closed = true;
  active = false;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  motoInput?.cancel();
  recalibrateInput?.cancel();
  motoPanel.hidden = true;
  orientation?.dispose();
  appButtons.forEach(button => { button.disabled = true; });
  host.dispose();
  resizeObserver?.disconnect();
  listeners.forEach(listener => listener.dispose());
  listeners = [];
  terminal.write('\x1b[?1000l\x1b[?1006l');
  // Queued xterm writes own their copies and may complete after C++ teardown.
  bridge.close();
  module?._portals_shutdown();
  status.dataset.state = error ? 'error' : 'finished';
  status.textContent = error ? `Error: ${error}` : 'Finished. Reload the page to restart.';
}

function step() {
  frame = null;
  if (!active || suspended) return;
  try {
    if (currentApp === 2 && !switching) module._portals_moto_tick(session, performance.now());
    const result = module._portals_step();
    if (result < 0) {
      finish(messageFromWasm());
      return;
    }
    syncScene();
    if (currentApp === 2 && !switching) syncMoto();
    if (result === 1) {
      motoInput?.cancel();
      recalibrateInput?.cancel();
      motoPanel.hidden = true;
      active = false;
      switching = false;
      session = 0;
      currentApp = -1;
      orientation.deactivate();
      touchInput?.cancel();
      status.dataset.state = 'finished';
      status.textContent = 'Finished. Choose Gallery, Level or Moto to start.';
      return;
    }
    scheduleStep();
  } catch (error) {
    finish(error.message || String(error));
  }
}

function sensorCall(tag, callback) {
  if (closed || !active || switching || ![1, 2].includes(currentApp) || tag !== session) return;
  try {
    if (callback() < 0) finish(messageFromWasm());
  } catch (error) { finish(error.message || String(error)); }
}

function syncScene() {
  const app = module._portals_app();
  const nextSession = module._portals_session();
  if (app < 0 || nextSession === session) return;
  currentApp = app;
  session = nextSession;
  switching = false;
  terminal.textarea.readOnly = app !== 0;
  terminal.textarea.inputMode = app !== 0 ? 'none' : 'text';
  document.querySelector('h1').textContent = APPS[app].title;
  container.setAttribute('aria-label', `Portals terminal ${APPS[app].name.toLowerCase()}`);
  status.dataset.state = 'running';
  status.textContent = app === 2 ? 'Experimental ride · Tilt steering needs Telegram sensors.' :
    'Tab / Shift+Tab: focus · Enter: activate · F2: theme · F10: quit.';
  motoPanel.hidden = app !== 2;
  if (app === 2) {
    motoState = -1;
    applySeed();
    syncMoto();
  }
  if (app === 1 || app === 2) orientation.activate(session);
  else { orientation.deactivate(); terminal.focus(); }
}

function selectApp(app) {
  if (closed || !module || (active && !switching && currentApp === app)) return;
  try {
    motoInput?.cancel();
    recalibrateInput?.cancel();
    motoPanel.hidden = true;
    orientation.deactivate();
    touchInput?.cancel();
    switching = true;
    session = 0;
    selectedApp = app;
    if (app !== 0) terminal.blur();
    appButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === app)));
    if (module._portals_select_app(app) < 0) { finish(messageFromWasm()); return; }
    active = true;
    resizeTerminal();
    scheduleStep();
  } catch (error) { finish(error.message || String(error)); }
}

async function start() {
  const { default: createGallery } = await import(runtimeUrl('./portals-gallery.js'));
  if (closed) return;
  module = await createGallery({ noInitialRun: true, locateFile: runtimeUrl,
    portalsWrite: bytes => bridge.write(bytes),
    // Clear only after C++ has retired the old scene; never reenter WASM here.
    portalsClear: () => terminal.write('\x1b[2J\x1b[H') });
  if (closed) {
    module._portals_shutdown();
    return;
  }
  if (module._portals_start(terminal.cols, terminal.rows) !== 0) {
    throw new Error(messageFromWasm());
  }

  active = true;
  syncScene();
  appButtons.forEach((button, app) => {
    button.disabled = false;
    const click = () => selectApp(app);
    button.addEventListener('click', click);
    listeners.push({ dispose: () => button.removeEventListener('click', click) });
  });
  listeners.push(terminal.onData(sendInput));
  touchInput = createTouchInput(terminal, sendInput, () => active && !suspended && !switching);
  listeners.push(touchInput);
  // Normal mouse press/release reporting with SGR cell coordinates.
  terminal.write('\x1b[?1000h\x1b[?1006h');
  listeners.push(terminal.onResize(({ cols, rows }) => {
    try {
      touchInput.cancel();
      motoInput?.cancel();
      recalibrateInput?.cancel();
      if (!closed && module._portals_resize(cols, rows) < 0) finish(messageFromWasm());
    } catch (error) {
      finish(error.message || String(error));
    }
  }));
  resizeObserver = new ResizeObserver(() => { if (!closed) resizeTerminal(); });
  resizeObserver.observe(container);
  if (currentApp === 0) terminal.focus();
  host.ready();
  scheduleStep();
}

function runtimeUrl(file) {
  const url = new URL(file, import.meta.url);
  url.searchParams.set('v', RUNTIME_VERSION);
  return url.href;
}

function resizeTerminal() {
  terminal.options.fontSize = DEFAULT_FONT_SIZE;
  const available = fit.proposeDimensions();
  if (!available) return;
  const app = APPS[selectedApp];
  const scale = Math.min(1, available.cols / app.columns, available.rows / app.rows);
  terminal.options.fontSize = Math.max(MIN_FONT_SIZE, Math.floor(DEFAULT_FONT_SIZE * scale));
  fit.fit();
}

function sendInput(text) {
  if (!active || suspended || switching) return;
  try {
    const bytes = encoder.encode(text);
    const pointer = module._malloc(bytes.length || 1);
    if (!pointer) { finish('Cannot allocate input storage.'); return; }
    let result;
    try {
      module.HEAPU8.set(bytes, pointer);
      result = module._portals_input(pointer, bytes.length);
    } finally {
      module._free(pointer);
    }
    if (result < 0) finish(messageFromWasm());
  } catch (error) {
    finish(error.message || String(error));
  }
}

function motoCall(callback) {
  if (closed || !active || switching || currentApp !== 2 || !session) return;
  try {
    if (callback() < 0) finish(messageFromWasm());
  } catch (error) { finish(error.message || String(error)); }
}

function motoAction(action) {
  motoCall(() => module._portals_moto_action(session, action, performance.now()));
}

function pauseMoto() {
  motoInput?.cancel();
  recalibrateInput?.cancel();
  motoAction(3);
}

function applySeed() {
  const value = seedInput.value.trim();
  const valid = /^\d{1,10}$/.test(value) && Number(value) <= 0xffffffff;
  seedInput.setCustomValidity(valid ? '' : 'Enter a whole seed from 0 to 4294967295.');
  if (!valid) { seedInput.reportValidity(); return false; }
  motoCall(() => module._portals_moto_seed(session, Number(value)));
  return true;
}

function syncMoto() {
  const previous = motoState;
  motoState = module._portals_moto_state(session);
  if (motoState === 6 && previous !== 6) {
    motoInput?.cancel();
    recalibrateInput?.cancel();
  }
  const labels = ['Start', 'Release to prepare', 'Hold steady', 'Hold steady', 'Get ready', 'Pause', 'Continue'];
  const label = labels[motoState] || 'Start';
  if (motoCenter.textContent !== label) motoCenter.textContent = label;
  // Never disable an in-flight hold: doing so can suppress its normal pointerup.
  motoCenter.disabled = !motoInput?.isHeld() && ([2, 3, 4].includes(motoState) ||
    (motoState === 6 && !module._portals_moto_can_resume(session)));
  seedInput.disabled = motoState !== 0;
  document.querySelector('#moto-recalibrate').disabled = motoState !== 6 && !recalibrating;
  const names = ['ready', 'held', 'settling', 'collecting', 'countdown', 'racing', 'paused'];
  motoPanel.dataset.state = names[motoState] || 'ready';
  const hints = [
    'Tilt to steer. Tilt away for gas, towards you to brake. Start, then release and hold steady.',
    'Release the centre button. Your comfortable grip will become neutral.',
    'Keep your phone steady and release both pedals.',
    'Measuring neutral. Keep steady and release both pedals.',
    'Ready. Neutral stays fixed during the race.',
    'Tilt to steer. Hold Gas or Brake to override the pedals. Centre pauses.',
    module._portals_moto_can_resume(session) ? 'Paused. Continue keeps neutral; Recalibrate measures it again.' :
      'Paused. Wait for fresh sensor data, or Recalibrate then release and hold steady.'
  ];
  const hint = document.querySelector('#moto-hint');
  const message = hints[motoState] || hints[0];
  if (hint.textContent !== message) hint.textContent = message;
}

motoInput = createMotoInput({
  gas: document.querySelector('#moto-gas'), brake: document.querySelector('#moto-brake'), center: motoCenter,
  isActive: () => active && !suspended && !switching && currentApp === 2,
  onControls: (gas, brake) => motoCall(() => module._portals_moto_controls(session, +gas, +brake, performance.now())),
  onPrepare() {
    preparing = motoState === 0;
    if (preparing) { if (applySeed()) motoAction(0); else preparing = false; }
    else if (motoState === 5) motoAction(3);
    else if (motoState === 6) motoAction(4);
  },
  onRelease() { if (preparing) motoAction(1); preparing = false; },
  onCancel() { if (preparing) motoAction(2); preparing = false; }
});
listeners.push(motoInput);
const recalibrate = document.querySelector('#moto-recalibrate');
recalibrateInput = createMotoInput({
  center: recalibrate,
  isActive: () => active && !suspended && !switching && currentApp === 2,
  onControls() {},
  onPrepare() { recalibrating = motoState === 6; if (recalibrating) motoAction(5); },
  onRelease() { if (recalibrating) motoAction(1); recalibrating = false; },
  onCancel() { if (recalibrating) motoAction(2); recalibrating = false; }
});
listeners.push(recalibrateInput);
// Recalibration can change state while the button is still held; release must still arrive.
const restart = () => { motoInput.cancel(); recalibrateInput.cancel(); motoAction(6); syncMoto(); };
const restartButton = document.querySelector('#moto-restart');
restartButton.addEventListener('click', restart);
window.addEventListener('blur', pauseMoto);
listeners.push({ dispose() {
  restartButton.removeEventListener('click', restart);
  window.removeEventListener('blur', pauseMoto);
} });

window.addEventListener('pagehide', () => finish(), { once: true });
try {
  await start();
} catch (error) {
  finish(error.message || String(error));
}
