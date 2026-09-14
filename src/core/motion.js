// Continuous motion through chosen physical poses, with zero velocity at each
// contact/turning point. Keeping two nearby edge poses gives a visible hesitation.
export function motionCurve(t, stops) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [end, value] = stops[i], [start, from] = stops[i - 1];
    if (t <= end) {
      const u = (t - start) / (end - start), ease = u * u * (3 - 2 * u);
      return from + (value - from) * ease;
    }
  }
  return stops.at(-1)[1];
}
