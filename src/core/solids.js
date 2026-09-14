// Meshes and orientations shared by the renderer and geometry tests. Z is up.
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const mul = (v, s) => v.map((n) => n * s);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const unit = (v) => mul(v, 1 / (Math.hypot(...v) || 1));
export const IDENTITY = [0, 0, 0, 1];
export function axisAngle(axis, angle) { return [...mul(unit(axis), Math.sin(angle / 2)), Math.cos(angle / 2)]; }
export function multiply(a, b) {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];
}
export function rotate(v, q) {
  const u=q.slice(0,3), t=mul(cross(u,v),2);
  return add(v,add(mul(t,q[3]),cross(u,t)));
}
export function mixRotation(a,b,t) {
  const sign=dot(a,b)<0?-1:1;
  return unit(a.map((v,i)=>v*(1-t)+b[i]*sign*t));
}
export function face(points, ink = null, material = 'ivory') {
  let normal=unit(cross(add(points[1],mul(points[0],-1)),add(points[2],mul(points[0],-1))));
  const center=mul(points.reduce(add,[0,0,0]),1/points.length);
  if(dot(normal,center)<0) { points=[...points].reverse(); normal=mul(normal,-1); }
  let u=unit(add(points[1],mul(points[0],-1)));
  const v=unit(cross(normal,u));
  return {points,normal,center,u,v,ink,material};
}
export function cubeMesh() {
  const b=.86, faces=[];
  const values=[[5,2],[4,3],[6,1]];
  for(let a=0;a<3;a++)for(const sign of [-1,1]) {
    const axes=[0,1,2].filter(i=>i!==a);
    const pts=[[-b,-b],[b,-b],[b,b],[-b,b]].map(([u,v])=>{const p=[0,0,0];p[a]=sign;p[axes[0]]=u;p[axes[1]]=v;return p;});
    faces.push(face(pts,{type:'pips',value:values[a][sign>0?1:0]}));
  }
  for(let a=0;a<3;a++)for(let bAxis=a+1;bAxis<3;bAxis++)for(const sa of [-1,1])for(const sb of [-1,1]){
    const c=3-a-bAxis;
    const pts=[[1,b,-b],[1,b,b],[b,1,b],[b,1,-b]].map(([x,y,z])=>{const p=[0,0,0];p[a]=x*sa;p[bAxis]=y*sb;p[c]=z;return p;});
    faces.push(face(pts,null,'edge'));
  }
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])faces.push(face([[x,b*y,b*z],[b*x,y,b*z],[b*x,b*y,z]],null,'edge'));
  return faces;
}
export function d20Mesh() {
  const g=(1+Math.sqrt(5))/2;
  const vertices=[[-1,g,0],[1,g,0],[-1,-g,0],[1,-g,0],[0,-1,g],[0,1,g],[0,-1,-g],[0,1,-g],[g,0,-1],[g,0,1],[-g,0,-1],[-g,0,1]].map(unit);
  const indices=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  // Assign opposite faces to complementary pairs, as on a physical D20.
  const faces=indices.map(v=>face(v.map(i=>vertices[i]))), assigned=new Set();
  let n=1;
  for(let i=0;i<faces.length;i++)if(!assigned.has(i)){
    let opposite=0, score=1;
    faces.forEach((f,j)=>{const d=dot(f.normal,faces[i].normal);if(d<score){opposite=j;score=d;}});
    faces[i].ink={type:'number',value:n};faces[opposite].ink={type:'number',value:21-n};
    assigned.add(i);assigned.add(opposite);n++;
  }
  return faces;
}
export function coinMesh() {
  const faces=[], n=48, at=(a,r,z)=>[Math.cos(a)*r,Math.sin(a)*r,z];
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
    const hole=t=>.18/Math.max(Math.abs(Math.cos(t)),Math.abs(Math.sin(t)));
    for(const z of [-.085,.085])faces.push(face([at(a,1,z),at(b,1,z),at(b,hole(b),z),at(a,hole(a),z)],null,'brass'));
    faces.push(face([at(a,1,-.085),at(b,1,-.085),at(b,1,.085),at(a,1,.085)],null,i%2?'brass':'gold-edge'));
    const inner = face([at(a,hole(a),.085),at(b,hole(b),.085),at(b,hole(b),-.085),at(a,hole(a),-.085)],null,'gold-edge');
    // The hole is a concave surface: its visible normal points into the hole.
    inner.normal = mul(inner.normal, -1); inner.points.reverse();
    faces.push(inner);
  }
  return faces;
}
export function faceUp(mesh, value) {
  const f=mesh.find(f=>f.ink?.value===value);
  if(!f)return IDENTITY;
  const n=f.normal, d=dot(n,[0,0,1]);
  const q=d<-.99999?axisAngle([1,0,0],Math.PI):unit([...cross(n,[0,0,1]),1+d]);
  const u=rotate(f.u,q);
  return multiply(axisAngle([0,0,1],-Math.atan2(u[1],u[0])),q);
}
export function supportHeight(mesh,q,size) {
  return -Math.min(...mesh.flatMap(f=>f.points.map(p=>rotate(p,q)[2]*size)));
}

export const CONTACTS=[.30,.48,.63,.92];
export const flightHeight = (height, power) => Math.min(125, height * .32) * Math.min(1.15, power);
export function projectSolidPoint(point, width, height, ground = .76, worldWidth = 350) {
  const p = mul(point, Math.min(1, width / worldWidth, height / 320));
  const depth = dot(p, [0, -.6, .8]), perspective = 850 / (850 - depth);
  return [width / 2 + p[0] * perspective, height * ground + (-p[1] * .8 - p[2] * .6) * perspective, depth];
}
export function throwPose(t,{start=IDENTITY,target=IDENTITY,power=1,axis=[1,.45,.18],x=0,y=0,drift=18,height=150}={}) {
  t=Math.max(0,Math.min(1,t));
  const mix=Math.min(1,t/.7), base=mixRotation(start,target,mix*mix*(3-2*mix));
  const total=Math.PI*2*4;
  let angle;
  if(t<.3)angle=(total-Math.PI*2*1.4)*t/.3;
  else if(t<.63){const u=(t-.3)/.33;angle=total-(Math.PI*2*1.4*(1-u)+1.1*u);}
  else if(t<.82){const u=(t-.63)/.19;angle=total-(1.1*(1-u)+.68*u);}
  else {const u=(t-.82)/.18;angle=total-.68*(1-u)**2+Math.sin(u*Math.PI*2)*.13*(1-u);}
  const q=multiply(axisAngle(axis,angle),base);
  let lift=0;
  for(const [a,b,h] of [[0,.3,height],[.3,.48,38*power],[.48,.63,11*power]])if(t>=a&&t<=b){const u=(t-a)/(b-a);lift=4*h*u*(1-u);break;}
  const driftProgress=t<.3?t/.3:(1-t)/.7;
  return {q,x:x+Math.sin(t*Math.PI)*drift,y:y+driftProgress*10,lift,phase:t<.3?'flight':t<.63?'rolling':t<1?'settling':'settled'};
}
