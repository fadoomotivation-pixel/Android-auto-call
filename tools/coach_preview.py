"""Renders the in-app coach (design/CoachCharacter.kt) to a PNG, same 100-unit grid."""
from PIL import Image, ImageDraw
import sys
S=8; W=100*S
def frame(blink=1.0, wave=None):
    im=Image.new("RGBA",(W,W),(0,0,0,0)); d=ImageDraw.Draw(im)
    p=lambda x,y:(x*S,y*S)
    d.ellipse([0,0,W,W],fill="#EAF1FB")
    import math
    def bez(p0,p1,p2,p3,n=20):
        return [tuple((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*e for a,b,c,e in zip(p0,p1,p2,p3)) for t in [i/n for i in range(n+1)]]
    body=bez((16,100),(16,82),(24,74),(38,71))+[(62,71)]+bez((62,71),(76,74),(84,82),(84,100))
    d.polygon([p(*q) for q in body],fill="#1F3A5F")
    d.polygon([p(41,71),p(59,71),p(50,88)],fill="#FFFFFF")
    d.polygon([p(41,71),p(50,88),p(38,80)],fill="#17304F"); d.polygon([p(59,71),p(50,88),p(62,80)],fill="#17304F")
    d.rounded_rectangle([p(44,58),p(56,73)],radius=4*S,fill="#B97F52")
    if wave is not None:
        a=math.radians(wave); px,py=74,84
        rot=lambda x,y:(px+(x-px)*math.cos(a)-(y-py)*math.sin(a), py+(x-px)*math.sin(a)+(y-py)*math.cos(a))
        hx,hy=rot(85,55); ex,ey=rot(84,60)
        d.line([p(px,py),p(ex,ey)],fill="#1F3A5F",width=9*S); d.ellipse([p(px-4.5,py-4.5),p(px+4.5,py+4.5)],fill="#1F3A5F")
        d.ellipse([p(hx-5,hy-5),p(hx+5,hy+5)],fill="#D39A6A")
    for cx in (34.5,65.5): d.ellipse([p(cx-3.4,41.6),p(cx+3.4,48.4)],fill="#D39A6A")
    d.ellipse([p(35,26),p(65,62)],fill="#D39A6A")
    d.pieslice([p(34,23),p(66,45)],180,360,fill="#2A1C14")
    d.ellipse([p(38,27),p(58,36)],fill="#2A1C14"); d.ellipse([p(34,31),p(39,42)],fill="#2A1C14"); d.ellipse([p(61,31),p(66,42)],fill="#2A1C14")
    d.line([p(40.5,40.5),p(46.5,39.6)],fill="#2A1C14",width=int(1.6*S)); d.line([p(53.5,39.6),p(59.5,40.5)],fill="#2A1C14",width=int(1.6*S))
    eh=max(3.6*blink,0.4)
    for x in (42.2,54.8): d.ellipse([p(x,45.5-eh/2),p(x+3,45.5+eh/2)],fill="#2A1C14")
    ov=Image.new("RGBA",(W,W),(0,0,0,0)); od=ImageDraw.Draw(ov)
    for cx in (40.5,59.5): od.ellipse([p(cx-2.8,48.7),p(cx+2.8,54.3)],fill=(224,122,106,51))
    im=Image.alpha_composite(im,ov); d=ImageDraw.Draw(im)
    d.arc([p(44.5,48.5),p(55.5,56.5)],20,160,fill="#8A4A33",width=int(1.7*S))
    m=Image.new("L",(W,W),0); ImageDraw.Draw(m).ellipse([0,0,W,W],fill=255); im.putalpha(Image.composite(im.getchannel("A"),m,m))
    return im.resize((300,300),Image.LANCZOS)
out=sys.argv[1] if len(sys.argv)>1 else "coach_character_preview.png"
sheet=Image.new("RGBA",(960,340),"white")
for i,f in enumerate([frame(),frame(blink=0.1),frame(wave=-18)]): sheet.paste(f,(15+i*315,20),f)
sheet.save(out); print(out)
