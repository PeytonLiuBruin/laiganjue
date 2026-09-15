import { lathe, torus, box, polygon, transformed, rotate, axisAngle, add, mul, clamp, ease, pendulumPosition, pillarPose } from './geometry.js';
import { rgba } from './painter.js';
import { DIRECTIONS, MOUNTAINS } from '../../modules/fengshui/data.js';
const TAU=Math.PI*2;
const cache=new Map();
function cached(key,build){if(!cache.has(key))cache.set(key,build());return cache.get(key);}
const shift=(mesh,p)=>transformed(mesh,undefined,p);
const wx={'木':'#47755e','火':'#ac564c','土':'#94723e','金':'#687a83','水':'#486f99'};

export function drawCompass(p,s){
  const {metal,stone,accent,ink:text}=p.palette, q=axisAngle([0,1,0],-(s.angle||0)*Math.PI/180);
  p.shadow([0,-24,0],136);
  p.mesh(cached('compass-body'+metal,()=>lathe([[0,-16],[111,-16],[123,-10],[125,-3],[123,3],[113,8],[0,8]],metal)));
  p.mesh(cached('compass-face'+stone,()=>lathe([[0,8],[111,8],[111,9],[0,9]],stone)));
  const plate=point=>rotate(point,q), u=rotate([1,0,0],q), v=rotate([0,0,-1],q);
  for(const r of [109,94,69,42,25])p.ring(r,10,metal,.8);
  for(let i=0;i<120;i++){
    const a=i/120*TAU,r=i%5===0?100:104;
    p.line([[Math.sin(a)*r,10,-Math.cos(a)*r],[Math.sin(a)*109,10,-Math.cos(a)*109]].map(plate),i%15===0?accent:text,i%5===0?1:.6,.62);
  }
  MOUNTAINS.forEach((label,i)=>{const a=i/24*TAU;p.text(label,plate([Math.sin(a)*82,10.4,-Math.cos(a)*82]),{size:11,color:text,u,v});});
  DIRECTIONS.forEach((dir,i)=>{
    const a=i/8*TAU;
    p.text(dir.name,plate([Math.sin(a)*55,10.4,-Math.cos(a)*55]),{size:13,color:i===0?accent:text,u,v,weight:600});
  });
  const pointer=[
    polygon([[0,14,-72],[-6,14,0],[6,14,0]],accent),
    polygon([[0,14,72],[6,14,0],[-6,14,0]],metal),
    ...lathe([[0,14],[8,14],[8,18],[0,18]],metal,32),
  ];
  p.mesh(transformed(pointer,q));
  p.line([[-5,11,-128],[0,12,-118],[5,11,-128]],accent,2.2);
  p.glow([0,17,0],8,'#ffffff',.5);
}

