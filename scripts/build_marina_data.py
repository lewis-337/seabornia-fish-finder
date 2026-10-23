"""Audited public Sea-Style directory + source-backed regional guides.
Never infers catch coordinates from a marina. Run deliberately when auditing fleets.
"""
from pathlib import Path
from datetime import datetime, timezone
import json, re, urllib.request, concurrent.futures
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
BASE='https://sea-style-m.yamaha-motor.co.jp/jp/marina/detail/marinacd/'
STAMP=datetime.now(timezone.utc).isoformat()
IDS='J08-0040 J08-0020 J08-0030 J12-0010 J12-0040 J12-0070 J12-0030 J12-0045 J12-0060 J13-0010 J13-0020 J13-0030 J14-0010 J14-0020 J14-0040 J14-0130 J14-0160 J14-0140 J14-0170 J14-0180 J14-0200 J14-0100 J14-0110 J14-0120 J14-0080 J14-0050 J14-0045 J14-0060 J14-0190 J14-0150 J47-0010 J47-0020 J47-0030 J47-0050'.split()
EXCLUDED={**dict.fromkeys(['J08-0020','J12-0040'],'公式にシースタイル休止中'),**dict.fromkeys(['J08-0030','J12-0010','J14-0150'],'内水面のため今回の海釣り対象外'),**dict.fromkeys(['J12-0070','J12-0030','J14-0160','J47-0050'],'確認時のクラブ艇はJetのみ')}
# Explicit rental-fishing sources, not generic map legends or neighbouring charter boats.
PROOF={
'J08-0040':('https://oarai-marina.com/fishing/789','公式のSea-Styleレンタル利用者の釣果案内'),
'J12-0045':(BASE+'J12-0045','FAST23・YFR24の釣り利用、エサ釣り可の記載'),
'J12-0060':('https://sea-style.yamaha-motor.co.jp/plan/kanto/0014/','木更津沖のレンタルボート釣りプラン'),
'J13-0010':('https://sea-style-m.yamaha-motor.co.jp/jp/marina/rule/index/marinacd/J13-0010','フィッシング艇のレンタル案内。一部S-QUALOはエサ・コマセ禁止'),
'J14-0020':('https://sea-style.yamaha-motor.co.jp/plan/kanto/0297/','レンタルボートのアジ・カサゴ・キス・イシモチ案内'),
'J14-0040':('https://www.ybmarina.com/rental/seastyle/','Sea-Styleのアジ・シロギス・イシモチ釣り案内。一部艇はルアーのみ'),
'J14-0130':('https://sea-style.yamaha-motor.co.jp/plan/kanto/0280/','浦賀発のレンタル釣りプラン'),
'J14-0140':('https://sea-style.yamaha-motor.co.jp/plan/kanto/0349/','アマダイ等のレンタル釣りプラン'),
'J14-0170':(BASE+'J14-0170','既存のSea-Style釣り案内と公開海域'),
'J14-0200':('https://sea-style-m.yamaha-motor.co.jp/jp/marina/rule/index/marinacd/J14-0200','レンタル艇のエサ・コマセ・イカ墨の洗船規則に釣り利用を記載'),
'J14-0100':('https://sea-style.yamaha-motor.co.jp/knowledge/','クラブ艇でのアマダイ釣行紹介'),
'J14-0110':('https://www.hayama-port.jp/rentalboat/','レンタル艇の釣り支援案内'),
'J14-0080':('https://sea-style.yamaha-motor.co.jp/plan/kanto/','江の島会場の釣りプラン掲載'),
'J14-0050':('https://sea-style.yamaha-motor.co.jp/plan/kanto/','釣り向けi-Pilot講習掲載'),
'J14-0045':('https://kogurems.com/service/rental/','Sea-Styleレンタルでの釣り案内'),
'J14-0060':(BASE+'J14-0060','公式に釣りがメインと明記'),
'J14-0190':('https://manazuru.co.jp/rental.html','Sea-Styleレンタル艇の釣り案内'),
'J47-0010':('https://sea-style.yamaha-motor.co.jp/plan/kyusyu_okinawa/0094/','会員操船のグルクン釣りプラン'),
'J47-0020':(BASE+'J47-0020','公式ページに釣り利用と中城湾の航行範囲を記載')}

