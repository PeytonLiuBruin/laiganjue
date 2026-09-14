import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeck,
  cardById,
  shuffleDeck,
  drawCards,
  takeTop,
  dailyCard,
  SPREADS,
  getSpread,
  initSession,
  shuffleSession,
  drawNext,
  flipCard,
  isFull,
  allFlipped,
  isDone,
  synthesize,
  synthesizeParts,
  countSynthTemplates,
  describeDraw,
  shareText,
  sealFor,
  toRoman,
  analyze,
} from '../src/modules/tarot/core.js';
import { MAJORS, MINORS, SUIT_ORDER, SUIT_GLYPHS, PIP_LAYOUT, SUIT_VERSES, SPREAD_VERSES, TEXT } from '../src/modules/tarot/data.js';
import { seeded } from '../src/core/rng.js';

const len = (s) => [...s].length;

test('buildDeck: 78 张，id 唯一，大牌 22，四花色各 14', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 78);
  assert.equal(new Set(deck.map((c) => c.id)).size, 78);
  assert.equal(deck.filter((c) => c.arcana === 'major').length, 22);
  for (const suit of SUIT_ORDER) {
    const cards = deck.filter((c) => c.suit === suit);
    assert.equal(cards.length, 14, suit);
    assert.deepEqual(
      cards.map((c) => c.rank).sort((a, b) => a - b),
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
  }
  // 名称 / 英文名唯一
  assert.equal(new Set(deck.map((c) => c.name)).size, 78);
  assert.equal(new Set(deck.map((c) => c.en)).size, 78);
});

test('大牌：编号 0–21、罗马数字正确、符号互不重复且为 SVG', () => {
  assert.equal(MAJORS.length, 22);
  MAJORS.forEach((m, i) => {
    assert.equal(m.no, i);
    assert.equal(m.roman, toRoman(i), m.name);
    assert.ok(m.glyph.includes('<'), m.name + ' glyph should be inline svg');
    assert.equal(len(m.seal), 1, m.name + ' seal');
    assert.ok(m.verse.includes('\n'), m.name + ' verse two lines');
  });
  assert.equal(new Set(MAJORS.map((m) => m.glyph)).size, 22, 'glyphs distinct');
  assert.ok(MAJORS.filter((m) => m.tone >= 1).length >= 10);
  assert.ok(MAJORS.filter((m) => m.tone <= -1).length >= 3);
});

test('大牌文案长度：正位 80–120、逆位 60–90、爱情/事业/建议 15–30，关键词各 3', () => {
  for (const m of MAJORS) {
    assert.ok(len(m.up) >= 80 && len(m.up) <= 120, `${m.name}.up=${len(m.up)}`);
    assert.ok(len(m.rev) >= 60 && len(m.rev) <= 90, `${m.name}.rev=${len(m.rev)}`);
    for (const f of ['love', 'career', 'advice']) assert.ok(len(m[f]) >= 15 && len(m[f]) <= 30, `${m.name}.${f}=${len(m[f])}`);
    assert.equal(m.keywords.up.length, 3);
    assert.equal(m.keywords.rev.length, 3);
  }
});

test('小牌文案长度：正位 50–80、逆位 40–60，关键词各 3', () => {
  for (const suit of SUIT_ORDER) {
    assert.equal(MINORS[suit].length, 14);
    MINORS[suit].forEach((c, i) => {
      assert.ok(len(c.up) >= 50 && len(c.up) <= 80, `${suit}${i + 1}.up=${len(c.up)}`);
      assert.ok(len(c.rev) >= 40 && len(c.rev) <= 60, `${suit}${i + 1}.rev=${len(c.rev)}`);
      assert.equal(c.k.length, 3);
      assert.equal(c.r.length, 3);
    });
  }
});

test('内容无占位词、无重复解读', () => {
  const deck = buildDeck();
  const all = deck.flatMap((c) => [c.up, c.rev, c.love, c.career, c.advice].filter(Boolean));
  for (const t of all) assert.ok(!/TODO|待补|示例|lorem/i.test(t), t.slice(0, 20));
  assert.equal(new Set(deck.map((c) => c.up)).size, 78);
  assert.equal(new Set(deck.map((c) => c.rev)).size, 78);
});

test('牌面数据：花色 SVG 四种、点数排布 1–10 数量正确', () => {
  assert.deepEqual(Object.keys(SUIT_GLYPHS).sort(), [...SUIT_ORDER].sort());
  for (let r = 1; r <= 10; r++) assert.equal(PIP_LAYOUT[r].length, r, 'pips ' + r);
  for (const suit of SUIT_ORDER) assert.equal(SUIT_VERSES[suit].length, 4);
});

