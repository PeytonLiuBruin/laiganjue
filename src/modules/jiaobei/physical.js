import {createBlockMesh} from './model.js';
import {face,axisAngle,multiply} from '../../core/solids.js';
import {createSolidScene} from '../../ui/solid-scene.js';

export function createJiaobeiPhysical(canvas,ctx) {
  const mesh=createBlockMesh(28,10).map(f=>face(f.points,null,f.flat?'cut':'wood'));
  const scene=createSolidScene(canvas,ctx,{ground:.79});
  function reset(){scene.set([-1,1].map(side=>({kind:'jiaobei',mesh,size:43,x:side*65,y:side*8,q:multiply(axisAngle([0,0,1],side*.32),axisAngle([1,0,0],.14))})));}
  reset();
  return {reset,rest:scene.rest,preview:scene.preview,tilt:()=>{},dispose:scene.dispose,
    async toss(result,intensity,onPhase){
      const ok=await scene.throwTo([result.a,result.b],intensity,{duration:ctx.platform.simpleMotion?1700:3500,onPhase});
      if(ok)canvas.dataset.faces=`${result.a},${result.b}`;
      return ok;
    },
  };
}
