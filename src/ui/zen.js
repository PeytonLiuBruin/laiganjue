// 静观 · 屏保模式。全屏、极简、可当作桌面/床头屏保：
// 大字时间、农历干支、一日宜忌、一句古语（缓慢轮换）、十二时辰日晷环 + 八卦慢转 + 呼吸太极 + 微尘粒子。
// 进入：首页左上角「静」/ 设置 / 闲置自动 / 直接打开 #/zen。退出：轻触任意处或 Esc。
import { h, clear, fromHTML } from './kit.js';
import { almanacSummary } from '../core/lunar.js';
import { dailyRng, seeded } from '../core/rng.js';

export const ZEN_LINES = [
  '万物静观皆自得',
  '行到水穷处，坐看云起时',
  '心若冰清，天塌不惊',
  '静水流深，沉默如金',
  '大道至简，衍化至繁',
  '人闲桂花落，夜静春山空',
  '不以物喜，不以己悲',
  '天行健，君子以自强不息',
  '上善若水，水善利万物而不争',
  '知止而后有定，定而后能静',
  '云在青天水在瓶',
  '一花一世界，一叶一菩提',
  '此心安处是吾乡',
  '采菊东篱下，悠然见南山',
  '明月松间照，清泉石上流',
  '春有百花秋有月，夏有凉风冬有雪',
  '致虚极，守静笃',
  '海纳百川，有容乃大',
  '欲速则不达，见小利则大事不成',
  '宠辱不惊，闲看庭前花开花落',
  '去留无意，漫随天外云卷云舒',
  '山中何所有，岭上多白云',
  '流水不争先，争的是滔滔不绝',
  '物来顺应，未来不迎，当时不杂，既过不恋',
  '日日是好日',
  '夜深忽梦少年事',
  '疏影横斜水清浅，暗香浮动月黄昏',
  '万物皆有裂痕，那是光照进来的地方',
  '天地有大美而不言',
  '静以修身，俭以养德',
  '知人者智，自知者明',
  '问渠那得清如许，为有源头活水来',
  '一念放下，万般自在',
  '闲敲棋子落灯花',
  '风来疏竹，风过而竹不留声',
  '千江有水千江月，万里无云万里天',
  '花开花谢自有时，总赖东君主',
  '事能知足心常惬，人到无求品自高',
  '但行好事，莫问前程',
  '慢慢来，比较快',
];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];