function glass(p,center,radius,s,time){
  const {c}=p,pt=p.project(center),r=radius*pt[3],progress=clamp(s.progress||0),clearing=s.revealMix ?? (s.revealed?1:0);
  p.glow(center,radius*1.28,p.palette.glass,.09+progress*.14);
  c.save();c.beginPath();c.arc(pt[0],pt[1],r,0,TAU);c.clip();
  const base=c.createRadialGradient(pt[0]-r*.30,pt[1]-r*.42,r*.04,pt[0],pt[1]+r*.08,r*1.06);
  base.addColorStop(0,'rgba(255,255,255,.32)');base.addColorStop(.46,rgba(p.palette.glass,.14));base.addColorStop(.83,rgba(p.palette.glass,.34));base.addColorStop(1,rgba(p.palette.glass,.70));
  c.fillStyle=base;c.fillRect(pt[0]-r,pt[1]-r,r*2,r*2);
  // Cloud centres occupy a volume. Their size, order and light change with depth.
  const clouds=Array.from({length:20},(_,i)=>{
    const a=i*2.399+time*(.13+progress*.34),z=Math.sin(a*.63+i)*radius*.51;
    return {point:add(center,[Math.cos(a)*radius*(.18+(i%4)*.12),Math.sin(a*.76+i)*radius*.51,z]),radius:radius*(.22+(i%3)*.09),i};
  }).sort((a,b)=>a.point[2]-b.point[2]);
  for(const cloud of clouds)p.glow(cloud.point,cloud.radius,cloud.i%3===0?'#b9adc8':cloud.i%3===1?'#94b4c2':'#ffffff',(.16+progress*.20)*(1-clearing*.88));
  for(let i=0;i<26;i++){
    const a=i*2.399+time*.08,rr=radius*Math.sqrt((i+.5)/26)*.87;
    const world=add(center,[Math.cos(a)*rr,Math.sin(a)*rr,Math.sqrt(Math.max(0,radius*radius-rr*rr))*.45]);
    p.glow(world,(i%4?1.8:3)+progress, '#ffffff',(.3+progress*.45)*(1-clearing*.7));
  }
  c.globalAlpha=.55;
  c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=2.5*pt[3];
  c.beginPath();c.ellipse(pt[0]-r*.28+Math.sin(time*.3)*2,pt[1]-r*.46,r*.29,r*.09,-.55,0,TAU);c.stroke();
  const flare=c.createRadialGradient(pt[0]-r*.38,pt[1]-r*.53,0,pt[0]-r*.38,pt[1]-r*.53,r*.32);flare.addColorStop(0,'rgba(255,255,255,.85)');flare.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=flare;c.fillRect(pt[0]-r,pt[1]-r,r*2,r*2);
  c.restore();
  c.strokeStyle=rgba(p.palette.glass,.52);c.lineWidth=1.2;c.beginPath();c.arc(pt[0],pt[1],r,0,TAU);c.stroke();
  c.strokeStyle='rgba(255,255,255,.6)';c.beginPath();c.arc(pt[0],pt[1],r-2,-2.8,-.6);c.stroke();
}
export function drawBall(p,s,time){
  const {metal,stone}=p.palette;
  p.shadow([0,-133,0],95,.22);
  p.mesh(cached('ball-base'+metal+stone,()=>[
    ...lathe([[0,-130],[66,-130],[72,-125],[70,-119],[48,-115],[34,-104],[31,-87],[47,-80],[0,-80]],metal),
    ...lathe([[0,-129],[62,-129],[62,-126],[0,-126]],stone),
  ]));
  glass(p,[0,16,0],94,s,time);
  p.ring(46,-79,metal,.65);
}

export function drawPendulum(p,s,time){
  const {metal,stone,accent,ink:text}=p.palette,bob=pendulumPosition(s.x,s.y),anchor=[0,126,0];
  p.shadow([0,-96,0],130);
  p.mesh(cached('pend-board'+metal+stone,()=>lathe([[0,-81],[116,-81],[121,-77],[121,-72],[115,-68],[0,-68]],stone)));
  for(const radius of[113,101,62,30])p.ring(radius,-67.5,metal,.65);
  p.line([[-91,-67,0],[91,-67,0]],metal,.8,.5);p.line([[0,-67,-87],[0,-67,87]],metal,.8,.5);
  const label=(value,position,selected)=>p.text(value,position,{size:16,u:[1,0,0],v:[0,0,-1],color:selected?accent:text,weight:selected?700:400});
  label('是',[0,-67,-82],s.result==='yes');label('是',[0,-67,82],s.result==='yes');
  label('否',[-87,-67,0],s.result==='no');label('否',[87,-67,0],s.result==='no');
  p.shadow([bob[0],-66,bob[2]],32,.22);
  const top=add(bob,[0,23,0]);
  p.line([anchor,top],metal,1.3);
  for(let i=0;i<24;i++){
    const t=i/24,center=add(mul(anchor,1-t),mul(top,t));
    p.line(Array.from({length:9},(_,k)=>add(center,[Math.cos(k/8*TAU)*(i%2?1.3:2.1),Math.sin(k/8*TAU)*2.7,0])),i%2?metal:'#f0dcad',.8);
  }
  const q=axisAngle([0,1,0],time*.13+(s.x||0)*.8);
  p.mesh(transformed(cached('pend-bob'+metal,()=>[
    ...lathe([[0,-33],[17,5],[17,13],[8,23],[0,23]],'#afbbca',6),
    ...lathe([[0,19],[9,19],[9,24],[5,27],[0,27]],metal,24),
  ]),q,bob));
  p.glow(add(bob,[-5,9,12]),12,'#ffffff',.45);
  if(s.glow)p.glow([bob[0],-65,bob[2]],36,accent,.2);
}

