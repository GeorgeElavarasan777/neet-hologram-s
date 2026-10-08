"""Fonts for the Godot edition: Inter + JetBrains Mono, plus small Noto fallbacks, cut down to exactly the
characters in godot/content (Greek, sub/superscripts, math) so the web download stays small (~340 KB).
Run after tools/godot-content.mjs whenever the content changes:   python tools/godot-fonts.py
Needs fontTools (pip install fonttools). Source fonts are downloaded once into tools/fonts-src/ (SIL OFL)."""
import glob
import json
import os
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'fonts-src')
OUT = os.path.join(ROOT, 'godot', 'assets', 'fonts')
FONTS = {
    'Inter[opsz,wght].ttf': 'ofl/inter/Inter%5Bopsz,wght%5D.ttf',
    'JetBrainsMono[wght].ttf': 'ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
    'NotoSans[wdth,wght].ttf': 'ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf',
    'NotoSansMath-Regular.ttf': 'ofl/notosansmath/NotoSansMath-Regular.ttf',
    'NotoSansSymbols2-Regular.ttf': 'ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf',
}
os.makedirs(SRC, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
for name, url in FONTS.items():
    if not os.path.exists(os.path.join(SRC, name)):
        print('downloading', name)
        urllib.request.urlretrieve('https://github.com/google/fonts/raw/main/' + url, os.path.join(SRC, name))

chars = set()
def walk(x):
    if isinstance(x, str):
        chars.update(x)
    elif isinstance(x, dict):
        for v in x.values():
            walk(v)
    elif isinstance(x, list):
        for v in x:
            walk(v)
for f in glob.glob(os.path.join(ROOT, 'godot', 'content', '**', '*.json'), recursive=True):
    walk(json.load(open(f, encoding='utf-8')))
# + everything the interface itself writes
chars |= {chr(c) for c in range(32, 127)} | set('·•–—‘’“”…×÷±√≤≥≠≈°→←↑↓↔αβγδεθλμπρσφωΔΩΣ₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₊₋½¼¾€₹✓✗◈★§')
chars = {c for c in chars if 32 <= ord(c) < 0x1F000}


def cut(src, dst, want):
    f = TTFont(os.path.join(SRC, src))
    cmap = f.getBestCmap()
    keep = sorted(ord(c) for c in want if ord(c) in cmap)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=keep)
    s.subset(f)
    f.save(os.path.join(OUT, dst))
    print(f'{dst}: {len(keep)} characters, {os.path.getsize(os.path.join(OUT, dst)) // 1024} KB')
    return {chr(u) for u in keep}


rest = chars - cut('Inter[opsz,wght].ttf', 'Inter.ttf', chars)
cut('JetBrainsMono[wght].ttf', 'JetBrainsMono.ttf', {chr(c) for c in range(32, 127)} | set('·•–—…×÷±→←✓✗°₂'))
rest -= cut('NotoSans[wdth,wght].ttf', 'NotoSans-fallback.ttf', rest)
rest -= cut('NotoSansMath-Regular.ttf', 'NotoSansMath-fallback.ttf', rest)
rest -= cut('NotoSansSymbols2-Regular.ttf', 'NotoSymbols2-fallback.ttf', rest)
print('characters no font has:', ' '.join(f'U+{ord(c):04X}' for c in sorted(rest)) or 'none')
