import { mul, unit, multiply, axisAngle, supportHeight, IDENTITY } from './solids.js';
const STEP = 1 / 120, GRAVITY = 880;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const random = n => { const v = Math.sin(n * 91.345 + 17.13) * 47453.23; return v - Math.floor(v); };
export function rotationError(q, target) {
  let e = unit(multiply(target, [-q[0],-q[1],-q[2],q[3]]));
  if (e[3] < 0) e = mul(e,-1);
  const angle = 2 * Math.atan2(Math.hypot(...e.slice(0,3)),clamp(e[3],-1,1));
  return { vector: mul(unit(e.slice(0,3)), angle), angle };
}
export function springRotation(q, w, target, dt, stiffness = 65, damping = 13) {
  const error = rotationError(q,target);
  const velocity = w.map((v,i) => v + (error.vector[i]*stiffness-v*damping)*dt);
  return { q: unit(multiply(axisAngle(velocity,Math.hypot(...velocity)*dt),q)), w: velocity, error: error.angle };
}

// Semi-implicit rigid motion with gravity, restitution and rolling friction.
// The chosen face is guided only after impact dissipates the flight energy;
// position never interpolates back to a layout slot and contact drives feedback.
export function createThrowPhysics(objects, targets, { power=1, height=115*Math.min(1.15,power), worldWidth=350, seed=1 }={}) {
  let elapsed=0, accumulator=0, phase='flight', contacts=[];
  const bodies=objects.map((o,i)=>({
    o, target:targets[i]||IDENTITY, homeX:o.x, homeY:o.y,
    radius:o.size*Math.max(...o.mesh.flatMap(f=>f.points).map(p=>Math.hypot(...p))),
    vx:(random(seed+i*3)-.5)*42,
    vy:(random(seed+i*7)-.5)*26,
    vz:Math.sqrt(2*GRAVITY*height)*(1+random(seed+i)*.10),
    w:[8+random(seed+i*2)*7,(random(seed+i*4)-.5)*(o.kind==='coin'?2:10),2+random(seed+i*6)*4],
    z:supportHeight(o.mesh,o.q,o.size)+(o.lift||0),
    hits:0, rest:0, settled:false, age:0,
  }));
  function step(dt) {
    elapsed+=dt;
    for(const b of bodies){
      if(b.settled)continue;
      const o=b.o;b.age+=dt;
      b.vz-=GRAVITY*dt;b.z+=b.vz*dt;
      o.x+=b.vx*dt;o.y+=b.vy*dt;
      const radius=b.radius;
      // Reserve the perspective expansion of airborne objects on narrow trays.
      const xLimit=Math.max(Math.abs(b.homeX), worldWidth*.43-radius-7);
      const x=clamp(o.x,Math.max(-xLimit,b.homeX-26),Math.min(xLimit,b.homeX+26));
      const y=clamp(o.y,b.homeY-18,b.homeY+18);
      if(x!==o.x){b.vx*=-.25;o.x=x;}
      if(y!==o.y){b.vy*=-.25;o.y=y;}
      const grounded=b.z-supportHeight(o.mesh,o.q,o.size)<2;
      const guiding=(b.hits>0)&&b.age>.95&&grounded&&Math.abs(b.vz)<155;
      if(guiding){
        const next=springRotation(o.q,b.w,b.target,dt,42,8.5);o.q=next.q;b.w=next.w;
      } else {
        b.w=mul(b.w,Math.exp(-(grounded?.85:.10)*dt));
        o.q=unit(multiply(axisAngle(b.w,Math.hypot(...b.w)*dt*Math.min(1,b.age/.16)),o.q));
      }
      const support=supportHeight(o.mesh,o.q,o.size);
      if(b.z<support){
        b.z=support;
        if(b.vz< -32){
          contacts.push({index:bodies.indexOf(b),speed:-b.vz});b.hits++;
          b.vz=-b.vz*(o.kind==='coin'?.29:o.kind==='jiaobei'?.24:.31);
          b.w=mul(b.w,.66);b.vx*=.78;b.vy*=.78;
        } else b.vz=0;
        // Tangential motion slows by contact friction. No pulling to homeX/Y.
        const friction=Math.exp(-(guiding?8:3)*dt);b.vx*=friction;b.vy*=friction;
      }
      o.z=b.z;o.lift=Math.max(0,b.z-support);
      const error=rotationError(o.q,b.target).angle;
      b.rest=o.lift<.05&&Math.abs(b.vz)<2&&Math.hypot(b.vx,b.vy)<2&&Math.hypot(...b.w)<.045&&error<.004?b.rest+dt:0;
      if(b.rest>.16){b.settled=true;o.q=[...b.target];o.lift=0;o.z=supportHeight(o.mesh,o.q,o.size);}
    }
    // Resolve lateral contact only when the objects occupy the same height.
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];if(a.settled&&b.settled)continue;
      const dx=b.o.x-a.o.x,dy=b.o.y-a.o.y,d=Math.hypot(dx,dy),radius=(a.o.size+b.o.size)*.92;
      if(d>.001&&d<radius&&Math.abs(a.z-b.z)<Math.min(a.o.size,b.o.size)){
        const nx=dx/d,ny=dy/d,push=(radius-d)/2;
        a.o.x-=nx*push;a.o.y-=ny*push;b.o.x+=nx*push;b.o.y+=ny*push;
        const speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(speed<0){a.vx+=speed*.6*nx;a.vy+=speed*.6*ny;b.vx-=speed*.6*nx;b.vy-=speed*.6*ny;}
      }
    }
    phase=bodies.every(b=>b.settled)?'settled':bodies.every(b=>b.hits>0)?(bodies.every(b=>Math.abs(b.vz)<120)?'settling':'rolling'):'flight';
  }
  function advance(seconds){
    contacts=[];accumulator+=clamp(seconds,0,.08);
    while(accumulator+1e-9>=STEP){step(STEP);accumulator-=STEP;}
    return {phase,contacts,elapsed};
  }
  return {advance,bodies,get phase(){return phase;}};
}
