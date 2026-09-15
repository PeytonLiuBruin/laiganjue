import {createThrowPhysics} from '../core/throw-physics.js';
import {add,mul,dot,rotate,axisAngle,multiply,IDENTITY,faceUp,supportHeight,flightHeight,projectSolidPoint} from '../core/solids.js';
import {PIP_LAYOUT} from '../modules/coin/core.js';
import {createDiceShake} from '../modules/coin/dice-shake.js';

const VIEW=[0,-.6,.8], LIGHT=[-.35,-.45,.82];
const COLORS={ivory:[244,238,218],edge:[214,202,176],brass:[191,154,89],'gold-edge':[151,112,58],wood:[158,49,33],cut:[194,79,49]};
export function paintSolids(c,width,height,objects,{ground=.75,plate=false,shock=0,worldWidth=350}={}) {
  c.clearRect(0,0,width,height);
  const cy=height*ground+shock, sceneScale=Math.min(1,width/worldWidth,height/320);
  const project=p=>{const projected=projectSolidPoint(p,width,height,ground,worldWidth);projected[1]+=shock;return projected;};
  if(plate){
    c.save();c.translate(width/2,cy+12);
    const g=c.createRadialGradient(0,-8,15,0,0,Math.min(width*.44,188));g.addColorStop(0,'#d9cbb444');g.addColorStop(1,'#b6a38511');
    c.fillStyle=g;c.strokeStyle='#ab927033';c.lineWidth=1;c.beginPath();c.ellipse(0,0,Math.min(width*.44,185),67,0,0,Math.PI*2);c.fill();c.stroke();c.restore();
  }
  for(const o of objects){
    const p=project([o.x,o.y,0]),h=o.lift||0;
    c.save();c.translate(p[0],p[1]+6);c.scale(1,.36);
    const r=(o.size*(o.kind==='coin'?1.1:1.35)+h*.07)*sceneScale,g=c.createRadialGradient(0,0,1,0,0,r);
    g.addColorStop(0,`rgba(42,29,19,${.25/(1+h/70)})`);g.addColorStop(1,'rgba(42,29,19,0)');
    c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();
  }
  const faces=[];
  for(const o of objects){
    const z=o.z??(supportHeight(o.mesh,o.q,o.size)+(o.lift||0)),pos=[o.x,o.y,z];
    const objectDepth=dot(pos,VIEW);
    const world=p=>add(mul(rotate(p,o.q),o.size),pos);
    for(const f of o.mesh){
      const normal=rotate(f.normal,o.q);if(dot(normal,VIEW)<.015)continue;
      const pts=f.points.map(p=>project(world(p))),center=world(f.center);
      faces.push({f,o,pts,normal,world,objectDepth,depth:dot(center,VIEW)});
    }
    if(o.kind==='coin')for(const side of [1,-1]){
      const normal=rotate([0,0,side],o.q);if(dot(normal,VIEW)<.05)continue;
      const center=[0,0,side*.087],u=[side,0,0],v=[0,1,0];
      faces.push({f:{points:[],center,u,v,ink:{type:'coin',side,choice:o.choice,inscription:o.inscription},material:'brass'},o,pts:[],normal,world,objectDepth,depth:dot(world(center),VIEW)+o.size*3});
    }
  }
  faces.sort((a,b)=>a.o!==b.o&&a.o.kind==='coin'&&b.o.kind==='coin' ? a.objectDepth-b.objectDepth : a.depth-b.depth);
  for(const item of faces){
    const {f,o,pts,normal,world}=item;
    c.save();
    if(pts.length){
      c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();
      const base=COLORS[f.material]||COLORS.ivory,lit=.62+Math.max(0,dot(normal,LIGHT))*.42;
      c.fillStyle=`rgb(${base.map(v=>Math.min(255,Math.round(v*lit))).join(',')})`;c.fill();
      c.strokeStyle=['wood','cut','brass'].includes(f.material)?c.fillStyle:'rgba(83,59,29,.16)';c.lineWidth=['wood','cut','brass'].includes(f.material)?1.1:.65;c.stroke();
      if(f.ink)c.clip();
    }
    if(f.ink){
      const p=project(world(f.center)),u=project(world(add(f.center,f.u))),v=project(world(add(f.center,f.v)));
      // Label local Y points down. Text is centred on the face, independent of
      // CSS grids, triangle clipping, device fonts, or Safari's preserve-3d.
      c.transform(u[0]-p[0],u[1]-p[1],p[0]-v[0],p[1]-v[1],p[0],p[1]);
      c.fillStyle='#302921';c.textAlign='center';c.textBaseline='middle';
      if(f.ink.type==='pips')for(const [r,col] of PIP_LAYOUT[f.ink.value]){c.beginPath();c.arc((col-2)*.43,(r-2)*.43,.105,0,Math.PI*2);c.fill();}
      if(f.ink.type==='number') {c.save();c.scale(.01,.01);c.font='600 39px Georgia, serif';c.fillText(String(f.ink.value),0,1.5);c.restore();if(f.ink.value===6||f.ink.value===9){c.fillRect(-.08,.20,.16,.018);}}
      if(f.ink.type==='coin'){
        c.strokeStyle='#6b481e';c.lineWidth=.02;
        for(const r of [.89,.79]){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();}
        if(f.ink.choice){c.fillStyle='#e9cd8b';c.fillRect(-.71,-.36,1.42,.72);c.fillStyle='#483016';c.save();c.scale(.01,.01);c.font='500 30px serif';c.fillText(f.ink.choice[f.ink.side===1?0:1],0,0,130);c.restore();}
        else if(f.ink.side===1){c.save();c.scale(.01,.01);c.font='600 40px serif';const letters=f.ink.inscription||['来','感','通','宝'];[[0,-52],[0,52],[52,0],[-52,0]].forEach(([x,y],i)=>c.fillText(letters[i],x,y));c.restore();}
        else for(let i=0;i<8;i++){c.save();c.rotate(i*Math.PI/4);c.beginPath();c.ellipse(0,-.54,.12,.18,0,0,Math.PI*2);c.stroke();c.restore();}
      }
    }
    c.restore();
  }
}