test('shuffleDeck: 保持集合、可复现、不改原数组', () => {
  const deck = buildDeck();
  const a = shuffleDeck(deck, seeded('tarot-a'));
  const b = shuffleDeck(deck, seeded('tarot-a'));
  const c = shuffleDeck(deck, seeded('tarot-b'));
  assert.equal(a.length, 78);
  assert.deepEqual([...a].sort((x, y) => x.id.localeCompare(y.id)), [...deck].sort((x, y) => x.id.localeCompare(y.id)));
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id), 'same seed same order');
  assert.notDeepEqual(a.map((x) => x.id), c.map((x) => x.id));
  assert.equal(deck[0].id, 'M0', 'original untouched');
});

test('drawCards: 不重复、数量正确、reversedRate 极值', () => {
  const deck = buildDeck();
  const rnd = seeded(42);
  const d = drawCards(deck, 10, rnd);
  assert.equal(d.length, 10);
  assert.equal(new Set(d.map((x) => x.card.id)).size, 10);
  assert.ok(drawCards(deck, 30, seeded(1), { reversedRate: 0 }).every((x) => !x.reversed));
  assert.ok(drawCards(deck, 30, seeded(2), { reversedRate: 1 }).every((x) => x.reversed));
  assert.equal(drawCards(deck, 100, seeded(3)).length, 78, 'capped at deck size');
  // 约 30% 逆位
  let rev = 0;
  const N = 4000;
  const r2 = seeded('rate');
  for (let i = 0; i < N; i++) if (drawCards(deck, 1, r2)[0].reversed) rev++;
  assert.ok(Math.abs(rev / N - 0.3) < 0.03, 'reversed ~30%: ' + rev / N);
});

test('takeTop: 取顶牌并返回剩余', () => {
  const deck = buildDeck();
  const { draw, rest } = takeTop(deck, seeded(5));
  assert.equal(draw.card.id, 'M0');
  assert.equal(rest.length, 77);
  assert.deepEqual(takeTop([], seeded(1)), { draw: null, rest: [] });
});

test('dailyCard: 同日一致，跨日会变', () => {
  const d1 = dailyCard(new Date(2026, 8, 13, 8));
  const d2 = dailyCard(new Date(2026, 8, 13, 23, 59));
  assert.equal(d1.card.id, d2.card.id);
  assert.equal(d1.reversed, d2.reversed);
  assert.equal(d1.dateKey, '2026-09-13');
  const ids = new Set();
  for (let i = 0; i < 30; i++) ids.add(dailyCard(new Date(2026, 0, 1 + i)).card.id);
  assert.ok(ids.size > 15, 'varies across days: ' + ids.size);
});

test('SPREADS: 五种牌阵，牌位数正确，每日一牌标记', () => {
  assert.equal(SPREADS.length, 5);
  const byId = Object.fromEntries(SPREADS.map((s) => [s.id, s]));
  assert.equal(byId.single.positions.length, 1);
  assert.equal(byId.time.positions.length, 3);
  assert.equal(byId.relation.positions.length, 3);
  assert.equal(byId.choice.positions.length, 3);
  assert.equal(byId.daily.positions.length, 1);
  assert.equal(byId.daily.daily, true);
  for (const s of SPREADS) {
    assert.equal(len(s.seal), 1);
    assert.ok(SPREAD_VERSES[s.id] && SPREAD_VERSES[s.id].length >= 1);
  }
  assert.equal(getSpread('nope').id, 'single');
});

test('会话：洗牌计数、逐张抽牌、翻牌、完成', () => {
  let s = initSession('time', seeded(9));
  assert.equal(s.deck.length, 78);
  s = shuffleSession(s, seeded(10));
  s = shuffleSession(s, seeded(11));
  assert.equal(s.shuffles, 2);
  const rnd = seeded(12);
  s = drawNext(s, rnd);
  s = drawNext(s, rnd);
  assert.equal(isFull(s), false);
  s = drawNext(s, rnd);
  assert.equal(isFull(s), true);
  assert.equal(s.deck.length, 75);
  assert.equal(new Set(s.draws.map((d) => d.card.id)).size, 3);
  const before = s;
  assert.equal(drawNext(s, rnd), before, 'full spread ignores draw');
  assert.equal(allFlipped(s), false);
  s = flipCard(s, 0);
  s = flipCard(s, 0); // 重复翻无效
  assert.equal(s.draws[0].flipped, true);
  assert.equal(isDone(s), false);
  s = flipCard(s, 1);
  s = flipCard(s, 2);
  assert.equal(isDone(s), true);
});

