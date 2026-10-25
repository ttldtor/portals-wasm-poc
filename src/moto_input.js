// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0

/** Own independent held pointers. Only normal release completes preparation. */
export function createMotoInput({ gas, brake, center, onControls, onPrepare, onRelease, onCancel, isActive }) {
  const disposers = [];
  const held = new Map([gas, brake].filter(Boolean).map(button => [button, new Set()]));
  let centerPointer = null;
  let centerKey = null;
  let disposed = false;

  function listen(target, name, handler) {
    target.addEventListener(name, handler, { passive: false });
    disposers.push(() => target.removeEventListener(name, handler));
  }

  function controls() {
    for (const [button, pointers] of held) button.setAttribute('aria-pressed', String(pointers.size > 0));
    onControls((held.get(gas)?.size || 0) > 0, (held.get(brake)?.size || 0) > 0);
  }

  function releaseCapture(button, id) {
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }

  for (const [button, pointers] of held) {
    listen(button, 'pointerdown', event => {
      event.preventDefault();
      if (disposed || !isActive() || event.button !== 0 || button.disabled) return;
      pointers.add(event.pointerId);
      button.setPointerCapture(event.pointerId);
      controls();
    });
    const release = event => {
      if (!pointers.delete(event.pointerId)) return;
      event.preventDefault();
      releaseCapture(button, event.pointerId);
      controls();
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, name, release);
    listen(button, 'keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (disposed || !isActive() || button.disabled || event.repeat) return;
      pointers.add(`key:${event.key}`);
      controls();
    });
    listen(button, 'keyup', event => {
      if (!pointers.delete(`key:${event.key}`)) return;
      event.preventDefault();
      controls();
    });
    listen(button, 'blur', () => {
      let changed = false;
      for (const id of [...pointers]) if (typeof id === 'string') { pointers.delete(id); changed = true; }
      if (changed) controls();
    });
    // Mouse/touch compatibility clicks must never latch a pedal.
    listen(button, 'click', event => event.preventDefault());
  }

  listen(center, 'pointerdown', event => {
    event.preventDefault();
    if (disposed || !isActive() || event.button !== 0 || center.disabled || centerPointer !== null || centerKey !== null) return;
    centerPointer = event.pointerId;
    center.setPointerCapture(event.pointerId);
    onPrepare();
  });
  function releaseCenter(event, normal) {
    if (centerPointer !== event.pointerId) return;
    const previous = centerPointer;
    centerPointer = null;
    releaseCapture(center, previous);
    event.preventDefault();
    if (normal && !disposed && isActive()) onRelease();
    else onCancel();
  }
  listen(center, 'pointerup', event => releaseCenter(event, true));
  listen(center, 'pointercancel', event => releaseCenter(event, false));
  listen(center, 'lostpointercapture', event => releaseCenter(event, false));
  listen(center, 'keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat || disposed || !isActive() || center.disabled || centerKey !== null || centerPointer !== null) return;
    centerKey = event.key;
    onPrepare();
  });
  listen(center, 'keyup', event => {
    if (centerKey !== event.key) return;
    event.preventDefault();
    centerKey = null;
    if (!disposed && isActive()) onRelease();
    else onCancel();
  });
  // AT activation has no physical press to wait for, so supply an explicit pair.
  listen(center, 'click', event => {
    event.preventDefault();
    if (event.detail !== 0 || disposed || !isActive() || center.disabled || centerPointer !== null || centerKey !== null) return;
    onPrepare();
    onRelease();
  });

  function cancel() {
    const previous = centerPointer;
    const preparing = previous !== null || centerKey !== null;
    centerPointer = null;
    centerKey = null;
    if (previous !== null) releaseCapture(center, previous);
    for (const [button, pointers] of held) {
      const ids = [...pointers];
      pointers.clear();
      for (const id of ids) if (typeof id === 'number') releaseCapture(button, id);
    }
    controls();
    if (preparing) onCancel();
  }
  listen(center, 'blur', () => { if (centerKey !== null) cancel(); });

  return { cancel, isHeld: () => centerPointer !== null || centerKey !== null, dispose() {
    if (disposed) return;
    cancel();
    disposed = true;
    for (const dispose of disposers) dispose();
  } };
}
