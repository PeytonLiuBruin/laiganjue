import { add, dot } from './geometry.js';
export const DEFAULT_PALETTE = { accent: '#8a473e', text: '#333932', ink: '#3b382f', metal: '#b59b65', stone: '#e0d8c6', glass: '#829cac', dark: false };
export function rgb(hex) {
  if (/^#[a-f\d]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c+c).join('');
  return /^#[a-f\d]{6}$/i.test(hex) ? [1,3,5].map(i => parseInt(hex.slice(i, i+2),16)) : [160,150,130];
}
export function rgba(color, opacity) { return `rgba(${rgb(color).join(',')},${opacity})`; }
export function createPainter(c, width, height, { pitch=.12, yaw=0, palette=DEFAULT_PALETTE }={}) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),fit=Math.min(width/350,height/340,1.22);
  const view = ([x,y,z]) => { const depth=z*cy-x*sy; return [x*cy+z*sy,y*cp-depth*sp,y*sp+depth*cp]; };
  const project = point => { const p=view(point), scale=fit*820/(820-p[2]); return [width/2+p[0]*scale,height/2-p[1]*scale,p[2],scale]; };
  function path(points, close=true) {
    c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1])); if(close)c.closePath();
  }
  function mesh(faces) {
    const visible=faces.map(f=>({...f, n:view(f.normal), depth:f.points.reduce((s,p)=>s+view(p)[2],0)/f.points.length})).filter(f=>f.n[2]>.001).sort((a,b)=>a.depth-b.depth);
    for(const f of visible){
      path(f.points.map(project));
      const lit=.60+Math.max(0,dot(f.n,[-.35,.5,.79]))*.45, base=rgb(f.color);
      c.fillStyle=`rgb(${base.map(v=>Math.min(255,Math.round(v*lit))).join(',')})`;c.fill();
      c.strokeStyle=c.fillStyle;c.lineWidth=.55;c.stroke();
    }
  }
  function line(points,color=palette.metal,width=1,opacity=1) {
    c.save();c.globalAlpha=opacity;path(points.map(project),false);c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();c.restore();
  }
  function ring(radius,y,color=palette.metal,opacity=1) {
    line(Array.from({length:97},(_,i)=>[Math.sin(i/96*Math.PI*2)*radius,y,-Math.cos(i/96*Math.PI*2)*radius]),color,1,opacity);
  }
  function text(value,position,{size=14,color=palette.text,u=[1,0,0],v=[0,1,0],weight=500,alpha=1}={}) {
    const p=project(position),pu=project(add(position,u)),pv=project(add(position,v));
    c.save();c.globalAlpha=alpha;c.transform(pu[0]-p[0],pu[1]-p[1],p[0]-pv[0],p[1]-pv[1],p[0],p[1]);
    c.font=`${weight} ${size}px "Noto Serif SC", "Songti SC", serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(String(value),0,0);c.restore();
  }
  function glow(point,radius,color,opacity=.3) {
    const p=project(point),r=Math.max(1,radius*p[3]);
    const g=c.createRadialGradient(p[0],p[1],0,p[0],p[1],r);g.addColorStop(0,rgba(color,opacity));g.addColorStop(1,rgba(color,0));
    c.fillStyle=g;c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);c.fill();
  }
  function shadow(point,radius=90,opacity=.16) {
    const p=project(point),r=radius*p[3];c.save();c.translate(p[0],p[1]);c.scale(1,.24);
    const g=c.createRadialGradient(0,0,1,0,0,r);g.addColorStop(0,`rgba(32,29,26,${opacity})`);g.addColorStop(1,'rgba(32,29,26,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();
  }
  return {c,width,height,palette,project,mesh,line,ring,text,glow,shadow,path};
}
