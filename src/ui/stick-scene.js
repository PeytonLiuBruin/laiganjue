import { createStickPhysics } from '../core/stick-physics.js';
import { box, lathe, transformed, axisAngle, rotate, add } from './models/geometry.js';
import { createPainter } from './models/painter.js';

const wood = '#a46b3d', bamboo = '#dfc397', red = '#994d3e';
const meshes = new Map();
function tubeMesh(half, closed) {
  const key = String(closed);
  if (meshes.has(key)) return meshes.get(key);
  // The Japanese cylinder has a closed top and an actual narrow bottom outlet.
  // The Chinese cylinder has an open rim and dark, recessed inner walls.
  const radius = closed ? 38 : 42, n = closed ? 6 : 40;
  const profile = closed ? [[4,-half],[radius,-half],[radius,half],[0,half]]
    : [[0,-half],[radius,-half],[radius,half],[radius-4,half],[radius-4,-half+5],[0,-half+5]];
  const body = lathe(profile, wood, n);
  const rings = [-half + 9, half - 13].flatMap(y => lathe([[radius+.7,y],[radius+.7,y+5]], '#7a4a2e', n));
  const inside = closed ? [] : lathe([[radius-4,-half+5],[radius-4,half-1]], '#63472f', n);
  const mesh = [...body, ...inside, ...rings]; meshes.set(key, mesh); return mesh;
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
    const stick = box(5.8, b.length, 3.8, b.id % 3 ? bamboo : '#c9a577');
    const tip = transformed(box(6, 18, 4), [0,0,0,1], [0,b.length/2-9,0]).map(f => ({...f,color:red}));
    faces.push(...transformed([...stick, ...tip], q, position));
  }
  p.mesh(faces);
  const labelPos = add(rotate([0,0,sim.kind === 'omikuji' ? 34 : 42.5], tq), tp);
  const u = rotate([1,0,0], tq), v = rotate([0,1,0], tq);
  const title = sim.kind === 'omikuji' ? ['御','神','签'] : ['灵','签'];
  title.forEach((ch,i) => p.text(ch, add(labelPos, rotate([0,(title.length/2-.5-i)*22,0],tq)), {size:19,color:'#f0dcc0',u,v}));
  if (label && sim.selected.free) {
    const s = sim.pose(sim.selected);
    // A small upright number beside the resting stick avoids illegible 5px type.
    p.text(label, [s.x, -148, s.z], {size:13,color:'#775742'});
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