export function createZen({ platform, onEnter, onExit, getAccent }) {
  let el = null;
  let canvas = null;
  let ctx2d = null;
  let raf = null;
  let tick = null;
  let lineTimer = null;
  let wakeLock = null;
  let active = false;
  let enteredAt = 0;
  let particles = [];
  let lastMinute = -1;
  let lineIndex = 0;
  const reduce = platform.prefersReducedMotion;

  /* ---------- 构建 ---------- */
  function build() {
    canvas = h('canvas', { class: 'zen-canvas', attrs: { 'aria-hidden': 'true' } });
    const ring = buildDial();
    const timeEl = h('div', { class: 'zen-time t-num' });
    const dateEl = h('div', { class: 'zen-date' });
    const lunarEl = h('div', { class: 'zen-lunar' });
    const yijiEl = h('div', { class: 'zen-yiji' });
    const lineEl = h('div', { class: 'zen-line' });
    const hintEl = h('div', { class: 'zen-hint' }, '轻触任意处返回');
    const center = h('div', { class: 'zen-center' }, timeEl, dateEl, lunarEl, yijiEl);
    const emblem = fromHTML(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20" class="zen-emblem" aria-hidden="true"><g class="zen-taiji">
        <circle r="9" class="zen-taiji-bg"/>
        <path d="M0,-9 A9,9 0 0 1 0,9 A4.5,4.5 0 0 1 0,0 A4.5,4.5 0 0 0 0,-9 Z" class="zen-taiji-dark"/>
        <circle cx="0" cy="-4.5" r="1.5" class="zen-taiji-dark"/>
        <circle cx="0" cy="4.5" r="1.5" class="zen-taiji-light"/>
      </g></svg>`,
    );
    el = h('div', { class: 'zen', attrs: { role: 'dialog', 'aria-label': '屏保' } }, canvas, ring.el, emblem, center, lineEl, hintEl);
    el.__refs = { timeEl, dateEl, lunarEl, yijiEl, lineEl, hintEl, center, ring };
    // 退出：轻触（进入后 400ms 内忽略，避免进入手势立刻触发退出）
    el.addEventListener('pointerdown', (e) => {
      if (performance.now() - enteredAt < 400) return;
      e.preventDefault();
      exit();
    });
    return el;
  }

  /** 日晷环：外圈十二时辰（子在下=夜半，午在上=正午），中圈八卦慢转，中心太极 */
  function buildDial() {
    const size = 100;
    const c = size / 2;
    const rOuter = 47;
    const rInner = 33;
    let inner = '';
    // 外圈刻度与时辰
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.PI / 2; // 0h 在底部
      const isHour = i % 2 === 0;
      const r1 = rOuter - (isHour ? 3 : 1.6);
      inner += `<line x1="${c + Math.cos(a) * r1}" y1="${c + Math.sin(a) * r1}" x2="${c + Math.cos(a) * rOuter}" y2="${c + Math.sin(a) * rOuter}" class="zen-tick${isHour ? ' major' : ''}"/>`;
    }
    for (let i = 0; i < 12; i++) {
      // 子时 23:00–01:00，中心在 0h → 底部
      const a = (i / 12) * Math.PI * 2 + Math.PI / 2;
      const r = rOuter - 8.5;
      inner += `<text x="${c + Math.cos(a) * r}" y="${c + Math.sin(a) * r}" class="zen-branch" data-i="${i}" text-anchor="middle" dominant-baseline="central">${BRANCHES[i]}</text>`;
    }
    // 八卦环（旋转组）
    let bagua = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      bagua += `<text x="${c + Math.cos(a) * rInner}" y="${c + Math.sin(a) * rInner}" class="zen-trigram" text-anchor="middle" dominant-baseline="central" transform="rotate(${(i / 8) * 360} ${c + Math.cos(a) * rInner} ${c + Math.sin(a) * rInner})">${TRIGRAMS[i]}</text>`;
    }
    const svgEl = fromHTML(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" class="zen-dial" aria-hidden="true">
        <circle cx="${c}" cy="${c}" r="${rOuter}" class="zen-circle"/>
        <circle cx="${c}" cy="${c}" r="${rOuter - 12}" class="zen-circle faint"/>
        ${inner}
        <g class="zen-bagua">${bagua}<circle cx="${c}" cy="${c}" r="${rInner - 5.5}" class="zen-circle faint"/></g>
        <circle class="zen-now" r="1.6" cx="${c}" cy="${c + rOuter}"/>
      </svg>`,
    );
    const wrap = h('div', { class: 'zen-ring' }, svgEl);
    const now = svgEl.querySelector('.zen-now');
    const branches = Array.from(svgEl.querySelectorAll('.zen-branch'));
    return {
      el: wrap,
      update(date) {
        const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        const a = (hours / 24) * Math.PI * 2 + Math.PI / 2; // 0h 底部
        now.setAttribute('cx', (c + Math.cos(a) * rOuter).toFixed(2));
        now.setAttribute('cy', (c + Math.sin(a) * rOuter).toFixed(2));
        const shichen = Math.floor(((date.getHours() + 1) % 24) / 2);
        branches.forEach((b, i) => b.classList.toggle('active', i === shichen));
      },
    };
  }

  /* ---------- 内容刷新 ---------- */
  function refresh(force = false) {
    const now = new Date();
    const { timeEl, dateEl, lunarEl, yijiEl, ring, center } = el.__refs;
    ring.update(now);
    const minute = now.getMinutes();
    if (!force && minute === lastMinute) return;
    lastMinute = minute;
    timeEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    try {
      const a = almanacSummary(now);
      dateEl.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${a.week}${a.jieqi ? ' · ' + a.jieqi : ''}`;
      lunarEl.textContent = `${a.yearGanZhi}年 ${a.lunarText} · ${a.dayGanZhi}日 · ${BRANCHES[Math.floor(((now.getHours() + 1) % 24) / 2)]}时`;
      const yi = a.yi.find((x) => x !== '诸事不宜') || '静坐';
      const ji = a.ji.find((x) => x !== '诸事不宜') || '躁进';
      yijiEl.textContent = `宜 ${yi} · 忌 ${ji}`;
    } catch {
      dateEl.textContent = now.toLocaleDateString('zh-CN');
    }
    // 防烙印：每分钟整体微移
    if (!reduce) {
      const r = seeded(`${now.getHours()}:${minute}`);
      center.style.transform = `translate(${(r() - 0.5) * 12}px, ${(r() - 0.5) * 12}px)`;
    }
  }

  function showLine(first = false) {
    const { lineEl } = el.__refs;
    const pool = ZEN_LINES;
    if (first) {
      lineIndex = Math.floor(dailyRng('zen')() * pool.length);
    } else {
      lineIndex = (lineIndex + 1 + Math.floor(Math.random() * (pool.length - 2))) % pool.length;
    }
    const text = pool[lineIndex];
    if (first || reduce) {
      lineEl.textContent = text;
      lineEl.classList.add('show');
      return;
    }
    lineEl.classList.remove('show');
    setTimeout(() => {
      lineEl.textContent = text;
      lineEl.classList.add('show');
    }, 1400);
  }

  /* ---------- 粒子 ---------- */
  function setupParticles() {
    if (reduce) return;
    ctx2d = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    el.__resize = resize;
    const count = Math.min(70, Math.floor((innerWidth * innerHeight) / 9000));
    particles = Array.from({ length: count }, () => spawn(true));
    let last = performance.now();
    const loop = (t) => {
      if (!active) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(50, t - last);
      if (dt < 30) return; // ~30fps 足够，省电
      last = t;
      draw(dt / 1000);
    };
    raf = requestAnimationFrame(loop);
  }
  function spawn(anywhere) {
    return {
      x: Math.random(),
      y: anywhere ? Math.random() : 1.05,
      r: 0.4 + Math.random() * 1.4,
      v: 0.008 + Math.random() * 0.02,
      sway: Math.random() * Math.PI * 2,
      swayV: 0.2 + Math.random() * 0.6,
      a: 0.15 + Math.random() * 0.45,
    };
  }
  function draw(dt) {
    const w = canvas.width;
    const hgt = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx2d.clearRect(0, 0, w, hgt);
    const color = getAccent ? getAccent() : '#d4af5a';
    for (const p of particles) {
      p.y -= p.v * dt;
      p.sway += p.swayV * dt;
      if (p.y < -0.05) Object.assign(p, spawn(false));
      const x = (p.x + Math.sin(p.sway) * 0.012) * w;
      const y = p.y * hgt;
      const twinkle = 0.7 + 0.3 * Math.sin(p.sway * 1.7);
      ctx2d.globalAlpha = p.a * twinkle;
      ctx2d.fillStyle = color;
      ctx2d.beginPath();
      ctx2d.arc(x, y, p.r * dpr, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;
  }

  /* ---------- 常亮 / 全屏 ---------- */
  async function requestWake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } catch {
      wakeLock = null;
    }
  }
  function onVisibility() {
    if (active && document.visibilityState === 'visible' && !wakeLock) requestWake();
  }
  function onKey(e) {
    if (e.key === 'Escape') exit();
  }

  /* ---------- 进入 / 退出 ---------- */
  function enter({ fullscreen = false } = {}) {
    if (active) return;
    active = true;
    enteredAt = performance.now();
    if (!el) build();
    document.body.append(el);
    document.documentElement.classList.add('zen-active');
    requestAnimationFrame(() => el.classList.add('show'));
    lastMinute = -1;
    refresh(true);
    showLine(true);
    tick = setInterval(() => refresh(false), 1000);
    lineTimer = setInterval(() => showLine(false), 45000);
    setupParticles();
    requestWake();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('keydown', onKey);
    if (fullscreen && document.documentElement.requestFullscreen && !window.matchMedia('(display-mode: standalone)').matches) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
    setTimeout(() => el && el.__refs.hintEl.classList.add('fade'), 3500);
    onEnter && onEnter();
  }

  function exit() {
    if (!active) return;
    active = false;
    clearInterval(tick);
    clearInterval(lineTimer);
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    if (el.__resize) window.removeEventListener('resize', el.__resize);
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    document.documentElement.classList.remove('zen-active');
    el.classList.remove('show');
    const node = el;
    setTimeout(() => {
      node.remove();
      if (node.__refs) node.__refs.hintEl.classList.remove('fade');
    }, 500);
    onExit && onExit();
  }

  return {
    enter,
    exit,
    toggle() {
      active ? exit() : enter({ fullscreen: true });
    },
    get active() {
      return active;
    },
  };
}
