import {createBlockMesh} from './model.js';
import {face,axisAngle,multiply,projectSolidPoint} from '../../core/solids.js';
import {createSolidScene} from '../../ui/solid-scene.js';
import {LAYOUT} from './layout.js';

// 尺寸、落点、地面线都在 layout.js 里按「世界单位」定义；画布按实际宽高等比缩放（见 solid-scene）。
const {GROUND,WORLD,SIZE,HOME_X,HOME_Y}=LAYOUT;

export function createJiaobeiPhysical(canvas,ctx) {
  const mesh=createBlockMesh(28,10).map(f=>face(f.points,null,f.flat?'cut':'wood'));
  const scene=createSolidScene(canvas,ctx,{ground:GROUND,worldWidth:WORLD});
  function reset(){scene.set([-1,1].map(side=>({kind:'jiaobei',mesh,size:SIZE,x:side*HOME_X,y:side*HOME_Y,q:multiply(axisAngle([0,0,1],side*.32),axisAngle([1,0,0],.14))})));}
  reset();
  return {reset,rest:scene.rest,preview:scene.preview,tilt:()=>{},dispose:scene.dispose,
    async toss(result,intensity,onPhase){
      const ok=await scene.throwTo([result.a,result.b],intensity,{duration:ctx.platform.simpleMotion?1700:3500,onPhase});
      if(ok)canvas.dataset.faces=`${result.a},${result.b}`;
      return ok;
    },
    /** 每枚筊杯落点在画布上的横坐标（CSS px），用来把面向标签放到杯子正下方。 */
    landing(){
      const w=canvas.clientWidth,h=canvas.clientHeight;
      if(!w||!h)return [];
      return scene.objects.map(o=>projectSolidPoint([o.x,o.y,0],w,h,GROUND,WORLD)[0]);
    },
  };
}
