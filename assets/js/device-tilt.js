/**
 * device-tilt.js — phone tilt as a camera input.
 *
 * Android browsers generally expose DeviceOrientation immediately. iOS asks
 * for permission from a user gesture, so the matching control is revealed
 * only when that API is present. The first valid reading becomes neutral:
 * visitors can hold the phone however they naturally arrived at the page.
 */

import { hasFinePointer, prefersReducedMotion } from './motion.js';

const TILT_RANGE = 22;
const SENSOR_EASE = 0.18;

export const deviceTilt = { x: 0, y: 0, active: false };

/**
 * Convert screen-relative sensor deltas into the same -0.5..0.5 space used by
 * the desktop pointer. Exported so the orientation cases can be verified.
 */
export function mapOrientation(deltaBeta, deltaGamma, angle = 0) {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  let x = deltaGamma;
  let y = deltaBeta;

  if (normalizedAngle === 90) {
    x = deltaBeta;
    y = -deltaGamma;
  } else if (normalizedAngle === 180) {
    x = -deltaGamma;
    y = -deltaBeta;
  } else if (normalizedAngle === 270) {
    x = -deltaBeta;
    y = deltaGamma;
  }

  return {
    x: Math.max(-0.5, Math.min(0.5, x / TILT_RANGE / 2)),
    y: Math.max(-0.5, Math.min(0.5, y / TILT_RANGE / 2)),
  };
}

export function initDeviceTilt() {
  const control = document.querySelector('[data-tilt-control]');
  const OrientationEvent = window.DeviceOrientationEvent;
  let listening = false;
  let permissionGranted = false;
  let permissionDenied = false;
  let baseline = null;
  let hideTimer = 0;

  const eligible = () =>
    Boolean(OrientationEvent) && !hasFinePointer() && !prefersReducedMotion();

  const screenAngle = () =>
    Number(screen.orientation?.angle ?? window.orientation ?? 0);

  const reset = () => {
    baseline = null;
    deviceTilt.x = 0;
    deviceTilt.y = 0;
    deviceTilt.active = false;
  };

  const onOrientation = (event) => {
    if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    if (!baseline) {
      baseline = { beta: event.beta, gamma: event.gamma };
      return;
    }

    const target = mapOrientation(
      event.beta - baseline.beta,
      event.gamma - baseline.gamma,
      screenAngle(),
    );
    deviceTilt.x += (target.x - deviceTilt.x) * SENSOR_EASE;
    deviceTilt.y += (target.y - deviceTilt.y) * SENSOR_EASE;
    deviceTilt.active = true;
    document.documentElement.classList.add('has-device-tilt');
  };

  const attach = () => {
    if (listening || !eligible()) return;
    listening = true;
    addEventListener('deviceorientation', onOrientation, { passive: true });
    screen.orientation?.addEventListener?.('change', reset);
    addEventListener('orientationchange', reset, { passive: true });
  };

  const detach = () => {
    if (listening) {
      removeEventListener('deviceorientation', onOrientation);
      screen.orientation?.removeEventListener?.('change', reset);
      removeEventListener('orientationchange', reset);
    }
    listening = false;
    document.documentElement.classList.remove('has-device-tilt');
    reset();
  };

  const needsPermission = () =>
    typeof OrientationEvent?.requestPermission === 'function';

  const updateControl = () => {
    if (!control) return;
    control.hidden = !eligible() || !needsPermission() || permissionGranted;
    if (!permissionDenied) {
      control.disabled = false;
      control.textContent = 'Enable tilt depth';
    }
  };

  const requestPermission = async () => {
    if (!eligible() || permissionDenied) return;
    control.disabled = true;
    control.textContent = 'Enabling tilt…';

    try {
      const result = await OrientationEvent.requestPermission();
      permissionGranted = result === 'granted';
      permissionDenied = !permissionGranted;
      if (permissionGranted) {
        attach();
        control.textContent = 'Tilt enabled';
        hideTimer = setTimeout(() => { control.hidden = true; }, 900);
      } else {
        control.textContent = 'Tilt unavailable';
        hideTimer = setTimeout(() => { control.hidden = true; }, 1400);
      }
    } catch {
      permissionDenied = true;
      control.textContent = 'Tilt unavailable';
      hideTimer = setTimeout(() => { control.hidden = true; }, 1400);
    }
  };

  const refresh = () => {
    if (!eligible()) {
      detach();
      updateControl();
      return;
    }

    if (needsPermission() && !permissionGranted) {
      updateControl();
    } else {
      attach();
      updateControl();
    }
  };

  control?.addEventListener('click', requestPermission);
  refresh();

  return {
    refresh,
    destroy: () => {
      clearTimeout(hideTimer);
      control?.removeEventListener('click', requestPermission);
      detach();
    },
  };
}
