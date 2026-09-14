import test from 'node:test';
import assert from 'node:assert/strict';
import { lathe, torus, box, transformed, pendulumPosition, pillarPose, projectModel, add } from '../src/ui/models/geometry.js';
import { MODEL_IDS } from '../src/ui/models/index.js';

test('all five playable objects have built-in models',()=>{
  assert.deepEqual(MODEL_IDS,['fengshui.compass','crystal.ball','crystal.pendulum','zodiac.sky','bazi.pillars']);
});
test('model surfaces have finite unit normals, including lathe poles',()=>{
  for(const mesh of [lathe([[0,-30],[17,5],[17,13],[8,23],[0,23]],'#aaa',6),torus(106,2,'#aaa'),box(49,164,28,'#aaa')])for(const face of mesh){
    assert(face.points.length>=3);assert(face.points.flat().every(Number.isFinite));
    assert(Math.abs(Math.hypot(...face.normal)-1)<1e-8);
  }
});
test('pendulum stays attached to a constant-length chain and remains inside a narrow scene',()=>{
  for(const width of[258,320,572])for(let x=-1;x<=1;x+=.2)for(let y=-1;y<=1;y+=.2){
    const bob=pendulumPosition(x,y);
    assert(Math.abs(Math.hypot(bob[0],126-bob[1],bob[2])-142)<1e-8);
    for(const point of[[0,126,0],add(bob,[0,-33,0]),add(bob,[17,23,0]),add(bob,[-17,23,0])]){
      const [sx,sy]=projectModel(point,width,330,.38);assert(sx>0&&sx<width&&sy>0&&sy<330);
    }
  }
});
test('all four pillars stay visible while turning, then present the front face',()=>{
  for(const width of[258,320,572])for(let frame=0;frame<=60;frame++)for(let i=0;i<4;i++){
    const pose=pillarPose(i,frame/60);
    for(const face of transformed(box(52,170,31,'#aaa'),pose.rotation,pose.position))for(const point of face.points){
      const [x,y]=projectModel(point,width,330,.1);assert(x>0&&x<width&&y>0&&y<330);
    }
    if(frame===60)assert(pose.visible);
  }
});
