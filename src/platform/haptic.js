// Vibration duration is the portable control; browsers do not expose amplitude.
// Feature support does not prove a motor is present. Settings include a test.
export function createHaptic(storage, nav = globalThis.navigator, doc = globalThis.document, now = () => performance.now()) {
  let enabled = storage.get('haptic', true), lastPulse = -Infinity;
  const supported = typeof nav?.vibrate === 'function';
  const cancel = () => { if (supported) { try { nav.vibrate(0); } catch { /* unavailable */ } } };
  const pattern = (p) => {
    if (!enabled || !supported || doc?.hidden || nav.userActivation?.hasBeenActive === false) return false;
    try {
      const sent = nav.vibrate(p);
      if (sent) lastPulse = now() + (Array.isArray(p) ? p.reduce((sum, ms) => sum + ms, 0) : 0);
      return sent;
    } catch { return false; }
  };
  // Several dice can land within one frame. Keep one crisp contact instead of
  // restarting the motor for every object and truncating all of the pulses.
  const pulse = (ms) => {
    const t = now();
    if (t - lastPulse < 55) return false;
    const sent = pattern(ms);
    if (sent) lastPulse = t;
    return sent;
  };
  doc?.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); });
  return {
    pattern, cancel,
    tap: () => pulse(16), light: () => pulse(24), medium: () => pulse(42), heavy: () => pulse(65),
    release: () => pulse(24),
    impact: (strength = 1) => pulse(Math.round(18 + 36 * Math.max(0, Math.min(1, strength)))),
    settle: () => pattern([22, 65, 36]),
    success: () => pattern([28, 65, 42]),
    double: () => pattern([24, 70, 24]),
    rattle: () => pattern([18, 40, 18, 40, 18]),
    get enabled() { return enabled; },
    get supported() { return supported; },
    setEnabled(value) { enabled = !!value; storage.set('haptic', enabled); if (!enabled) cancel(); },
  };
}
