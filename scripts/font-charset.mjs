// 内置字体要覆盖的字符：src/ 下所有会显示的文字（玩法文案、签诗、农历库生成的宜忌神煞名等）+ ASCII + 常用中文标点。
// node scripts/font-charset.mjs            写 assets/fonts/charset.txt（字体子集的依据）
// node scripts/font-charset.mjs --check    只检查 charset.txt 是否覆盖全部用到的字，缺字时列出并以 1 退出
// 改了文案后缺字：先运行本脚本，再按 assets/fonts/README.md 重新生成字体子集。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHARSET_FILE = path.join(root, 'assets/fonts/charset.txt');
const EXTRA = '，。、；：？！「」『』（）—…·《》“”‘’～￥〇○●◎△▲☆★◆◇①②③④⑤⑥⑦⑧⑨⑩';

/** 收集 src/ 里出现的全部可见字符（含 ASCII 可打印字符与常用标点），按码位排序。 */
export function collectChars(dir = path.join(root, 'src')) {
  const set = new Set(EXTRA);
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|cjs|mjs|css|html|json)$/.test(f)) for (const ch of fs.readFileSync(p, 'utf8')) if (ch.codePointAt(0) >= 0x20) set.add(ch);
    }
  };
  walk(dir);
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

/** 汉字（含扩展 A 与兼容区）——字体子集必须全部覆盖的部分。 */
export const isHan = (ch) => /[㐀-䶿一-鿿豈-﫿]/.test(ch);

export function missingHan(charset = fs.readFileSync(CHARSET_FILE, 'utf8')) {
  const have = new Set(charset);
  return collectChars().filter((ch) => isHan(ch) && !have.has(ch));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const miss = missingHan();
    if (miss.length) {
      console.error(`内置字体缺 ${miss.length} 个字：${miss.join('')}\n按 assets/fonts/README.md 重新生成字体子集。`);
      process.exit(1);
    }
    console.log('内置字体覆盖了全部用到的汉字');
  } else {
    const chars = collectChars();
    fs.mkdirSync(path.dirname(CHARSET_FILE), { recursive: true });
    fs.writeFileSync(CHARSET_FILE, chars.join(''));
    console.log(`charset.txt：${chars.length} 个字符，其中汉字 ${chars.filter(isHan).length} 个`);
  }
}
