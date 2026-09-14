// A card turns about its long edge. A release supplies angular momentum; the
// hand's spring torque carries it over and contact with the table dissipates it.
export function hingeMotion(start = 0, duration = 1.9) {
  const samples = [], step = 1 / 120;
  let angle = Math.max(0, Math.min(Math.PI, start)), speed = .35;
  for (let t = 0; t <= duration + step / 2; t += step) {
    samples.push({ offset: Math.min(1,t/duration), angle, lift: Math.max(0,Math.sin(angle))*26 });
    speed += ((Math.PI-angle)*19-speed*5.4)*step; angle += speed*step;
    if (angle > Math.PI) { angle = Math.PI; speed *= -.16; }
  }
  samples.push({offset:1,angle:Math.PI,lift:0});
  return samples;
}
