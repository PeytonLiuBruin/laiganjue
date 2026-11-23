import { createStickPhysics } from '../core/stick-physics.js';
import { box, lathe, transformed, axisAngle, rotate, add } from './models/geometry.js';
import { createPainter } from './models/painter.js';

// 卡通色板（visual-direction.md）：灵签筒是朱漆圆筒配金箍（第 34 轮由暖木改，土棕在三段明暗下发闷），御神签筒是朱红六角筒配金箍，签条为亮竹黄、签头朱红。
const wood = '#d8402e', lacquer = '#e8463c', bamboo = '#f6d68a', bamboo2 = '#ecbf62', red = '#e8463c', gold = '#ffc93c';
// 签条尺寸：筒里的签细一些才插得下，掉出来平躺的那根加粗，俯角下仍是一根胖签。
export const STICK_IN = { w: 5.8, d: 3.8, tip: 18 };
export const STICK_FREE = { w: 12, d: 9, tip: 26 };
// 签号胶囊：白底、深墨描边、下沉厚边、圆体 900 朱红字（visual-direction.md 第 3 节）。
export const LABEL_CHIP = { size: 16, padX: 10, h: 28, line: 2, edge: 3, ink: '#2b2240', fill: '#ffffff', text: '#d8402e' };
const meshes = new Map();
function tubeMesh(half, closed) {
  const key = String(closed);
  if (meshes.has(key)) return meshes.get(key);
  // The Japanese cylinder has a closed top and an actual narrow bottom outlet.
  // The Chinese cylinder has an open rim and dark, recessed inner walls.
  const radius = closed ? 38 : 42, n = closed ? 6 : 40;
  const profile = closed ? [[4,-half],[radius,-half],[radius,half],[0,half]]
    : [[0,-half],[radius,-half],[radius,half],[radius-4,half],[radius-4,-half+5],[0,-half+5]];
  const body = lathe(profile, closed ? lacquer : wood, n);
  const rings = [-half + 9, half - 13].flatMap(y => lathe([[radius+1.2,y],[radius+1.2,y+6]], gold, n));
  const inside = closed ? [] : lathe([[radius-4,-half+5],[radius-4,half-1]], '#7a1a14', n);
  const mesh = [...body, ...inside, ...rings]; meshes.set(key, mesh); return mesh;
}
function labelChip(c, [x, y], text) {
  const k = LABEL_CHIP;
  c.save();
  c.font = `900 ${k.size}px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + k.padX * 2, h = k.h, r = h / 2, left = x - w / 2, top = y - h / 2;
  const pill = (dy) => { c.beginPath(); if (c.roundRect) c.roundRect(left, top + dy, w, h, r); else c.rect(left, top + dy, w, h); };
  pill(k.edge); c.fillStyle = k.ink; c.fill();
  pill(0); c.fillStyle = k.fill; c.fill(); c.lineWidth = k.line; c.strokeStyle = k.ink; c.stroke();
  c.fillStyle = k.text; c.fillText(text, x, y + 1);
  c.restore();
}
export function paintStickScene(c, width, height, sim, label = '') {
  c.clearRect(0, 0, width, height);
  const p = createPainter(c, width, height, { pitch: .21 });
  const tq = axisAngle([0,0,1], sim.tube.r), tp = [sim.tube.x, sim.tube.y, 0];
  p.shadow([sim.tube.x, -124, 0], 62, .20 / (1 + Math.max(0, sim.tube.y + sim.half - 20) / 220));
  if (sim.selected.free) { const s = sim.pose(sim.selected); p.shadow([s.x, -124, 0], 67, .12 / (1 + Math.max(0, s.y + 122) / 80)); }
  const faces = transformed(tubeMesh(sim.half, sim.kind === 'omikuji'), tq, tp);
  for (const b of sim.bodies) {
    if (sim.kind === 'omikuji' && b !== sim.selected) continue;
    const s = sim.pose(b), q = axisAngle([0,0,1], s.r), position = [s.x, s.y, s.z];
    // 第 72 轮：掉出来的那根签平躺时只剩一道细线，分享卡里像根火柴，加粗到 STICK_FREE 并加长朱红签头。
    const fat = b === sim.selected && b.free, dim = fat ? STICK_FREE : STICK_IN;
    const stick = box(dim.w, b.length, dim.d, b.id % 3 ? bamboo : bamboo2);
    const tip = transformed(box(dim.w + .2, dim.tip, dim.d + .2), [0,0,0,1], [0,b.length/2-dim.tip/2,0]).map(f => ({...f,color:red}));
    faces.push(...transformed([...stick, ...tip], q, position));
  }
  p.mesh(faces);
  const labelPos = add(rotate([0,0,sim.kind === 'omikuji' ? 34 : 42.5], tq), tp);
  const u = rotate([1,0,0], tq), v = rotate([0,1,0], tq);
  const title = sim.kind === 'omikuji' ? ['御','神','签'] : ['灵','签'];
  title.forEach((ch,i) => p.text(ch, add(labelPos, rotate([0,(title.length/2-.5-i)*22,0],tq)), {size:21,color:'#fff4d6',u,v,weight:800}));
  if (label && sim.selected.free) {
    const s = sim.pose(sim.selected);
    // 签号不写在签上（5px 看不清），在平躺的签下方放一枚描边厚边胶囊。
    labelChip(c, p.project([s.x, -150, s.z]), label);
  }
  return p;
}

export function createStickScene(ctx, canvas, { kind = 'qian', pickTarget } = {}) {
  const c = canvas.getContext('2d');
  let sim = createStickPhysics({kind}), frame=0, last=null, alive=true, pending=null, width=350, height=400;
  let label='', previewUntil=0, lastSound=-1, seed=1;
  function render() {
    if (!c || !alive) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); c.setTransform(dpr,0,0,dpr,0,0);
    const p=paintStickScene(c,width,height,sim,label);
    if(pickTarget && sim.selected.free){
      const s=sim.pose(sim.selected), pos=p.project([s.x,s.y,s.z]);
      const radius=sim.selected.length*pos[3]/2;
      pickTarget.style.left=Math.max(0,pos[0]-radius-8)+'px';pickTarget.style.top=pos[1]-23+'px';
      pickTarget.style.width=Math.min(width-pos[0]+radius, radius*2+16)+'px';
    }
  }
  function resize() {
    const r=canvas.getBoundingClientRect(); if(r.width>0&&r.height>0){width=r.width;height=r.height;}
    const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);render();
  }
  function schedule(){if(alive&&!frame&&!document.hidden)frame=requestAnimationFrame(tick);}
  function tick(now) {
    frame=0;if(!alive||document.hidden){last=null;return;}
    const dt=last===null?1/120:Math.min(.064,(now-last)/1000);last=now;
    const state=sim.advance(dt);canvas.dataset.phase=state.phase;
    const contact=state.contacts.sort((a,b)=>b.speed-a.speed)[0];
    if(contact&&sim.time-lastSound>(contact.source==='table'?.09:.11)){
      const strength=Math.min(1,contact.speed/420);ctx.sound.play(contact.source==='table'?(strength>.3?'clack':'tick'):'bamboo');
      ctx.haptic.impact(contact.source==='table'?strength:strength*.18);lastSound=sim.time;
    }
    render();
    if(state.phase==='settled'&&pending){const resolve=pending;pending=null;ctx.haptic.settle();resolve(true);}
    if(pending||performance.now()<previewUntil){schedule();}else last=null;
  }
  function feed(sample){
    const force=Math.hypot(sample.ax||0,sample.ay||0,sample.az||0);
    if(!pending&&!frame&&force<.4)return;
    sim.feed(sample);if(force>.4)previewUntil=performance.now()+700;schedule();
  }
  function preview(ax=0){feed({ax});}
  function draw({power=1,continuous=false,replay=true}={}){
    if(pending||!alive)return Promise.resolve(false);
    if(!sim.begin({power,continuous,replay}))return Promise.resolve(false);
    label='';canvas.removeAttribute('data-value');schedule();return new Promise(resolve=>{pending=resolve;});
  }
  function reset(){pending?.(false);pending=null;cancelAnimationFrame(frame);frame=0;last=null;lastSound=-1;label='';sim=createStickPhysics({kind,seed:++seed});canvas.dataset.phase='idle';canvas.removeAttribute('data-value');render();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=null;}else if(pending)schedule();};
  document.addEventListener('visibilitychange',visibility);resize();
  ctx.addCleanup(()=>{alive=false;cancelAnimationFrame(frame);pending?.(false);pending=null;resizeObserver.disconnect();document.removeEventListener('visibilitychange',visibility);});
  return {draw,feed,preview,reset,setLabel(value){label=String(value);canvas.dataset.value=label;render();},get phase(){return sim.phase;}};
}
