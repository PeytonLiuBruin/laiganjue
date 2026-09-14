import { createPainter, DEFAULT_PALETTE } from './painter.js';
import { drawCompass, drawBall, drawPendulum, drawSky, drawPillars } from './objects.js';
import { clamp } from './geometry.js';
const MODELS = {
  'fengshui.compass': { draw: drawCompass, pitch: .92 },
  'crystal.ball': { draw: drawBall, pitch: .09, ambient: true },
  'crystal.pendulum': { draw: drawPendulum, pitch: .38 },
  'zodiac.sky': { draw: drawSky, pitch: .10, ambient: true },
  'bazi.pillars': { draw: drawPillars, pitch: .10 },
};
export const MODEL_IDS = Object.freeze(Object.keys(MODELS));
export function builtInModel(id) {
  return MODELS[id] ? (el, ctx) => createModelRenderer(el, ctx, id) : null;
}
export function paintModel(c,width,height,id,state={},time=0,palette=DEFAULT_PALETTE,tilt={x:0,y:0}) {
  const model=MODELS[id];if(!model)return;
  c.clearRect(0,0,width,height);
  const painter=createPainter(c,width,height,{pitch:model.pitch+tilt.y*.06,yaw:tilt.x*.08,palette});
  model.draw(painter,state,time);
}
function createModelRenderer(el,ctx,id) {
  const canvas=document.createElement('canvas');canvas.className='model-canvas';canvas.setAttribute('aria-hidden','true');el.replaceChildren(canvas);
  const c=canvas.getContext('2d');if(!c)return null;
  let alive=true,frame=0,last=null,lastPaint=0,time=0,activeTime=0,width=320,height=340,visible=true;
  let palette={...DEFAULT_PALETTE},state={},tilt={x:0,y:0},targetTilt={x:0,y:0};
  const gentle = ctx.platform?.prefersReducedMotion || ctx.platform?.simpleMotion;
  function schedule(){if(alive&&!frame&&!document.hidden&&visible)frame=requestAnimationFrame(tick);}
  function tick(now){
    frame=0;if(!alive||document.hidden||!visible||el.closest('[hidden]')||!el.isConnected){last=null;return;}
    const dt=last===null?0:Math.min(.064,(now-last)/1000);last=now;time+=dt;activeTime+=dt;
    state.revealMix = (state.revealMix || 0) + ((state.revealed ? 1 : 0) - (state.revealMix || 0)) * Math.min(1, dt * 4);
    const response=1-Math.exp(-9*dt);
    tilt.x+=(targetTilt.x-tilt.x)*response;tilt.y+=(targetTilt.y-tilt.y)*response;
    if(now-lastPaint>=(state.active?15:30)){
      const dpr=Math.min(window.devicePixelRatio||1,2);c.setTransform(dpr,0,0,dpr,0,0);
      paintModel(c,width,height,id,state,id==='bazi.pillars'?activeTime:time,palette,tilt);lastPaint=now;
    }
    if(MODELS[id].ambient&&!gentle||state.active||Math.abs((state.revealed?1:0)-(state.revealMix||0))>.005||Math.abs(targetTilt.x-tilt.x)+Math.abs(targetTilt.y-tilt.y)>.005)schedule();
  }
  function resize(){
    const r=el.getBoundingClientRect();if(r.width>0&&r.height>0){width=r.width;height=r.height;}
    visible=el.isConnected&&!el.closest('[hidden]')&&r.width>0&&r.height>0&&r.bottom>-80&&r.top<(window.innerHeight||900)+80;
    const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);lastPaint=-Infinity;schedule();
  }
  function theme(){
    const css=getComputedStyle(document.documentElement),get=(key,fallback)=>css.getPropertyValue(key).trim()||fallback;
    const dark=['ink','cinnabar','nebula'].includes(document.documentElement.dataset.theme);
    palette={...DEFAULT_PALETTE,accent:get('--accent',DEFAULT_PALETTE.accent),text:get('--text',DEFAULT_PALETTE.text),dark,
      metal:dark?'#c8ab72':'#ae9462',stone:dark?'#b9b7ac':'#e4dfd3',glass:dark?'#a0b4cf':'#889eae'};lastPaint=-Infinity;schedule();
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);
  const intersection=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries[entries.length-1]?.isIntersecting!==false;if(visible){last=null;schedule();}else{cancelAnimationFrame(frame);frame=0;last=null;}},{rootMargin:'80px'}):null;
  intersection?.observe(el);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=null;}else schedule();};
  document.addEventListener('visibilitychange',visibility);
  const move=e=>{if(gentle)return;const r=el.getBoundingClientRect();targetTilt={x:clamp((e.clientX-r.left)/r.width*2-1,-1,1),y:clamp((e.clientY-r.top)/r.height*2-1,-1,1)};schedule();};
  const leave=()=>{targetTilt={x:0,y:0};schedule();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);
  const offTilt=ctx.motion?.onTilt?.(({gamma,beta})=>{if(gamma==null||beta==null)return;targetTilt={x:clamp(gamma/35,-1,1),y:clamp((beta-35)/50,-1,1)};schedule();});
  ctx.onTheme?.(theme);theme();resize();
  // Factories can run before their slot is attached. Paint after the mount has
  // committed, without hiding/showing the object or relying on a timed flash.
  const mountedFrame=requestAnimationFrame(()=>{if(alive)resize();});
  return {
    set(next){
      if(!alive)return;
      if(next.active&&!state.active||next.pillars)activeTime=0;
      state={...state,...next};
      canvas.dataset.phase=state.active?'active':state.revealed||state.glow?'revealed':'idle';
      if(next.angle!=null)canvas.dataset.angle=String(next.angle);
      if(next.progress!=null)canvas.dataset.progress=String(clamp(next.progress));
      if(next.result!==undefined)canvas.dataset.result=next.result||'';
      if(next.pillars)canvas.dataset.pillars=next.pillars.map(p=>p.gan+p.zhi).join(' ');
      lastPaint=-Infinity;schedule();
    },
    dispose(){
      if(!alive)return;alive=false;cancelAnimationFrame(frame);cancelAnimationFrame(mountedFrame);resizeObserver.disconnect();intersection?.disconnect();
      document.removeEventListener('visibilitychange',visibility);el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);if(typeof offTilt==='function')offTilt();
      canvas.width=1;canvas.height=1;
    },
  };
}
