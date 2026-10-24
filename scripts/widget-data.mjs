// 主屏小组件的黄历数据：用 App 内同一套农历库（src/core/lunar.js）预先算好每天的农历、干支、宜忌，
// 写成 ios/App/LaiganjueWidget/almanac.json 打包进小组件。小组件本身不带农历算法，只按日期查表。
// 用法：node scripts/widget-data.mjs [--from 2026-01-01] [--years 4]
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { almanacSummary } from '../src/core/lunar.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 一天的小组件条目：字段尽量短，宜忌各取前 4 项 */
export function widgetDay(date) {
  const a = almanacSummary(date);
  return {
    l: a.lunarText,
    g: `${a.yearGanZhi}年 ${a.dayGanZhi}日`,
    z: a.zodiac,
    w: a.week,
    y: a.yi.slice(0, 4),
    j: a.ji.slice(0, 4),
    t: a.jieqi || a.festivals[0] || '',
  };
}

export function buildTable(from, years) {
  const days = {};
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const end = new Date(d.getFullYear() + years, d.getMonth(), d.getDate(), 12);
  for (; d < end; d.setDate(d.getDate() + 1)) days[dayKey(d)] = widgetDay(d);
  return days;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [y, m, dd] = opt('--from', '2026-01-01').split('-').map(Number);
  const years = Number(opt('--years', '4'));
  const days = buildTable(new Date(y, m - 1, dd), years);
  const outDir = path.join(root, 'ios/App/LaiganjueWidget');
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, 'almanac.json');
  await writeFile(file, JSON.stringify({ v: 1, days }));
  console.log(`写入 ${Object.keys(days).length} 天 → ${path.relative(root, file)}`);
}
