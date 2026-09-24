import re, json, os
from collections import defaultdict
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, "_figures_parsed.json"), encoding="utf-8"))
review = open(os.path.join(HERE, "review.md"), encoding="utf-8").read()

chapters = defaultdict(list)
for ln in review.splitlines():
    if not ln.startswith("|"): continue
    cells = [c.strip() for c in ln.strip().strip("|").split("|")]
    if len(cells) < 7: continue
    book = cells[0]
    if not re.match(r"(physics|chemistry|biology)(11|12)$", book): continue
    try: no=int(cells[1]); words=int(cells[3]); secs=int(cells[5]); pages=int(cells[6])
    except: continue
    chapters[book].append({"no":no,"title":cells[2],"words":words,"sections":secs,"pages":pages})

def norm(s):
    s = s.lower().replace("&","and"); s = re.sub(r'[^a-z0-9 ]',' ',s); return re.sub(r'\s+',' ',s).strip()

def best_chapter(book, ftitle):
    fn=norm(ftitle); best=None; br=-1
    for c in chapters[book]:
        r=SequenceMatcher(None, fn, norm(c["title"])).ratio()
        if fn in norm(c["title"]) or norm(c["title"]) in fn: r=max(r,0.9)
        if r>br: br=r; best=c
    return best, br

fig_by_cat=defaultdict(list); cat_title={}
for r in rows:
    k=(r["subject"],r["cls"],r["chap_no"]); fig_by_cat[k].append(r); cat_title[k]=r["chap_title"]

assign={}; report=[]; low=[]
for (subj,cls,cno),figs in fig_by_cat.items():
    book=f"{subj}{cls}"; ft=cat_title[(subj,cls,cno)]
    ch,r=best_chapter(book,ft)
    report.append((book,cno,ft,ch["no"],ch["title"],r,len(figs)))
    if r<0.7: low.append((book,ft,ch["title"],round(r,2)))
    assign.setdefault((subj,cls,ch["no"]),[]).extend(figs)

placed=sum(len(v) for v in assign.values())
print(f"figures placed by title: {placed} / {len(rows)}")
print("low-confidence matches (<0.70):", low if low else "NONE")
print("\n=== corrected placements (catalogue# -> NCERT#) ===")
for book,cno,ft,nn,nt,r,nf in sorted(report):
    tag="" if cno==nn else f"   [renumbered {cno}->{nn}]"
    print(f"  {book} '{ft[:36]:36}' -> Ch{nn:2} '{nt[:30]:30}' ({nf} fig, r={r:.2f}){tag}")

SUBJECTS=[("physics","Physics","\u26a1","#22d3ee"),("chemistry","Chemistry","\U0001f9ea","#a78bfa"),("biology","Biology","\U0001f9ec","#34d399")]
curr={"subjects":[],"meta":{}}
tot_ch=tot_h=tot_f=0
for skey,sname,emoji,color in SUBJECTS:
    so={"key":skey,"name":sname,"emoji":emoji,"color":color,"classes":[]}
    for cls in ["11","12"]:
        book=f"{skey}{cls}"; chs=[]
        for ch in sorted(chapters[book],key=lambda x:x["no"]):
            figs=assign.get((skey,cls,ch["no"]),[])
            figs=[{"hash":f["hash"],"fig":f["fig_label"],"title":f["figure"],"subviews":f["subviews"],"labels":f["labels"]} for f in figs]
            chs.append({"no":ch["no"],"title":ch["title"],"words":ch["words"],"sections":ch["sections"],"pages":ch["pages"],"holograms":figs})
            tot_ch+=1; tot_f+=len(figs); tot_h+= 1 if figs else 0
        so["classes"].append({"cls":cls,"pack":book,"label":f"Class {cls}","chapters":chs,
            "chapterCount":len(chs),"hologramCount":sum(len(c["holograms"]) for c in chs)})
    curr["subjects"].append(so)
curr["meta"]={"totalChapters":tot_ch,"chaptersWithHolograms":tot_h,"totalFigures":tot_f,
    "subViews":276,"labels":1624,"voiceNotes":"~13,000","words":"~600k"}

assert tot_f==124, f"expected 124 figures, got {tot_f}"
print("\nmeta:", json.dumps(curr["meta"]))
open(os.path.join(HERE,"curriculum.js"),"w",encoding="utf-8").write(
    "// Auto-generated curriculum map \u2014 NCERT study packs + 124 holograms, matched by title.\nwindow.CURRICULUM = "+json.dumps(curr,ensure_ascii=False)+";\n")
print("wrote corrected data/curriculum.js \u2014 all 124 figures placed")
