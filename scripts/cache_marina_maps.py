# -*- coding: utf-8 -*-
"""Cache public GEBCO2026 backgrounds and model cells. No navigation soundings."""
from pathlib import Path
from datetime import datetime,timezone
import json,math,urllib.request,urllib.parse,concurrent.futures
from collect_depths import query,parse,SOURCE
ROOT=Path(__file__).resolve().parents[1]
def bbox(b):
 merc=lambda x:math.log(math.tan(math.pi/4+x*math.pi/360))
 x=(b[0]+b[2])/2;y=(merc(b[1])+merc(b[3]))/2
 dy=max(merc(b[3])-merc(b[1]),(b[2]-b[0])*math.pi/180*950/1050);dx=dy*1050/950*180/math.pi
 lat=lambda v:(2*math.atan(math.exp(v))-math.pi/2)*180/math.pi
 return [x-dx/2,lat(y-dy/2),x+dx/2,lat(y+dy/2)]
def cache():
 registry=json.loads((ROOT/'data/marinas.json').read_text());failures=[]
 oldmeta=json.loads((ROOT/'data/marina-map-sources.json').read_text()) if (ROOT/'data/marina-map-sources.json').exists() else {}
 images=oldmeta.get('images',{})
 def image(m):
  path=ROOT/'images/maps'/f"{m['id']}.jpg"
  b=bbox(m['bounds'])
  if path.exists() and images.get(m['id'],{}).get('bounds')==b:return
  merc=lambda v:6378137*math.log(math.tan(math.pi/4+v*math.pi/360))
  coords=[b[0]*math.pi/180*6378137,merc(b[1]),b[2]*math.pi/180*6378137,merc(b[3])]
  url='https://wms.gebco.net/2026/mapserv?'+urllib.parse.urlencode(dict(SERVICE='WMS',REQUEST='GetMap',VERSION='1.3.0',LAYERS='GEBCO_2026_2',STYLES='',FORMAT='image/jpeg',CRS='EPSG:3857',BBOX=','.join(map(str,coords)),WIDTH=1050,HEIGHT=950))
  try:
   data=urllib.request.urlopen(url,timeout=45).read()
   from PIL import Image
   import io
   im=Image.open(io.BytesIO(data));im.verify()
   if im.size!=(1050,950):raise ValueError('image dimensions')
   path.write_bytes(data)
   images[m['id']]=dict(bounds=b,projection='EPSG:3857',release='GEBCO2026',width=1050,height=950)
  except Exception as e:failures.append(dict(marinaId=m['id'],error=type(e).__name__))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(image,[m for m in registry['marinas'] if m['status']!='excluded']))
 depths=json.loads((ROOT/'data/area_depths.json').read_text())
 grounds=json.loads((ROOT/'data/marina-evidence.json').read_text())['grounds']
 def depth(a):
  try:return a['id'],dict(parse(urllib.request.urlopen(query(a),timeout=40).read().decode(),a),fetched_at=datetime.now(timezone.utc).isoformat(),source=SOURCE,release='GEBCO2026')
  except Exception as e:failures.append(dict(areaId=a['id'],error=type(e).__name__));return a['id'],None
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
  for id,row in ex.map(depth,grounds):
   if row:depths['areas'][id]=row
 (ROOT/'data/area_depths.json').write_text(json.dumps(depths,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'data/marina-map-sources.json').write_text(json.dumps(dict(schema_version=1,source=SOURCE,release='GEBCO2026',licence='Public domain',checkedAt=datetime.now(timezone.utc).isoformat(),failures=failures,images=images),ensure_ascii=False,indent=2)+'\n')
 print('GEBCO cached:',len(list((ROOT/'images/maps').glob('*.jpg'))),'images;',len(grounds),'new reference cells;',len(failures),'failures')
if __name__=='__main__':cache()
