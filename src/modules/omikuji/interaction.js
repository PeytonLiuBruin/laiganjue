// The visible rope is a forgiving drop target on both touch and mouse screens.
export function overRope(point, rect) {
  return !point.cancelled && point.x >= rect.left - 16 && point.x <= rect.right + 16 && point.y >= rect.top - 12 && point.y <= rect.bottom + 24;
}
