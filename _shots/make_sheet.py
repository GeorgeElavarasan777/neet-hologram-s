from PIL import Image, ImageDraw, ImageFont
import os
S = "E:/nrt/HoloStudy-LMS/_shots"
OUT = "E:/nrt/HoloStudy-LMS/_shots/contact-sheet.png"

tiles = [
    ("01-dashboard.png",     "Dashboard — subjects, progress, 79 ch / 124 holo"),
    ("03-chapter-drawer.png","Chapter drawer — Listen/Read/Summary/AI + exact holograms"),
    ("04-hologram.png",      "Exact 3D hologram (Nostoc, #b11-2-1) opened from chapter"),
    ("05-study.png",         "Study console — NCERT text, voice notes, Read pane"),
    ("06-holo-room.png",     "Hologram Room — all 124 figures, filterable"),
    ("08-mobile-dash.png",   "Mobile (390px) — responsive, bottom nav"),
]
COLW, PAD, LBL, BG = 640, 16, 34, (8,14,26)
def load(n):
    p=os.path.join(S,n)
    im=Image.open(p).convert("RGB")
    w=COLW; h=int(im.height*(w/im.width))
    return im.resize((w,h), Image.LANCZOS)

imgs=[(load(n),cap) for n,cap in tiles]
cols=2
rows=(len(imgs)+cols-1)//cols
# row heights = max tile height in that row + label
rowh=[]
for r in range(rows):
    hs=[imgs[r*cols+c][0].height for c in range(cols) if r*cols+c<len(imgs)]
    rowh.append(max(hs)+LBL)
W = cols*COLW + (cols+1)*PAD
H = sum(rowh) + (rows+1)*PAD + 54
sheet=Image.new("RGB",(W,H),BG)
d=ImageDraw.Draw(sheet)
try:
    ftitle=ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf",26)
    fcap=ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf",17)
except: ftitle=fcap=ImageFont.load_default()
d.text((PAD,14),"HoloStudy LMS — review contact sheet",fill=(180,240,255),font=ftitle)

y=54+PAD
for r in range(rows):
    x=PAD
    for c in range(cols):
        i=r*cols+c
        if i>=len(imgs): continue
        im,cap=imgs[i]
        d.rectangle([x-1,y-1,x+COLW,y+im.height+LBL], outline=(34,60,90))
        sheet.paste(im,(x,y))
        d.text((x+6,y+im.height+7),cap,fill=(200,214,232),font=fcap)
        x+=COLW+PAD
    y+=rowh[r]+PAD
sheet.save(OUT)
print("wrote",OUT, sheet.size)
