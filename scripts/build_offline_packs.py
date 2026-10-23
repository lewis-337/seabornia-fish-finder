"""List only public, packaged files. Shared assets are listed once."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def build(root=ROOT):
 registry=json.loads((root/'data/marinas.json').read_text())
 from cache_marina_maps import bbox
 meta=json.loads((root/'data/marina-map-sources.json').read_text())
 assets={'data/marinas.json','data/marina-evidence.json','data/coast-regions.json','data/area_depths.json','data/latest.json','data/conditions.json','data/tides.json','data/fish_areas.json','data/marina-map-sources.json'}
 for m in registry['marinas']:
  if m['status']=='excluded':continue
  if meta.get('images',{}).get(m['id'],{}).get('bounds')!=bbox(m['bounds']):raise ValueError('GEBCO footprint mismatch: '+m['id'])
  assets.add('data/marinas/'+m['id']+'.json');assets.add('data/marinas/'+m['id']+'-conditions.json');assets.add('images/maps/'+m['id']+'.jpg')
  if m.get('tideStation'):assets.add('data/tide-stations/'+m['tideStation']['id']+'.json')
 missing=[a for a in assets if not (root/a).is_file()]
 if missing:raise ValueError('Missing public offline assets: '+', '.join(missing))
 value=dict(schema_version=1,assets=sorted(assets),marinaCount=sum(m['status']!='excluded' for m in registry['marinas']))
 (root/'data/offline-packs.json').write_text(json.dumps(value,separators=(',',':'))+'\n')
 return value
if __name__=='__main__':print('Offline assets:',len(build()['assets']))
