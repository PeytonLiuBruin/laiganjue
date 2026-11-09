# 内置字体（字体子集）

来感觉的标题、签诗等用 **Noto Serif SC**（思源宋体的 Google 版），少量英文装饰字用 **Cinzel**。
以前从 Google Fonts 在线加载：离线时会退回手机自带字体、每次启动先闪一下系统字、还会向第三方发请求。
现在只保留 App 用到的字，随网页和 App 一起发布：

| 文件 | 内容 | 大小 |
| --- | --- | --- |
| `NotoSerifSC-subset.woff2` | 可变字体，字重 400–900，`charset.txt` 里的约 3100 个字符（汉字约 2900） | 约 1.1 MB |
| `Cinzel-subset.woff2` | 可变字体，字重 500–700，ASCII | 约 24 KB |
| `charset.txt` | 子集包含的字符（由 `scripts/font-charset.mjs` 从 `src/` 收集） | |
| `OFL-*.txt` | 两套字体的 SIL Open Font License 1.1（都没有声明保留字体名，可以裁剪后再分发） | |

`src/template.html` 用 `@font-face` 引用 `fonts/…`，构建时复制到 `dist/fonts` 与 `www/fonts`。

## 文案里加了新字之后

`npm test` 里的 `tests/fonts.test.mjs` 会列出缺的字。重新生成：

```bash
python3 -m pip install fonttools brotli
# 源字体来自 github.com/google/fonts：ofl/notoserifsc/NotoSerifSC[wght].ttf 与 ofl/cinzel/Cinzel[wght].ttf
git clone --depth 1 --filter=blob:none --sparse https://github.com/google/fonts /tmp/gfonts
git -C /tmp/gfonts sparse-checkout set ofl/notoserifsc ofl/cinzel
node scripts/font-charset.mjs
python3 scripts/fonts-subset.py --noto '/tmp/gfonts/ofl/notoserifsc/NotoSerifSC[wght].ttf' --cinzel '/tmp/gfonts/ofl/cinzel/Cinzel[wght].ttf'
```

没生成之前缺的字也能显示（按 `--font-serif` 字体栈退回系统宋体），只是那几个字的字形不一致。
