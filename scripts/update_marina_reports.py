# -*- coding: utf-8 -*-
"""Six-hour public marina-letter collection. Unknown dates/positions stay unknown.
Only explicit catch articles become reports. Guides stay in their own evidence class.
"""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import json,re,hashlib,concurrent.futures
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from update_catches import fetch
ROOT=Path(__file__).resolve().parents[1]

def parse_article(html,url,m,species):
 soup=BeautifulSoup(html,'html.parser')
 for x in soup(['header','footer','nav','script','style']):x.decompose()
 body=soup.select_one('.letterDetail') or soup.select_one('main') or soup
 text=body.get_text(' ',strip=True)
 if not re.search('釣果|釣れました|釣りました',text):return []
 # Publication date is never promoted into a catch date.
 date=re.search(r'釣行日[：:\s]*(20\d{2})[年/-](\d{1,2})[月/-](\d{1,2})',text)
 if not date:return []
 d='-'.join([date[1],date[2].zfill(2),date[3].zfill(2)])
 try:datetime.fromisoformat(d)
 except ValueError:return []
 rental=bool(re.search(r'(レンタル艇|シースタイル艇|クラブ艇)(で|を|の|に)',text[max(0,date.start()-200):date.end()+300]))
 result=[]
 remaining=text
 for f in sorted(species,key=lambda x:len(x['name']),reverse=True):
  if f['name'] not in remaining:continue
  remaining=remaining.replace(f['name'],' ')
  if d>datetime.now(timezone(timedelta(hours=9))).date().isoformat():continue
  result.append(dict(id='marina-'+hashlib.sha256((url+d+f['id']).encode()).hexdigest()[:18],marinaId=m['id'],date=d,fish=f['name'],source=url,source_name=m['name']+'・公式便り',evidence_kind='rental-report' if rental else 'nearby-report',area_id=None,amount='原文を確認',note='釣行日の明記あり。個別釣果GPSは未確認。'))
 return result

def collect(root=ROOT,fetcher=fetch):
 registry=json.loads((root/'data/marinas.json').read_text());seed=json.loads((root/'data/seed.json').read_text());extra=json.loads((root/'data/marina-evidence.json').read_text());species=seed['species']+extra['species'];stamp=datetime.now(timezone.utc).isoformat()
 def one(m):
  path=root/'data/marinas'/f"{m['id']}.json";pack=json.loads(path.read_text());statuses=[];reports={r['id']:r for r in pack.get('reports',[])}
  try:
   soup=BeautifulSoup(fetcher(m['source']),'html.parser')
   links=list(dict.fromkeys(urljoin(m['source'],a['href']) for a in soup.select('a[href]') if '/marina/letter/detail?' in a['href']))[:3]
   if not links:statuses.append(dict(source=m['source'],ok=True,checkedAt=stamp,note='公開釣行記事の掲載なし'))
   for url in links:
    try:
     rows=parse_article(fetcher(url),url,m,species)
     for r in rows:reports[r['id']]=r
     statuses.append(dict(source=url,ok=True,checkedAt=stamp,records=len(rows)))
    except Exception as e:statuses.append(dict(source=url,ok=False,checkedAt=stamp,error=type(e).__name__))
  except Exception as e:statuses.append(dict(source=m['source'],ok=False,checkedAt=stamp,error=type(e).__name__))
  pack.update(reports=sorted(reports.values(),key=lambda r:r['date'],reverse=True),checkedAt=stamp,source_status=statuses)
  if any(s.get('ok') for s in statuses):pack['last_success']=stamp
  path.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':'))+'\n')
  # Preserve guide evidence, refresh report evidence without duplicating source records.
  m['evidence']=[e for e in m.get('evidence',[]) if not e.get('collected_record_id')]+[dict(marinaId=m['id'],fish=r['fish'],kind='report' if r.get('evidence_kind')=='rental-report' else 'reference',date=r['date'],months=[int(r['date'][5:7])],method='unknown',collected_record_id=r['id'],source=r['source'],note='公式便りの釣行日付き記録。数量は原文を確認。') for r in reports.values()]
  return len(reports),sum(not s.get('ok') for s in statuses)
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:results=list(ex.map(one,[m for m in registry['marinas'] if m['status']!='excluded']))
 (root/'data/marinas.json').write_text(json.dumps(registry,ensure_ascii=False,separators=(',',':'))+'\n')
 print('Marina reports:',sum(x[0] for x in results),'dated records;',sum(x[1] for x in results),'source failures (last successes retained)')
if __name__=='__main__':collect()
