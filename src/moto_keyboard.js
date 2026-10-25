// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0

const MOBILE_PLATFORMS = new Set(['android', 'android_x', 'ios']);
const DESKTOP_PLATFORMS = new Set(['tdesktop', 'macos']);
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const SAMPLE_INTERVAL_MS = 50;
const STEERING_RADIANS = Math.PI / 4;

/** Select desktop input without treating a narrow viewport as a mobile device. */
export function isDesktopMoto({ platform = 'browser', navigator = globalThis.navigator,
  matchMedia = globalThis.matchMedia?.bind(globalThis) } = {}) {
  if (MOBILE_PLATFORMS.has(platform)) return false;
  if (DESKTOP_PLATFORMS.has(platform)) return true;
  if (navigator?.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || '')) return false;
  // iPadOS can advertise a desktop Mac user agent while retaining touch-only input.
  if (navigator?.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return false;
  return Boolean(matchMedia?.('(any-hover: hover)').matches && matchMedia?.('(any-pointer: fine)').matches);
}

function editing(target) {
  if (target?.isContentEditable) return true;
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return false;
  return !(target.tagName === 'TEXTAREA' && target.readOnly && target.classList?.contains('xterm-helper-textarea'));
}

/** Own arrow holds and provide explicitly virtual samples through the existing Moto ABI. */
export function createMotoKeyboard({ window = globalThis.window, document = globalThis.document,
  isActive, onControls, onSample }) {
  const held = new Set();
  let lastSampleAt = -Infinity;
  let disposed = false;

  function controls() {
    return { steering: Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft')),
      gas: held.has('ArrowUp'), brake: held.has('ArrowDown') };
  }

  function keydown(event) {
    if (disposed || !isActive() || !ARROW_KEYS.has(event.key) || editing(event.target) ||
        event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    // A repeat after pause/blur must not resurrect the old physical hold.
    if (event.repeat || held.has(event.key)) return;
    held.add(event.key);
    onControls();
  }

  function keyup(event) {
    if (!held.delete(event.key)) return;
    if (isActive() && !editing(event.target) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Releasing a prior hold still counts after focus or modifier changes.
    onControls();
  }

  function cancel() {
    lastSampleAt = -Infinity;
    if (!held.size) return;
    held.clear();
    onControls();
  }

  function visibility() { if (document.hidden) cancel(); }
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', visibility);

  return { controls, cancel,
    pump(now, racing) {
      if (disposed || !isActive() || !Number.isFinite(now) || now < 0 || now - lastSampleAt < SAMPLE_INTERVAL_MS) return;
      lastSampleAt = now;
      onSample({ beta: 0, gamma: racing ? controls().steering * STEERING_RADIANS : 0, angle: 0, now });
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    }
  };
}
