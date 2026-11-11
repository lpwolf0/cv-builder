#!/bin/bash
# usage: test/cmp.sh  -> regenerates ref/out.pdf from sample, rasterises, builds ref/cmp1.png side by side
cd /home/claude/cvbuilder
node test/gen-sample.mjs public/data/sample-cv.json ref/out >/dev/null 2>&1 || node test/gen-sample.mjs public/data/sample-cv.json ref/out
cd ref; rm -f out-*.png; pdftoppm -r 100 -png out.pdf out; pdftoppm -r 100 -png -f 1 -l 1 cv.pdf refs
python3 - <<'P'
from PIL import Image, ImageChops
import glob
a=Image.open('refs-1.png').convert('RGB'); b=Image.open('out-1.png').convert('RGB').resize(a.size)
print('pages:',len(glob.glob('out-*.png')))
w=Image.new('RGB',(a.width*2+10,a.height),'#888'); w.paste(a,(0,0)); w.paste(b,(a.width+10,0)); w.save('cmp1.png')
d=ImageChops.difference(a,b).convert('L').point(lambda v:255 if v>60 else 0); print('differing px %:',round(sum(d.histogram()[255:])/ (a.width*a.height)*100,2))
# overlay: reference in red channel, mine in cyan
o=Image.merge('RGB',(a.convert('L'),b.convert('L'),b.convert('L'))); o.save('overlay.png')
P
