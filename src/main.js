// Copyright (c) 2026 ttldtor.
// SPDX-License-Identifier: BSL-1.0
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { createTerminalBridge } from './terminal_bridge.js';
import { createTelegramHost } from './telegram_host.js';
import { createTouchInput } from './touch_input.js';

const status = document.querySelector('#status');
const container = document.querySelector('#terminal');
let module;
let active = false;
let closed = false;
let suspended = false;
let frame = null;
let touchInput;
const host = createTelegramHost(setSuspended);
document.querySelector('#environment').textContent = host.telegram ? `Telegram · ${host.platform}` : 'Browser preview';
const terminal = new Terminal({ cursorBlink: false, scrollback: 0, fontSize: 16, screenReaderMode: true });
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open(container);
// Portals paints its own focus; hide xterm's independent terminal cursor (DECTCEM).
terminal.write('\x1b[?25l');
fit.fit();

const bridge = createTerminalBridge(terminal);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let listeners = [];
let resizeObserver;

function scheduleStep() {
  if (active && !suspended && frame === null) frame = requestAnimationFrame(step);
}

function setSuspended(value) {
  suspended = value;
  touchInput?.cancel();
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
    const result = module._portals_step();
    if (result !== 0) {
      finish(result < 0 ? messageFromWasm() : undefined);
      return;
    }
    scheduleStep();
  } catch (error) {
    finish(error.message || String(error));
  }
}

async function start() {
  const { default: createGallery } = await import('./portals-gallery.js');
  if (closed) return;
  module = await createGallery({ noInitialRun: true, portalsWrite: bytes => bridge.write(bytes) });
  if (closed) {
    module._portals_shutdown();
    return;
  }
  if (module._portals_start(terminal.cols, terminal.rows) !== 0) {
    throw new Error(messageFromWasm());
  }

  active = true;
  listeners.push(terminal.onData(sendInput));
  touchInput = createTouchInput(terminal, sendInput, () => active && !suspended);
  listeners.push(touchInput);
  // Normal mouse press/release reporting with SGR cell coordinates.
  terminal.write('\x1b[?1000h\x1b[?1006h');
  listeners.push(terminal.onResize(({ cols, rows }) => {
    try {
      touchInput.cancel();
      if (active && module._portals_resize(cols, rows) < 0) finish(messageFromWasm());
    } catch (error) {
      finish(error.message || String(error));
    }
  }));
  resizeObserver = new ResizeObserver(() => { if (active) fit.fit(); });
  resizeObserver.observe(container);
  status.dataset.state = 'running';
  status.textContent = 'Running — Click or tap controls. Tab / Enter also work; F2 changes theme.';
  terminal.focus();
  host.ready();
  scheduleStep();
}

function sendInput(text) {
  if (!active || suspended) return;
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

window.addEventListener('pagehide', () => finish(), { once: true });
try {
  await start();
} catch (error) {
  finish(error.message || String(error));
}