export function createSolidScene(canvas,ctx,{plate=false,ground=.76,worldWidth=350}={}) {
  const c=canvas.getContext('2d');let objects=[],width=350,height=360,frame=0,alive=true,pending=null,active=false,shock=0,diceShake=null,diceOrigin=null;
  function render(){if(!alive||!c)return;const dpr=Math.min(window.devicePixelRatio||1,2);c.setTransform(dpr,0,0,dpr,0,0);paintSolids(c,width,height,objects,{plate,ground,shock,worldWidth});}
  function resize(){const r=canvas.getBoundingClientRect();if(r.width>0&&r.height>0){width=r.width;height=r.height;}const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);render();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function set(specs){cancel();canvas.removeAttribute('data-values');canvas.removeAttribute('aria-label');canvas.dataset.phase='idle';shock=0;objects=specs.map(s=>({...s,homeX:s.x,homeY:s.y,q:s.q||IDENTITY,lift:0}));resize();}
  function preview(dx=0,dy=0){if(active)return;objects.forEach(o=>{delete o.z;o.previewQ??=o.q;o.q=multiply(axisAngle([0,1,0],Math.max(-.3,Math.min(.3,dx/150))),o.previewQ);o.lift=Math.max(0,Math.min(36,-dy*.45));});render();}
  function rest(){if(active)return;objects.forEach(o=>{if(o.previewQ){o.q=o.previewQ;delete o.previewQ;}o.lift=0;delete o.z;});render();}
  function cancel(){cancelAnimationFrame(frame);active=false;diceShake=null;diceOrigin=null;pending?.(false);pending=null;}
  function startDiceShake(chooseValues,{onPhase=()=>{}}={}) {
    cancel(); objects.forEach(o=>{delete o.z;delete o.previewQ;});active=true;shock=0;
    diceOrigin={poses:objects.map(o=>({q:[...o.q],x:o.x,y:o.y})),values:canvas.getAttribute('data-values'),label:canvas.getAttribute('aria-label')};
    diceShake=createDiceShake(objects,{now:performance.now(),chooseValues,duration:ctx.platform.simpleMotion?750:900});
    canvas.dataset.phase='shaking';canvas.removeAttribute('data-values');
    canvas.setAttribute('aria-label','骰子随晃动翻滚');onPhase('shaking');
    let previous='shaking';
    return new Promise(resolve=>{
      pending=resolve;
      function tick(now) {
        if(!alive||!diceShake)return;
        if(document.hidden){cancel();return;}
        const state=diceShake.advance(now);
        if(state.phase!==previous){previous=state.phase;canvas.dataset.phase=state.phase;onPhase(state.phase);}
        if(state.impact){ctx.sound.play(state.impact>.5?'clack':'tick');ctx.haptic.impact(state.impact);}
        render();
        if(state.phase==='settled'){
          active=false;diceShake=null;diceOrigin=null;pending=null;
          canvas.dataset.values=state.values.join(',');canvas.setAttribute('aria-label',`落定：${state.values.join('、')}`);
          ctx.haptic.settle();resolve(state.values);
        } else frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    });
  }
  function driveDice(sample){diceShake?.feed(sample);}
  function releaseDice(){diceShake?.endInput(performance.now());}
  function cancelDice(){
    if(!diceShake)return;
    const origin=diceOrigin;cancel();
    origin.poses.forEach((pose,i)=>Object.assign(objects[i],pose,{lift:0}));render();
    canvas.dataset.phase='idle';canvas.setAttribute('aria-label',origin.label||'立体骰子');
    if(origin.values!==null)canvas.dataset.values=origin.values;else canvas.removeAttribute('data-values');
  }
  const visibility=()=>{if(document.hidden)cancelDice();};
  document.addEventListener('visibilitychange',visibility);
  function throwTo(values,intensity=20,{duration=3400,onPhase=()=>{}}={}){
    cancel();active=true;
    // Launch from the held pose, but make the next preview start from the landing.
    objects.forEach(o=>{delete o.previewQ;});
    const power=Math.max(.65,Math.min(1.5,intensity/20));
    const targets=objects.map((o,i)=>o.kind==='coin'?axisAngle([1,0,0],values[i]==='tails'?Math.PI:values[i]==='edge'?Math.PI/2:0):o.kind==='jiaobei'?axisAngle([1,0,0],values[i]==='round'?Math.PI:values[i]==='stand'?Math.PI/2:0):faceUp(o.mesh,values[i]));
    const physics=createThrowPhysics(objects,targets,{power,height:flightHeight(height,power),worldWidth,seed:performance.now()%997});
    let last=null,phase='',lastHit=-1;
    canvas.dataset.phase='flight';canvas.removeAttribute('data-values');
    return new Promise(resolve=>{pending=resolve;
      function tick(now){
        if(!alive)return;
        const dt=last===null||document.hidden?0:Math.min(.064,(now-last)/1000);last=now;
        // Slow the physical clock as a whole, preserving the relation between
        // speed, gravity and impact. Do not ease each section of the trajectory.
        const state=physics.advance(dt*Math.min(1.4,3400/duration));
        const hit=state.contacts.sort((a,b)=>b.speed-a.speed)[0];
        if(hit&&state.elapsed-lastHit>.085){
          const o=objects[hit.index],strength=Math.min(1,hit.speed/420);
          ctx.sound.play(strength<.22?'tick':o.kind==='coin'?'coin':o.kind==='jiaobei'?'clack':'thud');
          ctx.haptic.impact(strength);lastHit=state.elapsed;
        }
        if(state.phase!==phase){phase=state.phase;canvas.dataset.phase=phase;onPhase(phase);}
        render();
        if(state.phase!=='settled')frame=requestAnimationFrame(tick);
        else{active=false;pending=null;canvas.dataset.values=values.join(',');canvas.setAttribute('aria-label',`落定：${values.join('、')}`);ctx.haptic.settle();resolve(true);}
      }
      frame=requestAnimationFrame(tick);
    });
  }
  function dispose(){alive=false;cancel();observer.disconnect();document.removeEventListener('visibilitychange',visibility);}
  ctx.addCleanup(dispose);
  return {set,throwTo,startDiceShake,driveDice,releaseDice,cancelDice,preview,rest,render,dispose,get objects(){return objects;},get width(){return width;}};
}
