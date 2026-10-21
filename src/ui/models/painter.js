import { add, dot } from './geometry.js';
// 卡通手游风格：粗描边、分块明暗、饱和配色。toon:false 可退回柔和写实光照。
export const DEFAULT_PALETTE = {
  accent: '#8a473e', text: '#333932', ink: '#3b382f',
  metal: '#f2b33d', stone: '#fbefd2', glass: '#7cc6ee', dark: false,
  toon: true, outline: '#2e1c14',
};
export function rgb(hex) {
  if (/^#[a-f\d]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c+c).join('');
  return /^#[a-f\d]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i, i+2),16)) : [160,150,130];
}
export function rgba(color, opacity) { return `rgba(${rgb(color).join(',')},${opacity})`; }
const LIGHT = [-.35, .62, .70];
// 三段明暗：受光面提亮、过渡面原色、背光面压暗并略偏冷，色块分明。
function toonShade(base, n) {
  const d = dot(n, LIGHT);
  const k = d > .62 ? 1.16 : d > .18 ? 1 : .74;
  const top = n[1] > .82 ? 1.06 : 1;
  return base.map((v, i) => Math.min(255, Math.round(v * k * top + (k < 1 && i === 2 ? 10 : 0))));
}
export function createPainter(c, width, height, { pitch=.12, yaw=0, palette=DEFAULT_PALETTE }={}) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),fit=Math.min(width/350,height/340,1.22);
  const toon = palette.toon !== false, outline = palette.outline || DEFAULT_PALETTE.outline, ow = 3.4 * Math.max(.7, fit);
  const view = ([x,y,z]) => { const depth=z*cy-x*sy; return [x*cy+z*sy,y*cp-depth*sp,y*sp+depth*cp]; };
  const project = point => { const p=view(point), scale=fit*820/(820-p[2]); return [width/2+p[0]*scale,height/2-p[1]*scale,p[2],scale]; };
  function path(points, close=true) {
    c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1])); if(close)c.closePath();
  }
  function mesh(faces, { outlined = toon } = {}) {
    const visible=faces.map(f=>({...f, n:view(f.normal), depth:f.points.reduce((s,p)=>s+view(p)[2],0)/f.points.length})).filter(f=>f.n[2]>.001).sort((a,b)=>a.depth-b.depth);
    if (outlined) {
      // 描边：先把整组可见面以粗线铺一层深色，再画面本身，只留外轮廓。
      c.save(); c.fillStyle = c.strokeStyle = outline; c.lineWidth = ow; c.lineJoin = 'round';
      for (const f of visible) { path(f.points.map(project)); c.fill(); c.stroke(); }
      c.restore();
    }
    for(const f of visible){
      path(f.points.map(project));
      const base=rgb(f.color);
      const shade = toon ? toonShade(base, f.n) : (() => { const lit=.60+Math.max(0,dot(f.n,[-.35,.5,.79]))*.45; return base.map(v=>Math.min(255,Math.round(v*lit))); })();
      c.fillStyle=`rgb(${shade.join(',')})`;c.fill();
      c.strokeStyle=c.fillStyle;c.lineWidth=.6;c.stroke();
    }
  }
  function line(points,color=palette.metal,width=1,opacity=1,{ outlined = toon && width >= 2 } = {}) {
    c.save();c.globalAlpha=opacity;c.lineJoin='round';c.lineCap='round';
    const pts=points.map(project);
    if (outlined) { path(pts,false); c.strokeStyle=outline; c.lineWidth=width+ow*.9; c.stroke(); }
    path(pts,false);c.strokeStyle=color;c.lineWidth=width;c.stroke();c.restore();
  }
  function ring(radius,y,color=palette.metal,opacity=1) {
    line(Array.from({length:97},(_,i)=>[Math.sin(i/96*Math.PI*2)*radius,y,-Math.cos(i/96*Math.PI*2)*radius]),color,1,opacity);
  }
  function text(value,position,{size=14,color=palette.text,u=[1,0,0],v=[0,1,0],weight=500,alpha=1,stroke=toon&&weight>=700?outline:null}={}) {
    const p=project(position),pu=project(add(position,u)),pv=project(add(position,v));
    c.save();c.globalAlpha=alpha;c.transform(pu[0]-p[0],pu[1]-p[1],p[0]-pv[0],p[1]-pv[1],p[0],p[1]);
    c.font=`${weight} ${size}px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif`;c.textAlign='center';c.textBaseline='middle';
    if(stroke){c.lineJoin='round';c.lineWidth=Math.max(2.5,size*.2);c.strokeStyle=stroke;c.strokeText(String(value),0,0);}
    c.fillStyle=color;c.fillText(String(value),0,0);c.restore();
  }
  function glow(point,radius,color,opacity=.3) {
    const p=project(point),r=Math.max(1,radius*p[3]);
    const g=c.createRadialGradient(p[0],p[1],0,p[0],p[1],r);g.addColorStop(0,rgba(color,opacity));g.addColorStop(1,rgba(color,0));
    c.fillStyle=g;c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);c.fill();
  }
  function shadow(point,radius=90,opacity=.16) {
    const p=project(point),r=radius*p[3];c.save();c.translate(p[0],p[1]);c.scale(1,.24);
    const g=c.createRadialGradient(0,0,1,0,0,r);
    if (toon) { g.addColorStop(0,`rgba(46,28,20,${opacity*1.5})`);g.addColorStop(.72,`rgba(46,28,20,${opacity*1.3})`); }
    else g.addColorStop(0,`rgba(32,29,26,${opacity})`);
    g.addColorStop(1,'rgba(32,29,26,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();
  }
  // 卡通球：纯色圆、背光月牙、高光点、粗描边。树冠、云朵、珠子都用它。
  function blob(point,radius,color,{ shade = true, shine = true, outlined = toon } = {}) {
    const p=project(point),r=Math.max(1,radius*p[3]);
    c.save();c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);
    if(outlined){c.lineWidth=ow;c.strokeStyle=outline;c.stroke();}
    c.fillStyle=color;c.fill();
    if(shade){c.clip();c.beginPath();c.arc(p[0]-r*.28,p[1]-r*.32,r*1.08,0,Math.PI*2);c.rect(p[0]-r*2,p[1]-r*2,r*4,r*4);
      const b=rgb(color).map(v=>Math.round(v*.76));c.fillStyle=`rgb(${b.join(',')})`;c.fill('evenodd');}
    c.restore();
    if(shine){c.save();c.fillStyle='rgba(255,255,255,.75)';c.beginPath();c.ellipse(p[0]-r*.36,p[1]-r*.4,r*.22,r*.13,-.6,0,Math.PI*2);c.fill();c.restore();}
  }
  // 四角闪光星。
  function sparkle(point,size,color='#fff6c8',opacity=1) {
    const p=project(point),r=size*p[3];if(r<.5||opacity<=0)return;
    c.save();c.globalAlpha=opacity;c.translate(p[0],p[1]);c.beginPath();
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2-Math.PI/2,rr=i%2?r*.28:r;c[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}
    c.closePath();
    if(toon){c.lineJoin='round';c.lineWidth=Math.max(1.5,ow*.6);c.strokeStyle=outline;c.stroke();}
    c.fillStyle=color;c.fill();c.restore();
  }
  return {c,width,height,palette,project,mesh,line,ring,text,glow,shadow,path,blob,sparkle,outline,ow};
}
