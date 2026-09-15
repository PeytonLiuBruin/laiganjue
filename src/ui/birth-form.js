// 生辰表单（壳层共享组件）：年 / 月 / 日 / 时辰 / 性别。姻缘、财运、事业三个模块共用，
// 值的形状与 ctx.profile 一致：{ y, m, d, hour(-1 不知道), gender('male'|'female') }。
import { h, select, field, chips, clear } from './kit.js';
import { daysInMonth } from '../core/destiny.js';

const YEAR_NOW = new Date().getFullYear();
export const HOURS = [
  { value: -1, label: '不知道' },
  { value: 0, label: '子 23–1' },
  { value: 2, label: '丑 1–3' },
  { value: 4, label: '寅 3–5' },
  { value: 6, label: '卯 5–7' },
  { value: 8, label: '辰 7–9' },
  { value: 10, label: '巳 9–11' },
  { value: 12, label: '午 11–13' },
  { value: 14, label: '未 13–15' },
  { value: 16, label: '申 15–17' },
  { value: 18, label: '酉 17–19' },
  { value: 20, label: '戌 19–21' },
  { value: 22, label: '亥 21–23' },
];
export const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
];

export function normalizeBirth(v, fallback = { y: 1995, m: 6, d: 18, hour: -1, gender: 'male' }) {
  const src = v && typeof v === 'object' ? v : {};
  const y = Math.min(YEAR_NOW, Math.max(1930, Number(src.y) || fallback.y));
  const m = Math.min(12, Math.max(1, Number(src.m) || fallback.m));
  const d = Math.min(daysInMonth(y, m), Math.max(1, Number(src.d) || fallback.d));
  const hour = src.hour == null || Number(src.hour) < 0 ? -1 : Number(src.hour);
  const gender = src.gender === 'female' ? 'female' : src.gender === 'male' ? 'male' : fallback.gender;
  return { y, m, d, hour, gender };
}

export function describeBirth(v) {
  const b = normalizeBirth(v);
  const hour = HOURS.find((x) => x.value === b.hour);
  return `${b.y}.${String(b.m).padStart(2, '0')}.${String(b.d).padStart(2, '0')}${b.hour >= 0 && hour ? ' ' + hour.label.slice(0, 1) + '时' : ''} · ${b.gender === 'female' ? '女' : '男'}`;
}

/**
 * createBirthForm(ctx, { value, onChange(value), hour, gender, title }) → { el, value, set(v), setDisabled(v) }
 */
export function createBirthForm(ctx, { value, onChange, hour = true, gender = true, title = '' } = {}) {
  let val = normalizeBirth(value);
  const years = [];
  for (let y = YEAR_NOW; y >= 1930; y--) years.push({ value: y, label: `${y}` });
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月` }));
  const yearSel = select(years, { value: val.y, onChange: (v) => set('y', Number(v)) });
  const monthSel = select(months, { value: val.m, onChange: (v) => set('m', Number(v)) });
  const daySel = select([], { value: val.d, onChange: (v) => set('d', Number(v)) });
  const hourSel = hour ? select(HOURS, { value: val.hour, onChange: (v) => set('hour', Number(v)) }) : null;
  const genderChips = gender ? chips(GENDERS, { value: val.gender, onChange: (v) => set('gender', v) }) : null;
  if (genderChips) {
    genderChips.el.setAttribute('role', 'group');
    genderChips.el.setAttribute('aria-label', '性别');
  }
  yearSel.setAttribute('aria-label', `${title || ''}出生年`);
  monthSel.setAttribute('aria-label', `${title || ''}出生月`);
  daySel.setAttribute('aria-label', `${title || ''}出生日`);

  function fillDays() {
    const n = daysInMonth(val.y, val.m);
    if (val.d > n) val = { ...val, d: n };
    clear(daySel);
    for (let d = 1; d <= n; d++) daySel.append(h('option', { value: d, selected: d === val.d }, `${d} 日`));
  }
  fillDays();
  function set(k, v) {
    val = { ...val, [k]: v };
    if (k === 'y' || k === 'm') fillDays();
    ctx?.haptic?.tap?.();
    onChange?.(val);
  }
  const row2 = hour || gender ? h('div', { class: 'bf-row2' }, hourSel && field('时辰', hourSel), genderChips && field('性别', genderChips.el)) : null;
  const el = h('div', { class: 'birth-form' }, title ? h('div', { class: 'birth-form-title' }, title) : null, h('div', { class: 'bf-row3' }, field('年', yearSel), field('月', monthSel), field('日', daySel)), row2);
  return {
    el,
    get value() {
      return val;
    },
    set(v) {
      val = normalizeBirth(v, val);
      yearSel.value = String(val.y);
      monthSel.value = String(val.m);
      fillDays();
      if (hourSel) hourSel.value = String(val.hour);
      genderChips?.set(val.gender);
    },
    setDisabled(disabled) {
      el.querySelectorAll('select, button').forEach((node) => { node.disabled = disabled; });
    },
  };
}
