from PIL import Image, ImageDraw, ImageFilter
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)

def lerp(a, b, t): return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))
CYAN=(34,211,238); VIOLET=(167,139,250); GREEN=(52,211,153)

def grad_color(t):
    # 0..1 across cyan->violet->green
    if t < 0.5: return lerp(CYAN, VIOLET, t/0.5)
    return lerp(VIOLET, GREEN, (t-0.5)/0.5)

def make(size, maskable=False):
    S = size * 4  # supersample
    img = Image.new("RGBA", (S, S), (0,0,0,0))
    d = ImageDraw.Draw(img)
    # rounded background
    pad = int(S*0.10) if maskable else 0
    inner = S - 2*pad
    rad = int(inner*0.22)
    # bg rounded rect
    bg = Image.new("RGBA", (S,S), (0,0,0,0))
    bd = ImageDraw.Draw(bg)
    # vertical gradient background
    for y in range(inner):
        t=y/inner
        c=lerp((10,20,40),(5,10,20),t)
        bd.line([(pad,pad+y),(pad+inner,pad+y)], fill=c+(255,))
    # mask corners
    mask = Image.new("L",(S,S),0)
    ImageDraw.Draw(mask).rounded_rectangle([pad,pad,pad+inner,pad+inner], rad, fill=255)
    img.paste(bg,(0,0),mask)
    d = ImageDraw.Draw(img)

    cx = S//2
    # glow
    glow = Image.new("RGBA",(S,S),(0,0,0,0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx-inner*0.34, pad+inner*0.30, cx+inner*0.34, pad+inner*0.86], fill=CYAN+(90,))
    glow = glow.filter(ImageFilter.GaussianBlur(S*0.05))
    img.alpha_composite(glow)

    # projector base ellipses
    d.ellipse([cx-inner*0.30, pad+inner*0.72, cx+inner*0.30, pad+inner*0.84], outline=CYAN+(220,), width=max(3,S//90))
    d.ellipse([cx-inner*0.17, pad+inner*0.755, cx+inner*0.17, pad+inner*0.815], outline=VIOLET+(130,), width=max(2,S//150))

    # holographic H (three strokes, gradient by x). Draw glow layer then crisp layer.
    top=pad+inner*0.30; bot=pad+inner*0.70; mid=(top+bot)/2
    lx=cx-inner*0.16; rx=cx+inner*0.16
    w=int(inner*0.075)
    def draw_H(draw, width, alpha):
        # vertical bars
        for (x) in (lx, rx):
            t=(x-lx)/(rx-lx) if rx!=lx else 0
            col=grad_color(0.15 if x==lx else 0.85)+(alpha,)
            draw.line([(x,top),(x,bot)], fill=col, width=width)
            draw.ellipse([x-width//2,top-width//2,x+width//2,top+width//2], fill=col)
            draw.ellipse([x-width//2,bot-width//2,x+width//2,bot+width//2], fill=col)
        # crossbar
        draw.line([(lx,mid),(rx,mid)], fill=grad_color(0.5)+(alpha,), width=width)
    hg = Image.new("RGBA",(S,S),(0,0,0,0))
    draw_H(ImageDraw.Draw(hg), int(w*1.25), 160)
    hg=hg.filter(ImageFilter.GaussianBlur(S*0.012))
    img.alpha_composite(hg)
    draw_H(d, w, 255)

    # scan lines across H
    sl = Image.new("RGBA",(S,S),(0,0,0,0))
    sd=ImageDraw.Draw(sl)
    y=top
    while y<bot:
        sd.line([(lx-w,y),(rx+w,y)], fill=(191,251,255,60), width=max(2,S//200))
        y+=inner*0.05
    # clip scanlines to H area only-ish (keep subtle)
    img.alpha_composite(sl)

    out = img.resize((size,size), Image.LANCZOS)
    return out

targets = [
    ("icon-192.png",192,False),
    ("icon-512.png",512,False),
    ("icon-maskable-192.png",192,True),
    ("icon-maskable-512.png",512,True),
    ("icon-180.png",180,False),   # apple touch
]
for name,sz,mask in targets:
    make(sz,mask).save(os.path.join(OUT,name))
    print("wrote", name, sz, "maskable" if mask else "")
# apple-touch-icon default name too
make(180,False).save(os.path.join(OUT,"apple-touch-icon.png"))
print("done")
