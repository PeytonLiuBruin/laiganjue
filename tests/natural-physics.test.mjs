import test from 'node:test';
import assert from 'node:assert/strict';
import {createStickPhysics,STICK_FLOOR} from '../src/core/stick-physics.js';
import {createThrowPhysics,rotationError} from '../src/core/throw-physics.js';
import {cubeMesh,d20Mesh,coinMesh,IDENTITY,axisAngle,faceUp,rotate,projectSolidPoint} from '../src/core/solids.js';
import {hingeMotion} from '../src/core/hinge-motion.js';

for(const kind of ['qian','omikuji']){
  test(`${kind}: the same rod clears the opening, falls under gravity and comes to rest without changing length`,()=>{
    for(const seed of [1,4,9]){
      const s=createStickPhysics({kind,seed});s.begin();let prev=s.pose(s.selected),maxStep=0,tableHits=0,flight=false;
      for(let i=0;i<1200&&s.phase!=='settled';i++){
        const state=s.advance(1/120),p=s.pose(s.selected);tableHits+=state.contacts.filter(c=>c.source==='table').length;
        maxStep=Math.max(maxStep,Math.hypot(p.x-prev.x,p.y-prev.y));prev=p;
        assert([p.x,p.y,p.r].every(Number.isFinite));
        if(s.selected.free){
          flight=true;const [a,b]=s.selected.ends;
          assert(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-s.selected.length)<.2);
          assert(s.selected.ends.every(p=>p.y>=STICK_FLOOR+2.99));
        }
      }
      assert(flight);assert.equal(s.phase,'settled');assert.equal(s.bodies.filter(b=>b.free).length,1);
      assert(maxStep<8,`teleport ${maxStep}`);assert(tableHits>=2);assert(s.time>3&&s.time<7);
    }
  });
  test(`${kind}: follows 12 seconds of raw motion; quiet begins release, a renewed shake interrupts preparation`,()=>{
    const s=createStickPhysics({kind});s.begin({continuous:true});
    for(let i=0;i<1440;i++){s.feed({ax:14*Math.sin(i/8),ay:8*Math.cos(i/7)});s.advance(1/120);assert.equal(s.phase,'shaking');}
    for(let i=0;i<48;i++)s.advance(1/120);
    assert.equal(s.phase,'preparing');const before=s.pose(s.selected);s.feed({ax:15});assert.equal(s.phase,'shaking');assert.deepEqual(s.pose(s.selected),before);
    for(let i=0;i<1000&&s.phase!=='settled';i++)s.advance(1/120);
    assert.equal(s.phase,'settled');
  });
  test(`${kind}: fixed timestep gives the same resting position at 30, 60 and 120 Hz`,()=>{
    const results=[];
    for(const fps of [30,60,120]){const s=createStickPhysics({kind,seed:9});s.begin();for(let i=0;i<fps*8;i++)s.advance(1/fps);results.push(s.pose(s.selected));}
    for(const p of results)assert(Math.hypot(p.x-results[0].x,p.y-results[0].y)<.001);
  });
}

test('throws have ballistic acceleration and impact-driven bounces, then damp into the requested face',()=>{
  for(const [kind,mesh,size,value] of [['dice',cubeMesh(),30,5],['dice',d20Mesh(),44,18],['coin',coinMesh(),68,0]])for(const seed of [1,5,8]){
    const o={kind,mesh,size,x:0,y:0,q:IDENTITY,lift:0},target=kind==='coin'?axisAngle([1,0,0],Math.PI):faceUp(mesh,value);
    const s=createThrowPhysics([o],[target],{seed});let impacts=0;const early=[];let firstX=0;
    for(let i=0;i<1000&&s.phase!=='settled';i++){
      const state=s.advance(1/120);impacts+=state.contacts.length;
      assert([...o.q,o.x,o.y,o.z,o.lift].every(Number.isFinite));assert(o.lift>=0);
      if(i<20)early.push(s.bodies[0].vz);
      if(i===30)firstX=o.x;
    }
    assert.equal(s.phase,'settled');assert(impacts>=2);assert(rotationError(o.q,target).angle<1e-8);
    assert(early.slice(1).every((v,i)=>Math.abs(v-early[i]+880/120)<.001));
    assert(Math.abs(o.x)>=Math.abs(firstX)-.01,'should not drift back to a layout slot');
  }
});

test('strong D6/D20 and coin throws fit a 320px phone throughout their actual trajectories',()=>{
  for(const [kind,mesh,size,value,x] of [['dice',cubeMesh(),30,6,92],['dice',d20Mesh(),44,20,92],['coin',coinMesh(),68,0,0]])for(const seed of [2,3,9]){
    const o={kind,mesh,size,x,y:0,q:IDENTITY,lift:0},target=kind==='coin'?axisAngle([1,0,0],Math.PI):faceUp(mesh,value);
    const s=createThrowPhysics([o],[target],{seed,height:115});
    for(let i=0;i<360;i++){
      s.advance(1/60);if(i%3)continue;
      for(const f of mesh)for(const v of f.points){const p=rotate(v,o.q).map(n=>n*size);p[0]+=o.x;p[1]+=o.y;p[2]+=o.z;const [sx,sy]=projectSolidPoint(p,288,300);assert(sx>=0&&sx<=288&&sy>=0&&sy<=300,`cropped ${kind} ${sx},${sy}`);}
    }
  }
});

test('card hinge keeps angular motion through edge-on, and releases from an existing drag angle',()=>{
  const frames=hingeMotion(.8);
  assert.equal(frames[0].angle,.8);assert.equal(frames.at(-1).angle,Math.PI);
  const middle=frames.filter(f=>f.angle>1.3&&f.angle<1.9);
  assert(middle.length>1);assert(middle.slice(1).every((f,i)=>f.angle-middle[i].angle>.004));
  assert(frames.every(f=>f.angle<=Math.PI&&f.lift>=0));
});
