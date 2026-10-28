import { lathe, torus, box, polygon, transformed, rotate, axisAngle, add, mul, clamp, ease, pendulumPosition, pillarPose } from './geometry.js';
import { rgba } from './painter.js';
import { DIRECTIONS, MOUNTAINS } from '../../modules/fengshui/data.js';
const TAU=Math.PI*2;
const cache=new Map();
function cached(key,build){if(!cache.has(key))cache.set(key,build());return cache.get(key);}
const shift=(mesh,p)=>transformed(mesh,undefined,p);

// 第 43 轮：2D 回退罗盘与 3D 盘面（stage/scenes/compass.js 的 COMPASS_FACE，第 26 轮）同一套四圈色带。
// 原来是米色盘面、120 道细刻度、11px 细字，WebGL 创建失败的老机型上糊成一片。
export const COMPASS_2D = {
  ink: '#3a2410', red: '#d8402e', cream: '#fff4d8', jade: '#22a88f', gold: '#ffc93c', navy: '#2a3a6e', rim: '#f0a500',
  bands: [1, .86, .64, .47, .27], R: 110,
  font: { mountain: 12, trigram: 14, direction: 13 },
};
export function drawCompass(p,s){
  const C=COMPASS_2D, q=axisAngle([0,1,0],-(s.angle||0)*Math.PI/180);
  p.shadow([0,-24,0],136);
  p.mesh(cached('compass-body',()=>lathe([[0,-16],[111,-16],[123,-10],[125,-3],[123,3],[113,8],[0,8]],C.rim)));
  const plate=point=>rotate(point,q), u=rotate([1,0,0],q), v=rotate([0,0,-1],q), Y=9.2;
  const circle=(r,y=Y)=>Array.from({length:72},(_,i)=>plate([Math.sin(i/72*TAU)*r,y,-Math.cos(i/72*TAU)*r]));
  const [b0,b1,b2,b3,b4]=C.bands.map(k=>k*C.R);
  [[b0,C.red],[b1,C.cream],[b2,C.jade],[b3,C.gold],[b4,C.navy]].forEach(([r,color])=>p.face(circle(r),color,{stroke:C.ink,width:2}));
  const spoke=(n,r0,r1,w)=>{for(let i=0;i<n;i++){const a=(i+.5)/n*TAU;p.face([[Math.sin(a)*r0,Y,-Math.cos(a)*r0],[Math.sin(a)*r1,Y,-Math.cos(a)*r1]].map(plate),'transparent',{stroke:C.ink,width:w});}};
  spoke(24,b2,b1,1.2); spoke(8,b4,b2,1.6);
  // 外圈：每山一道奶油色粗刻度，四正方位换成金色圆点
  for(let i=0;i<24;i++){
    const a=i/24*TAU,mid=(b0+b1)/2;
    if(i%6===0){p.face(Array.from({length:16},(_,k)=>plate([Math.sin(a)*mid+Math.cos(k/16*TAU)*4,Y+.1,-Math.cos(a)*mid+Math.sin(k/16*TAU)*4])),C.gold,{stroke:C.ink,width:1.4});continue;}
    p.face([[Math.sin(a)*(mid-4),Y+.1,-Math.cos(a)*(mid-4)],[Math.sin(a)*(mid+4),Y+.1,-Math.cos(a)*(mid+4)]].map(plate),'transparent',{stroke:C.cream,width:2.6});
  }
  const flat={u,v,stroke:null,depth:false};
  MOUNTAINS.forEach((label,i)=>{const a=i/24*TAU,r=(b1+b2)/2;p.text(label,plate([Math.sin(a)*r,Y+.2,-Math.cos(a)*r]),{...flat,size:C.font.mountain,weight:900,color:i%6===0?C.red:C.ink});});
  DIRECTIONS.forEach((dir,i)=>{
    const a=i/8*TAU,rt=(b2+b3)/2,rd=(b3+b4)/2;
    p.text(dir.symbol,plate([Math.sin(a)*rt,Y+.2,-Math.cos(a)*rt]),{...flat,size:C.font.trigram,weight:900,color:'#ffffff',stroke:C.ink});
    p.text(dir.name,plate([Math.sin(a)*rd,Y+.2,-Math.cos(a)*rd]),{...flat,size:C.font.direction,weight:900,color:i===0?C.red:C.ink});
  });
  p.face(circle(b4-4,Y+.1),'transparent',{stroke:C.gold,width:1.6});
  const pointer=[
    polygon([[0,14,-72],[-7,14,0],[7,14,0]],'#e8463c'),
    polygon([[0,14,72],[7,14,0],[-7,14,0]],C.gold),
    ...lathe([[0,14],[8,14],[8,18],[0,18]],C.gold,32),
  ];
  p.mesh(transformed(pointer,q));
  p.line([[-5,11,-128],[0,12,-118],[5,11,-128]],'#e8463c',2.6);
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
  // 第 43 轮：底座和 3D 版（第 21 轮）一样改哑光紫配金边，原来跟着皮肤的青铜色，卡通化后是一块发亮的橙色
  const metal='#8a5cf0',stone='#ffc93c';
  p.shadow([0,-133,0],95,.22);
  p.mesh(cached('ball-base'+metal+stone,()=>[
    ...lathe([[0,-130],[66,-130],[72,-125],[70,-119],[48,-115],[34,-104],[31,-87],[47,-80],[0,-80]],metal),
    ...lathe([[0,-129],[62,-129],[62,-126],[0,-126]],stone),
  ]));
  glass(p,[0,16,0],94,s,time);
  p.ring(46,-79,stone,.9);
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

// 第 42 轮：2D 回退命牌与 3D 命牌（stage/scenes/pillars.js 第 21、23 轮）同一套配色。
// 原来是米色牌身、灰褐细字、未排盘时一个小点，WebGL 创建失败的老机型上像四块空告示牌。
export const PILLAR_2D = {
  body: '#e8463c', cap: '#ffc93c', base: '#a85a30', face: '#fff6df', frame: '#e8463c', gold: '#ffc93c',
  edge: '#2b2240', tag: '#ffc93c', tagEdge: '#d8901e', tagInk: '#5a3410', coin: '#ffe9a8', coinInk: '#e0a21e',
  back: '#c8302a', backInk: '#8a1c16',
  wx: { 木: '#22c46c', 火: '#e8463c', 土: '#e0942a', 金: '#f2b318', 水: '#3a9cf0' },
};
export function drawPillars(p,s,time){
  const P=PILLAR_2D,progress=s.active?clamp(time/(s.duration||2.4)):1;
  p.shadow([0,-111,0],151,.18);
  p.mesh(cached('pillars-base-toon',()=>[
    ...shift(box(298,9,61,P.base),[0,-104,0]),...shift(box(290,4,57,P.cap),[0,-98,0]),
  ]));
  for(let i=0;i<4;i++){
    const entry=s.pillars?.[i],pose=pillarPose(i,progress),q=pose.rotation,at=point=>add(rotate(point,q),pose.position);
    p.mesh(transformed(cached('pillar-toon',()=>[
      ...box(49,164,28,P.body),...shift(box(53,6,32,P.cap),[0,-82,0]),...shift(box(53,6,32,P.cap),[0,82,0]),
    ]),q,pose.position));
    const front=pose.visible,z=front?14.3:-14.3,u=rotate([front?1:-1,0,0],q),v=[0,1,0];
    const rect=(cx,cy,w,h)=>[[cx-w/2,cy+h/2,z],[cx+w/2,cy+h/2,z],[cx+w/2,cy-h/2,z],[cx-w/2,cy-h/2,z]].map(pt=>at([front?pt[0]:-pt[0],pt[1],pt[2]]));
    if(!front){ // 卡背：深朱底、金色双线框、金色圆章上朱红「命」字
      p.face(rect(0,0,43,150),P.back,{stroke:P.gold,width:2});
      p.face(rect(0,0,35,140),P.back,{stroke:P.gold,width:1});
      p.blob(at([0,0,z]),11,P.gold,{shine:false,edge:P.tagEdge});
      p.text('命',at([0,0,z]),{size:12,u,v,color:P.backInk,weight:900,stroke:null,depth:false});
      continue;
    }
    p.face(rect(0,0,43,150),P.face,{stroke:P.frame,width:2.6});
    p.face(rect(0,0,37,144),P.face,{stroke:P.gold,width:1.1});
    p.face(rect(0,64,30,13),P.frame);
    p.text(entry?.label||['年柱','月柱','日柱','时柱'][i],at([0,64,z]),{size:9.5,u,v,color:'#ffffff',weight:900,stroke:null,depth:false});
    const unknownHour=i===3&&s.pillars?.length===3;
    const big=(txt,y,el,size)=>p.text(txt,at([0,y,z]),{size,u,v,color:P.wx[el]||P.gold,weight:900,stroke:P.edge});
    if(entry?.gan){big(entry.gan,24,entry.ganElement,30);big(entry.zhi,-18,entry.zhiElement,30);}
    else if(unknownHour){big('未',22,null,24);big('知',-16,null,24);}
    else for(const y of [24,-18]){ // 还没排盘：两枚金色问号圆章
      p.blob(at([0,y,z]),12,P.coin,{shine:false,edge:P.coinInk,shade:.9}); // 暗部不压灰，保持奶黄
      p.text('?',at([0,y+.5,z]),{size:15,u,v,color:P.coinInk,weight:900,stroke:null,depth:false});
    }
    const tag=entry?.shiShen||(unknownHour?'未计入':'');
    if(tag){
      p.face(rect(0,-60,Math.min(40,tag.length*9+10),13),P.tag,{stroke:P.tagEdge,width:1.2});
      p.text(tag,at([0,-60,z]),{size:8.5,u,v,color:P.tagInk,weight:900,stroke:null,depth:false});
    }
  }
}
