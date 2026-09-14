// Each bamboo stick has its own vertical velocity and lateral spring. Impulses
// at a reversal lift the bundle; individual impacts produce the clustered sound.
export function createStickBundle(ctx,vessel,stems) {
  const bodies=stems.map((el,i)=>({el,base:el.style.transform,x:0,y:0,vx:0,vy:0,seed:i*1.71,mass:.8+(i%7)*.11}));
  let alive=true,frame=0,pending=null,lastSound=-Infinity,previousTilt=0;
  const sound=(time)=>{if(time-lastSound>135){ctx.sound.play('bamboo');ctx.haptic.impact(.18);lastSound=time;}};
  function paint(){bodies.forEach(b=>{b.el.style.transform=`${b.base} translate(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px) rotate(${(b.x*.5).toFixed(2)}deg)`;});}
  function preview(accel=0){
    if(pending)return;
    const force=Math.max(-14,Math.min(14,accel));
    bodies.forEach(b=>{b.x=-force*(.45+b.mass*.2);b.y=-Math.abs(force)*(.45+Math.sin(b.seed)*.2);});paint();
    if(force*previousTilt<0&&Math.abs(force)>5)sound(performance.now());previousTilt=force;
  }
  function reset(){bodies.forEach(b=>{b.x=b.y=b.vx=b.vy=0;b.el.style.transform=b.base;});vessel.style.transform='';}
  function shake(power=1,duration=2400){
    if(pending)return Promise.resolve(false);
    vessel.classList.add('sticks-in-motion');
    let elapsed=0,last=null,cycle=-1;
    return new Promise(resolve=>{pending=resolve;
      function tick(now){
        if(!alive)return;
        const dt=last===null||document.hidden?0:Math.min(.04,(now-last)/1000);last=now;elapsed+=dt*1000;
        const t=Math.min(1,elapsed/duration),envelope=Math.min(1,t*7)*Math.min(1,(1-t)*5),angle=Math.sin(t*Math.PI*13)*11*power*envelope;
        const nextCycle=Math.floor(t*13),kick=nextCycle!==cycle;cycle=nextCycle;
        vessel.style.transform=`translate(${(angle*.9).toFixed(2)}px,${(-Math.abs(angle)*.75).toFixed(2)}px) rotate(${angle.toFixed(2)}deg)`;
        let contact=false;
        bodies.forEach(b=>{
          if(kick&&envelope>.08)b.vy=-(100+Math.sin(b.seed+cycle)*48)*envelope/b.mass;
          b.vx+=(-b.x*55-angle*34/b.mass-b.vx*8)*dt;b.x+=b.vx*dt;
          if(Math.abs(b.x)>10){b.x=Math.sign(b.x)*10;b.vx*=-.3;contact=true;}
          b.vy+=650*dt;b.y+=b.vy*dt;
          if(b.y>0){if(b.vy>48)contact=true;b.y=0;b.vy*=-.22;}
        });
        if(kick||contact)sound(now);paint();
        if(t<1)frame=requestAnimationFrame(tick);
        else{reset();vessel.classList.remove('sticks-in-motion');pending=null;resolve(true);}
      }
      frame=requestAnimationFrame(tick);
    });
  }
  ctx.addCleanup(()=>{alive=false;cancelAnimationFrame(frame);pending?.(false);pending=null;});
  return {shake,preview,reset};
}