export function drawSky(p,s,time){
  const {metal,stone,accent,text}=p.palette;
  const yaw=Math.sin(time*.10)*.08,rot=axisAngle([0,1,0],yaw);
  p.shadow([0,-136,0],86);
  p.mesh(cached('sky-base'+metal+stone,()=>lathe([[0,-135],[57,-135],[62,-130],[55,-123],[22,-118],[12,-106],[12,-96],[0,-96]],metal)));
  const rings=cached('sky-rings'+metal,()=>[
    ...torus(106,2.1,metal,axisAngle([1,0,0],.40)),
    ...torus(109,1.8,metal,axisAngle([0,1,0],1.02)),
    ...torus(105,2.3,metal,axisAngle([1,0,0],1.08)),
  ]);
  p.mesh(transformed(rings,rot,[0,3,0]));
  const active=s.active?1:0;
  p.glow([0,5,0],97,p.palette.glass,.12+active*.10);
  for(let i=0;i<42;i++){
    const z=1-2*(i+.5)/42,r=Math.sqrt(1-z*z)*88,a=i*2.399+time*.025;
    const point=rotate([Math.cos(a)*r,Math.sin(a)*r+4,z*88],rot);
    p.glow(point,i%6?1.2:2.8,metal,.2+(.2+.3*active)*(Math.sin(time*.8+i)*.5+.5));
  }
  if(s.kind==='animal'){
    p.mesh(shift(transformed(cached('sky-medallion'+stone,()=>lathe([[0,-4],[43,-4],[47,0],[43,5],[0,5]],stone)),axisAngle([1,0,0],Math.PI/2)),[0,7,36]));
    p.text(s.glyph||'子',[0,8,42],{size:44,color:p.palette.ink,weight:600});
    const branches=[...'子丑寅卯辰巳午未申酉戌亥'];
    branches.forEach((b,i)=>{const a=i/12*TAU;p.text(b,[Math.sin(a)*84,Math.cos(a)*84+3,14],{size:12,color:b===s.glyph?accent:text,alpha:b===s.glyph?1:.55});});
  }else{
    const points=(s.stars||[]).map(star=>{
      const x=(star.x-50)*1.35,y=(50-star.y)*1.35;
      return rotate([x,y+5,Math.sqrt(Math.max(100,82*82-x*x-y*y))*.58],rot);
    });
    for(const [i,j]of s.lines||[])if(points[i]&&points[j])p.line([points[i],points[j]],accent,active?1.6:1,.4+active*.3);
    points.forEach((point,i)=>{
      const pt=p.project(point),pulse=1+Math.sin(time*(active?4:1.2)+i)*.14;
      p.glow(point,8*pulse,accent,.35+active*.25);p.c.fillStyle=p.palette.dark?'#f6e8c8':accent;p.c.beginPath();p.c.arc(pt[0],pt[1],Math.max(1.4,(s.stars[i].r||1.4)*1.3)*pt[3]*pulse,0,TAU);p.c.fill();
    });
  }
}

export function drawPillars(p,s,time){
  const {metal,stone,ink:text}=p.palette,progress=s.active?clamp(time/(s.duration||2.4)):1;
  p.shadow([0,-111,0],151,.18);
  p.mesh(cached('pillars-base'+metal+stone,()=>[
    ...shift(box(298,9,61,metal),[0,-104,0]),...shift(box(286,5,53,stone),[0,-97,0]),
  ]));
  for(let i=0;i<4;i++){
    const entry=s.pillars?.[i],pose=pillarPose(i,progress),q=pose.rotation,at=point=>add(rotate(point,q),pose.position);
    const color=entry?stone:'#d6d5ce';
    p.mesh(transformed(cached('pillar'+color+metal,()=>[
      ...box(49,164,28,color),...shift(box(52,5,31,metal),[0,-82,0]),...shift(box(52,4,31,metal),[0,82,0]),
    ]),q,pose.position));
    if(pose.visible){
      const u=rotate([1,0,0],q),v=[0,1,0];
      p.text(entry?.label||['年柱','月柱','日柱','时柱'][i],at([0,60,14.5]),{size:12,u,v,color:text});
      const unknownHour=i===3&&s.pillars?.length===3;
      p.text(entry?.gan||(unknownHour?'未':'·'),at([0,28,14.5]),{size:unknownHour?20:29,u,v,color:wx[entry?.ganElement]||metal,weight:600});
      p.text(entry?.zhi||(unknownHour?'知':'·'),at([0,-12,14.5]),{size:unknownHour?20:29,u,v,color:wx[entry?.zhiElement]||metal,weight:600});
      p.text(entry?.shiShen||(unknownHour?'未计入':''),at([0,-56,14.5]),{size:10,u,v,color:text});
    }
  }
}