def write(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')

def audit(code):
 req=urllib.request.Request(BASE+code,headers={'User-Agent':'Seabornia-personal-public-directory-audit/8'})
 soup=BeautifulSoup(urllib.request.urlopen(req,timeout=35).read(),'html.parser')
 name=soup.find('h1').get_text(' ',strip=True)
 lat=float(soup.select_one('#lat_deg')['value']);lng=float(soup.select_one('#long_deg')['value'])
 boats=[]
 for b in soup.select('.boatCard-body'):
  title=b.select_one('.boatCard-ttl');note=b.select_one('.boatCard-txt')
  if not title:continue
  n=note.get_text(' ',strip=True) if note else ''
  boats.append(dict(name=title.get_text(' ',strip=True),bait='prohibited' if re.search(r'(?:エサ|餌|コマセ).{0,12}禁止',n) else 'allowed' if 'エサ釣り可' in n else 'unknown',lure='allowed' if 'ルアー釣り可' in n else 'unknown',restrictions=[v for pattern,v in [(r'(?:エサ|餌|コマセ).{0,12}禁止','エサ・コマセ釣り禁止'),('イケス使用不可','イケス使用不可'),('ロッドホルダーなし','ロッドホルダーなし'),('エサ釣り可','エサ釣り可')] if re.search(pattern,n)],source=BASE+code))
 text=soup.get_text(' ',strip=True)
 region='okinawa' if code.startswith('J47') else 'kanto'
 basin='okinawa-west' if code=='J47-0010' else 'okinawa-east' if region=='okinawa' and code!='J47-0050' else 'ishigaki' if code=='J47-0050' else 'pacific' if code.startswith('J08') or code=='J12-0040' else 'sagami' if code in 'J14-0140 J14-0170 J14-0180 J14-0200 J14-0100 J14-0110 J14-0120 J14-0080 J14-0050 J14-0045 J14-0060 J14-0190'.split() else 'tokyo-bay'
 status='excluded' if code in EXCLUDED else 'verified' if code in PROOF and boats else 'unconfirmed'
 reason=EXCLUDED.get(code) or (PROOF.get(code) or ('','海釣り利用・現在の艇または航行条件を要確認'))[1]
 if not boats and code not in EXCLUDED:status='unconfirmed';reason='現在のクラブ艇掲載なし。利用再開・釣り可否を要確認'
 m=dict(id=code,name=name,shortName=name.replace('リビエラ','').replace('「',' ').replace('」','').replace('マリーナ','').strip(),region=region,basin=basin,lat=lat,lng=lng,status=status,reason=reason,boats=boats,source=BASE+code,checkedAt=STAMP,proof=PROOF[code][0] if code in PROOF else BASE+code,lecture='ご利用前講習が必要' in text,groundIds=[])
 # Bounds are display extents, never permission polygons.
 if code=='J14-0170': m['bounds']=[139.51,35.07,139.72,35.29]
 else:m['bounds']=[round(lng-.13,5),round(lat-.11,5),round(lng+.13,5),round(lat+.11,5)]
 return m

def main():
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:marinas=list(ex.map(audit,IDS))
 evidence=json.loads((ROOT/'data/marina-evidence.json').read_text())
 oldregistry=json.loads((ROOT/'data/marinas.json').read_text()) if (ROOT/'data/marinas.json').exists() else {'marinas':[]}
 oldbyid={m['id']:m for m in oldregistry['marinas']}
 from collect_marina_conditions import station_for
 for m in marinas:
  m['evidence']=[e for e in evidence['guides'] if e['marinaId']==m['id']]+[e for e in oldbyid.get(m['id'],{}).get('evidence',[]) if e['kind']!='guide']
  m['tideStation']=station_for(m) if m['status']!='excluded' else None
  m['rules']=oldbyid.get(m['id'],{}).get('rules',[])
  m['groundIds']=[a['id'] for a in evidence['grounds'] if m['id'] in a['marinaIds']]
  grounds=[a for a in evidence['grounds'] if a['id'] in m['groundIds']]
  if m['id']=='J14-0170':grounds=json.loads((ROOT/'data/seed.json').read_text())['areas'];m['groundIds']=[a['id'] for a in grounds]
  if grounds:
   if m['id']!='J14-0170':
    pts=grounds+[m];m['bounds']=[min(p['lng'] for p in pts)-.07,min(p['lat'] for p in pts)-.06,max(p['lng'] for p in pts)+.07,max(p['lat'] for p in pts)+.06]
  oldpath=ROOT/'data/marinas'/f"{m['id']}.json"
  old=json.loads(oldpath.read_text()) if oldpath.exists() else {}
  write(oldpath,dict(schema_version=1,marinaId=m['id'],areas=grounds,reports=old.get('reports',[]),checkedAt=STAMP,last_success=old.get('last_success'),source_status=old.get('source_status',[])))
 write(ROOT/'data/marinas.json',dict(schema_version=1,checkedAt=STAMP,source='https://sea-style-m.yamaha-motor.co.jp/jp/marina/info/index',marinas=marinas))
 print('Audited',len(marinas),'bases:',{s:sum(m['status']==s for m in marinas) for s in ['verified','unconfirmed','excluded']})
if __name__=='__main__':main()