test('会话：每日一牌抽到的是当日固定牌', () => {
  const date = new Date(2026, 8, 13);
  let s = initSession('daily', seeded(1));
  s = drawNext(s, seeded(99), { date });
  const d = dailyCard(date);
  assert.equal(s.draws[0].card.id, d.card.id);
  assert.equal(s.draws[0].reversed, d.reversed);
  assert.equal(isFull(s), true);
});

test('synthesize: 模板 ≥ 12、每种牌阵均有输出、纯函数可复现、能区分分支', () => {
  assert.ok(countSynthTemplates() >= 12, 'templates: ' + countSynthTemplates());
  const deck = buildDeck();
  for (const sp of SPREADS) {
    for (let i = 0; i < 20; i++) {
      const draws = drawCards(deck, sp.positions.length, seeded(sp.id + i));
      const t = synthesize(sp.id, draws);
      assert.ok(typeof t === 'string' && len(t) > 20, sp.id);
      assert.equal(t, synthesize(sp.id, draws), 'deterministic');
    }
  }
  const sun = { card: cardById('M19'), reversed: false };
  const tower = { card: cardById('M16'), reversed: false };
  const cups3 = { card: cardById('C3'), reversed: false };
  assert.ok(synthesize('time', [tower, cups3, sun]).includes('向上'));
  assert.ok(synthesize('time', [sun, cups3, tower]).includes('由高走低'));
  assert.ok(synthesize('choice', [sun, tower, cups3]).includes('选择 A'));
  assert.ok(synthesize('choice', [tower, sun, cups3]).includes('选择 B'));
  assert.ok(synthesize('relation', [sun, tower, cups3]).includes('你这边'));
  const allRev = [sun, tower, cups3].map((d) => ({ ...d, reversed: true }));
  assert.ok(synthesize('time', allRev).includes('全部逆位'));
  const cupsOnly = ['C2', 'C3', 'C9'].map((id) => ({ card: cardById(id), reversed: false }));
  assert.ok(synthesize('relation', cupsOnly).includes('水意'));
  assert.ok(synthesize('single', [sun]).includes('大牌'));
  assert.ok(synthesize('single', [cups3]).includes('小牌'));
  assert.equal(synthesize('single', []), '');
});

test('analyze / describeDraw / shareText / sealFor', () => {
  const draws = [
    { card: cardById('M0'), reversed: true },
    { card: cardById('W5'), reversed: false },
    { card: cardById('W12'), reversed: false },
  ];
  const st = analyze(draws);
  assert.equal(st.majors, 1);
  assert.equal(st.reversed, 1);
  assert.equal(st.dominant, 'wands');
  assert.equal(st.courts, 1);
  const d = describeDraw(draws[0]);
  assert.ok(d.startsWith('愚者（逆位）— 鲁莽 / 犹疑 / 逃避 · '));
  assert.ok(d.includes(cardById('M0').rev));
  const share = shareText('time', draws, { question: '要不要换工作' });
  assert.ok(share.includes('【塔罗 · 时间之流】问：要不要换工作'));
  assert.ok(share.includes('过去 · 愚者（逆位）'));
  assert.ok(share.includes(TEXT.synthesisLabel + '：'));
  assert.equal(sealFor('single', [draws[0]]), '始');
  assert.equal(sealFor('time', draws), '流');
  assert.equal(sealFor('single', [draws[1]]), '火');
});

test('synthesizeParts: 分句带标签、拼接后等于 synthesize、分段长度可控', () => {
  const deck = buildDeck();
  const KEYS = new Set(['major', 'spread', 'element', 'court', 'reversed', 'tone']);
  for (const sp of SPREADS) {
    for (let i = 0; i < 40; i++) {
      const draws = drawCards(deck, sp.positions.length, seeded('parts' + sp.id + i));
      const parts = synthesizeParts(sp.id, draws);
      assert.ok(parts.length >= 2, sp.id);
      for (const p of parts) assert.ok(KEYS.has(p.key) && typeof p.text === 'string' && p.text.length > 0, sp.id + ' ' + p.key);
      assert.equal(parts[0].key, 'major');
      assert.equal(parts[parts.length - 1].key, 'tone');
      assert.equal(parts.map((p) => p.text).join(''), synthesize(sp.id, draws));
      if (sp.positions.length > 1) {
        // 抽屉里分成「综合」与「气息」两段，每段不超过 120 字
        const main = parts.filter((p) => ['major', 'spread', 'element'].includes(p.key)).map((p) => p.text).join('');
        const air = parts.filter((p) => ['court', 'reversed', 'tone'].includes(p.key)).map((p) => p.text).join('');
        assert.ok(len(main) <= 120, sp.id + ' main=' + len(main));
        assert.ok(len(air) <= 120, sp.id + ' air=' + len(air));
      }
    }
  }
  assert.deepEqual(synthesizeParts('single', []), []);
});
