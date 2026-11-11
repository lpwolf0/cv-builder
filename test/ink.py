import sys
from PIL import Image
s=4.0
def runs(path,x0,x1,y0,y1,thr=170,inv=False):
    im=Image.open(path).convert('L'); W,H=im.size; out=[];st=None
    for y in range(int(y0*s),min(int(y1*s),H)):
        row=[im.getpixel((x,y)) for x in range(int(x0*s),min(int(x1*s),W),2)]
        ink=any((v>255-thr+60) if inv else (v<thr) for v in row)
        if ink and st is None: st=y
        if not ink and st is not None:
            if y-st>=3: out.append((round(st/s,1),round(y/s,1)))
            st=None
    return out
mode=sys.argv[1]
if mode=='main':
    r=runs('hi-1.png',224,590,50,830); m=runs('hiout-1.png',224,590,50,830)
else:
    r=runs('hi-1.png',30,200,160,830,thr=200,inv=True); m=runs('hiout-1.png',30,200,160,830,thr=200,inv=True)
print('REF',len(r)); print(r); print('ME',len(m)); print(m)
