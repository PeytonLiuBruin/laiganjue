import { add, dot } from './geometry.js';
// 风格化手游画风：清晰轮廓 + 柔和两段明暗。暗部偏冷紫、亮部偏暖，金色自动带高光，
// 轮廓线取自物体本色加深，整体饱和而不刺眼。palette.toon=false 可退回旧版柔和写实光照。
export const DEFAULT_PALETTE = {
  accent: '#8a473e', text: '#333932', ink: '#3b382f',
  metal: '#f0b43c', stone: '#fbefd2', glass: '#86cdf0', dark: false,
  toon: true, outline: '#3a2420',
};
export function rgb(hex) {
  if (/^#[a-f\d]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c+c).join('');
  return /^#[a-f\d]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i, i+2),16)) : [160,150,130];
}
export function rgba(color, opacity) { return `rgba(${rgb(color).join(',')},${opacity})`; }
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = c => `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v)))).join(',')})`;
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const LIGHT = norm([-.42, .68, .6]), HALF = norm(add(LIGHT, [0, 0, 1]));
const SHADOW_TINT = [70, 50, 112], WARM = [255, 244, 218], RIM = [214, 230, 255];
/** 轮廓色：本色压暗并略偏紫褐，比纯黑更柔和。 */
export function edgeColor(color) { return css(mix(rgb(color).map(v => v * .34), [58, 30, 40], .35)); }
const glossCache = new Map();
// 金、黄铜一类（橙黄色相、饱和度高）自动当作金属，带更亮更集中的高光。
function glossOf(color) {
  if (glossCache.has(color)) return glossCache.get(color);
  const [r, g, b] = rgb(color).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), s = max ? (max - min) / max : 0;
  let h = 0; if (max !== min) h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  const gloss = h > 28 && h < 58 && s > .45 && max > .6 ? 1 : .3;
  glossCache.set(color, gloss); return gloss;
}
export function shadeColor(color, n) {
  const base = rgb(color), gloss = glossOf(color);
  const d = dot(n, LIGHT), wrap = clamp01((d + .45) / 1.45);
  const band = smooth(.40, .60, wrap) * .72 + wrap * .28;
  const dark = mix(base.map(v => v * .6), SHADOW_TINT, .17), lit = mix(base, WARM, .07);
  let col = mix(dark, lit, band);
  if (n[1] < -.4) col = col.map(v => v * .92);
  const spec = Math.pow(Math.max(0, dot(n, HALF)), gloss > .5 ? 26 : 10);
  col = mix(col, WARM, smooth(.42, .72, spec) * (gloss > .5 ? .62 : .18));
  col = mix(col, RIM, smooth(.78, .99, 1 - n[2]) * .16);
  return css(col);
}
export function createPainter(c, width, height, { pitch=.12, yaw=0, palette=DEFAULT_PALETTE }={}) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),fit=Math.min(width/350,height/340,1.22);
  const toon = palette.toon !== false, outline = palette.outline || DEFAULT_PALETTE.outline, ow = 2.6 * Math.max(.75, fit);
  const view = ([x,y,z]) => { const depth=z*cy-x*sy; return [x*cy+z*sy,y*cp-depth*sp,y*sp+depth*cp]; };
  const project = point => { const p=view(point), scale=fit*820/(820-p[2]); return [width/2+p[0]*scale,height/2-p[1]*scale,p[2],scale]; };
  function path(points, close=true) {
    c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1])); if(close)c.closePath();
  }
  function mesh(faces, { outlined = toon } = {}) {
    const visible=faces.map(f=>({...f, n:view(f.normal), depth:f.points.reduce((s,p)=>s+view(p)[2],0)/f.points.length})).filter(f=>f.n[2]>.001).sort((a,b)=>a.depth-b.depth);
    const shapes = visible.map(f => f.points.map(project));
    if (outlined) {
      // 先以粗线铺一层轮廓色，再画各面，最后只剩外轮廓露在外面。
      c.save(); c.lineWidth = ow; c.lineJoin = 'round';
      visible.forEach((f, i) => { c.fillStyle = c.strokeStyle = edgeColor(f.color); path(shapes[i]); c.fill(); c.stroke(); });
      c.restore();
    }
    visible.forEach((f, i) => {
      path(shapes[i]);
      if (toon) c.fillStyle = shadeColor(f.color, f.n);
      else { const lit=.60+Math.max(0,dot(f.n,[-.35,.5,.79]))*.45; c.fillStyle=css(rgb(f.color).map(v=>v*lit)); }
      c.fill(); c.strokeStyle=c.fillStyle; c.lineWidth=.7; c.stroke();
    });
  }
  /** 线条：绳索、木杆、枝干。粗线带轮廓，shine 时沿上缘加一道细高光。 */
  function line(points,color=palette.metal,width=1,opacity=1,{ outlined = toon && width >= 2, shine = toon && width >= 4 } = {}) {
    c.save();c.globalAlpha=opacity;c.lineJoin='round';c.lineCap='round';
    const pts=points.map(project);
    if (outlined) { path(pts,false); c.strokeStyle=edgeColor(color); c.lineWidth=width+ow*1.1; c.stroke(); }
    path(pts,false);c.strokeStyle=color;c.lineWidth=width;c.stroke();
    if (shine) {
      c.translate(-width*.18,-width*.22); path(pts,false);
      c.strokeStyle=css(mix(rgb(color),WARM,.45));c.globalAlpha=opacity*.7;c.lineWidth=Math.max(1,width*.26);c.stroke();
    }
    c.restore();
  }
  function ring(radius,y,color=palette.metal,opacity=1) {
    line(Array.from({length:97},(_,i)=>[Math.sin(i/96*Math.PI*2)*radius,y,-Math.cos(i/96*Math.PI*2)*radius]),color,1,opacity);
  }
  function text(value,position,{size=14,color=palette.text,u=[1,0,0],v=[0,1,0],weight=500,alpha=1,stroke=toon&&weight>=700?edgeColor(color):null,depth=toon&&weight>=700}={}) {
    const p=project(position),pu=project(add(position,u)),pv=project(add(position,v));
    c.save();c.globalAlpha=alpha;c.transform(pu[0]-p[0],pu[1]-p[1],p[0]-pv[0],p[1]-pv[1],p[0],p[1]);
    c.font=`${weight} ${size}px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif`;c.textAlign='center';c.textBaseline='middle';
    if(stroke){
      c.lineJoin='round';c.lineWidth=Math.max(2.2,size*.18);c.strokeStyle=stroke;
      if(depth){c.fillStyle=stroke;c.fillText(String(value),0,size*.07);c.strokeText(String(value),0,size*.07);}
      c.strokeText(String(value),0,0);
    }
    c.fillStyle=color;c.fillText(String(value),0,0);
    if(depth){c.save();c.beginPath();c.rect(-size*2,-size,size*4,size*.42);c.clip();c.fillStyle='rgba(255,255,255,.28)';c.fillText(String(value),0,0);c.restore();}
    c.restore();
  }
  function glow(point,radius,color,opacity=.3) {
    const p=project(point),r=Math.max(1,radius*p[3]);
    const g=c.createRadialGradient(p[0],p[1],0,p[0],p[1],r);g.addColorStop(0,rgba(color,opacity));g.addColorStop(1,rgba(color,0));
    c.fillStyle=g;c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);c.fill();
  }
  function shadow(point,radius=90,opacity=.16) {
    const p=project(point),r=radius*p[3];c.save();c.translate(p[0],p[1]);c.scale(1,.26);
    const g=c.createRadialGradient(0,0,1,0,0,r);
    if (toon) { g.addColorStop(0,`rgba(60,40,70,${opacity*1.25})`);g.addColorStop(.55,`rgba(60,40,70,${opacity*.8})`); }
    else g.addColorStop(0,`rgba(32,29,26,${opacity})`);
    g.addColorStop(1,'rgba(60,40,70,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
    if (toon) { // 贴地的接触阴影，让物体「坐」在地上
      const k=c.createRadialGradient(0,0,1,0,0,r*.55);k.addColorStop(0,`rgba(50,30,50,${opacity*.9})`);k.addColorStop(1,'rgba(50,30,50,0)');
      c.fillStyle=k;c.beginPath();c.arc(0,0,r*.55,0,Math.PI*2);c.fill();
    }
    c.restore();
  }
  /** 球体：径向渐变明暗、冷色暗部、暖色高光点、本色轮廓。树冠、云朵、珠子都用它。 */
  function blob(point,radius,color,{ shine = true, outlined = toon, edge = null, shade = .62 } = {}) {
    const p=project(point),r=Math.max(1,radius*p[3]),base=rgb(color);
    c.save();c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);
    if(outlined){c.lineWidth=ow;c.strokeStyle=edge||edgeColor(color);c.stroke();}
    const g=c.createRadialGradient(p[0]-r*.38,p[1]-r*.42,r*.05,p[0]-r*.1,p[1]-r*.1,r*1.12);
    g.addColorStop(0,css(mix(base,WARM,.22)));g.addColorStop(.48,css(base));
    g.addColorStop(.78,css(mix(base.map(v=>v*shade),SHADOW_TINT,.16)));g.addColorStop(1,css(mix(base.map(v=>v*(shade-.06)),SHADOW_TINT,.24)));
    c.fillStyle=g;c.fill();c.restore();
    if(shine){c.save();c.fillStyle='rgba(255,252,240,.82)';c.beginPath();c.ellipse(p[0]-r*.4,p[1]-r*.44,r*.2,r*.11,-.7,0,Math.PI*2);c.fill();
      c.globalAlpha=.6;c.beginPath();c.arc(p[0]-r*.13,p[1]-r*.56,r*.05,0,Math.PI*2);c.fill();c.restore();}
  }
  /** 平面多边形（印文、钱孔、刻线），不受光照，只按给定颜色填充。 */
  function face(points,color,{ stroke = null, width = 1, opacity = 1 } = {}) {
    c.save();c.globalAlpha=opacity;path(points.map(project));c.fillStyle=color;c.fill();
    if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.stroke();}c.restore();
  }
  /** 四角闪光星：中心白、外缘金，轮廓为暖金色，身后一圈柔光。 */
  function sparkle(point,size,color='#ffe9a6',opacity=1) {
    const p=project(point),r=size*p[3];if(r<.5||opacity<=0)return;
    c.save();c.globalAlpha=opacity;c.translate(p[0],p[1]);
    const halo=c.createRadialGradient(0,0,0,0,0,r*1.3);halo.addColorStop(0,rgba(color,.45));halo.addColorStop(1,rgba(color,0));
    c.fillStyle=halo;c.beginPath();c.arc(0,0,r*1.3,0,Math.PI*2);c.fill();
    c.beginPath();
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2-Math.PI/2,rr=i%2?r*.24:r;c[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}
    c.closePath();
    if(toon){c.lineJoin='round';c.lineWidth=Math.max(1.2,ow*.5);c.strokeStyle=css(mix(rgb(color),[150,80,20],.6));c.stroke();}
    const g=c.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,'#ffffff');g.addColorStop(.45,'#fffbea');g.addColorStop(1,color);
    c.fillStyle=g;c.fill();c.restore();
  }
  return {c,width,height,palette,project,view,mesh,line,ring,text,glow,shadow,path,blob,face,sparkle,outline,ow,fit};
}
