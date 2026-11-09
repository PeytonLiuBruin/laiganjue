#!/usr/bin/env python3
"""把 Noto Serif SC 与 Cinzel 裁成只含来感觉用到的字的 woff2，放进 assets/fonts/。

用法（见 assets/fonts/README.md）：
  python3 -m pip install fonttools brotli
  node scripts/font-charset.mjs
  python3 scripts/fonts-subset.py --noto 'NotoSerifSC[wght].ttf' --cinzel 'Cinzel[wght].ttf'

两个源文件来自 github.com/google/fonts 的 ofl/notoserifsc 与 ofl/cinzel（SIL OFL 1.1，未声明保留字体名）。
Noto Serif SC 保留 400–900 字重轴（一个可变字体文件覆盖页面用到的 400/600/700/900），
Cinzel 只保留 ASCII，字重轴 500–700。先裁字再取字重区间，避免 instancer 之后子集化报错。
"""
import argparse
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'fonts')


def make(src, text, axis, out):
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    font = TTFont(src, lazy=False)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    tmp = out + '.tmp.ttf'
    font.save(tmp)
    font = instancer.instantiateVariableFont(TTFont(tmp), {'wght': axis})
    os.remove(tmp)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{os.path.relpath(out, ROOT)}: {os.path.getsize(out) / 1024:.0f} KB, {len(font.getGlyphOrder())} glyphs')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--noto', required=True, help='NotoSerifSC[wght].ttf')
    ap.add_argument('--cinzel', required=True, help='Cinzel[wght].ttf')
    args = ap.parse_args()
    with open(os.path.join(OUT, 'charset.txt'), encoding='utf-8') as f:
        text = f.read()
    ascii_text = ''.join(chr(c) for c in range(0x20, 0x7f)) + '·—’‘“”'
    make(args.noto, text, (400, 900), os.path.join(OUT, 'NotoSerifSC-subset.woff2'))
    make(args.cinzel, ascii_text, (500, 700), os.path.join(OUT, 'Cinzel-subset.woff2'))


if __name__ == '__main__':
    main()
