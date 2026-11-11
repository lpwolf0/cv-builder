import pdfplumber, sys
def lines(path,page=0):
    p=pdfplumber.open(path).pages[page]
    ws=p.extract_words(extra_attrs=['fontname','size'],keep_blank_chars=False)
    L={}
    for w in ws:
        k=(round(w['top']/2.5),round(w['x0']/60))
        L.setdefault((round(w['top']),w['fontname'][7:],round(w['size'])), []).append(w)
    out=[]
    for k,v in L.items():
        v.sort(key=lambda w:w['x0']); out.append((' '.join(w['text'] for w in v), v[0]['x0'], v[0]['top'], v[0]['x1'] if len(v)==1 else v[-1]['x1'], v[0]['fontname'][7:]))
    return out
REFOFF=7.8
ref=lines('ref/cv.pdf'); me=lines(sys.argv[1] if len(sys.argv)>1 else 'ref/out.pdf')
mm={}
for t,x,y,x1,f in me: mm.setdefault(t[:28],[]).append((x,y))
print(f"{'text':30} {'refX':>6} {'meX':>6} {'dX':>5} | {'refY':>6} {'meY':>6} {'dY':>6}")
for t,x,y,x1,f in sorted([(a,b,c+REFOFF,d,e) for a,b,c,d,e in ref],key=lambda r:(r[2],r[1])):
    c=mm.get(t[:28])
    if not c: print(f"{t[:30]:30} {x:6.1f} {'--':>6}"); continue
    best=min(c,key=lambda m:abs(m[1]-y)+abs(m[0]-x))
    print(f"{t[:30]:30} {x:6.1f} {best[0]:6.1f} {best[0]-x:5.1f} | {y:6.1f} {best[1]:6.1f} {best[1]-y:6.1f}")
