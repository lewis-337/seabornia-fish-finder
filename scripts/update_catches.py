#!/usr/bin/env python3
"""Update verified ship catch summaries for the Seabornia app.
- Only public landing pages configured below. Respects robots.txt.
- Does not collect Instagram/X or infer GPS from a departure port.
- Source URLs are retained; snippets are not re-published.
"""
import json, re, sys, time, hashlib, urllib.request, urllib.robotparser
from pathlib import Path
from datetime import datetime,timezone,timedelta
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'/'latest.json'
SEED=ROOT/'data'/'seed.json'
USER_AGENT='SeaborniaFishingResearch/1.0 (personal catch-monitor; respects robots.txt)'
SHIPS=[
 {'name':'光二丸','port':'三浦市 諸磯港 / 相模湾側','url':'https://www.mitsuzimaru.com/catch/','side':'west','format':'mitsuji'},
 {'name':'深田家','port':'佐島港 / 相模湾側','url':'https://www.chowari.jp/ship/00809/catch/','side':'west'},
 {'name':'孝漁丸','port':'長井港 / 相模湾側','url':'https://www.chowari.jp/ship/00872/catch/','side':'west'},
 {'name':'二宮丸','port':'宮川港 / 三浦半島東側','url':'https://www.chowari.jp/ship/00791/catch/','side':'east'},
 {'name':'金重丸','port':'金田漁港 / 東京湾側','url':'https://www.chowari.jp/ship/01219/catch/','side':'east'},
]
SPECIES=['マサバ','ゴマサバ','シイラ','ツムブリ','カツオ','サワラ','キハダマグロ','アオリイカ','コウイカ','モンゴウイカ','モンゴー','カミナリイカ','ヤリイカ','スミイカ','ケンサキイカ','マルイカ','イサキ','カワハギ','マダイ','アマダイ','シロアマダイ','カンパチ','ワラサ','イナダ','アジ','アカハタ','オオモンハタ','チカメキントキ','ホウボウ','クロムツ','カサゴ','サバ','オニカサゴ','イトヨリダイ','カイワリ','ハナダイ','タチウオ','メジナ','ウマズラハギ','ブリ','ヒラマサ','ソウダガツオ','マルアジ','オキアジ','アオハタ','ヒラメ','クロダイ','シイラ','マゴチ']
CATCH_DATE=re.compile(r'釣行日[：:]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日')
RANGES=re.compile(r'\d+(?:[.,]\d+)?\s*[〜～~-]\s*\d+(?:[.,]\d+)?\s*(?:匹|杯|cm|kg)')
ONE=re.compile(r'\d+(?:\.\d+)?\s*(?:cm|kg|匹|杯)')

def fetch_robots_allowed(url):
 from urllib.parse import urlparse
 u=urlparse(url); robots=f'{u.scheme}://{u.netloc}/robots.txt'
 rp=urllib.robotparser.RobotFileParser();rp.set_url(robots)
 try:rp.read()
 except Exception as exc:raise RuntimeError(f'robots.txt を確認できません: {str(exc)[:110]}')
 if not rp.can_fetch(USER_AGENT,url):raise RuntimeError('robots.txt により収集不可')
 return True

def fetch(url):
 fetch_robots_allowed(url)
 req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept-Language':'ja,en;q=0.6','Accept':'text/html'})
 with urllib.request.urlopen(req,timeout=20) as r:
  if r.status!=200:raise RuntimeError('HTTP '+str(r.status))
  typ=r.headers.get('Content-Type','')
  if 'html' not in typ and typ:raise RuntimeError('想定外のContent-Type '+typ)
  body=r.read(3_000_000)
  return body.decode(r.headers.get_content_charset() or 'utf-8','replace')

def parse_ship_html(content,ship):
 soup=BeautifulSoup(content,'html.parser')
 for tag in soup(['script','style','noscript','nav','footer']):tag.decompose()
 text='\n'.join(soup.stripped_strings)
 hits=list(CATCH_DATE.finditer(text));out=[]
 today=datetime.now(timezone(timedelta(hours=9))).date()
 for n,m in enumerate(hits[:35]):
  try: trip_date=datetime(*map(int,m.groups())).date()
  except ValueError:continue
  if trip_date>today:continue
  stop=hits[n+1].start() if n+1<len(hits) else min(len(text),m.end()+4000)
  block=text[m.end():stop].split('釣行当日の潮汐')[0][:1800]
  lines=[line.strip() for line in block.splitlines() if line.strip()]
  fish_rows=[]
  for i,line in enumerate(lines):
   fish=next((name for name in sorted(set(SPECIES),key=len,reverse=True) if line==name or line.startswith(name+'(') or line.startswith(name+'（')),None)
   if fish:fish_rows.append((i,fish))
  for j,(i,fish) in enumerate(fish_rows):
   end=fish_rows[j+1][0] if j+1<len(fish_rows) else min(len(lines),i+8)
   section=' '.join(lines[i:end])
   measures=[match.group().replace(' ','') for match in re.finditer(r'\d+(?:[.,]\d+)?(?:\s*[〜～~-]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|kg|匹|杯)',section)]
   size=next((v for v in measures if v.endswith(('cm','kg'))),'')
   amount=next((v for v in measures if v.endswith(('匹','杯'))),'')
   dt=trip_date.isoformat()
   key=hashlib.sha1(f'{ship["url"]}|{dt}|{fish}'.encode()).hexdigest()[:14]
   out.append({'id':f'auto_{key}','date':dt,'date_label':dt.replace('-','/'),'fish':fish,'size':size,'amount':amount,'depth':'非公開','method':'ティップラン' if 'ティップラン' in block else '釣法詳細は出典で確認','detail':'船宿の公開釣果ページから抽出。出船港と実際の釣り場は異なり、GPS地点は未公開です。詳細は出典で確認してください。','source':ship['url'],'source_name':f'{ship["name"]}（{ship["port"]}）','area_id':None,'location_note':'非公開。出船港と釣り場は異なります。','kind':'current','auto':True})
 return out


def parse_mitsuji(content,ship):
 # Entries are grouped by date headings and generally identify species, but not GPS.
 import unicodedata
 page=BeautifulSoup(content,'html.parser')
 for s in page(['script','style','noscript','nav','footer']):s.decompose()
 raw=unicodedata.normalize('NFKC',page.get_text('\n',strip=True))
 # On site headings: 10月18日(日)の釣果 (date inferred from local Tokyo year)
 hit=list(re.finditer(r'(\d{1,2})月(\d{1,2})日.{0,10}の釣果',raw));out=[];seen=set()
 from datetime import timedelta
 now=datetime.now(timezone(timedelta(hours=9)))
 for i,m in enumerate(hit[:25]):
  month,day=int(m.group(1)),int(m.group(2));year=now.year
  if month>now.month+2:year-=1
  try:dt=datetime(year,month,day).date().isoformat()
  except ValueError:continue
  if dt>now.strftime('%Y-%m-%d'):continue
  stop=hit[i+1].start() if i+1<len(hit) else min(len(raw),m.end()+2500)
  block=raw[m.end():min(stop,m.end()+1800)]
  for line in [x.strip() for x in block.splitlines()[:38]]:
   matches=list(re.finditer('|'.join(map(re.escape,sorted(set(SPECIES),key=len,reverse=True))),line))
   for number,match in enumerate(matches):
    fish=match.group()
    if len(line)>165:continue
    section=line[match.end():matches[number+1].start() if number+1<len(matches) else len(line)]
    measures=[m.group().replace(' ','') for m in re.finditer(r'\d+(?:[.,]\d+)?(?:\s*[〜～~-]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|kg|匹|杯)',section)]
    size=next((v for v in measures if v.endswith(('cm','kg'))),'')
    amount=next((v for v in measures if v.endswith(('匹','杯'))),'')
    key=(dt,fish)
    if key in seen:continue
    seen.add(key)
    out.append({'id':'auto_mitsu_'+hashlib.sha1((dt+fish).encode()).hexdigest()[:14],
       'date':dt,'date_label':dt,'fish':fish,'size':size,
       'amount':amount,
       'depth':'非公開','method':'原文参照','detail':'諸磯港発の公開釣果。実際に釣れたGPS地点は非公開です。原文の釣果と照合してください。',
       'source':ship['url'],'source_name':'光二丸（諸磯港）公式','area_id':None,'location_note':'航行場所は非公開', 'kind':'current','auto':True})
 return out

def main():
 seed=json.loads(SEED.read_text())
 current=json.loads(DATA.read_text()) if DATA.exists() else seed
 now=datetime.now(timezone.utc).isoformat(timespec='seconds')
 statuses=[];updates=[];good=0
 for ship in SHIPS:
  try:
   page=fetch(ship['url'])
   hits=parse_mitsuji(page,ship) if ship.get('format')=='mitsuji' else parse_ship_html(page,ship)
   if not hits:raise RuntimeError('日付・魚種を含む釣果が抽出できませんでした')
   updates.extend(hits);statuses.append({'name':ship['name'],'result':'ok','count':len(hits)});good+=1
  except Exception as exc:
   statuses.append({'name':ship['name'],'result':'error','reason':str(exc)[:180]})
  time.sleep(2)
 # Preserve curated history; stable keys prevent repeat fetches inflating the list.
 base={r['id']:r for r in seed['reports']}
 for r in current.get('reports',[]):base.setdefault(r['id'],r)
 for r in updates:base[r['id']]=r
 curated={(r.get('source'),r.get('date'),r.get('fish')) for r in base.values() if not r.get('auto')}
 unique={}
 for r in base.values():
  key=(r.get('source'),r.get('date'),r.get('fish'))
  if r.get('auto') and key in curated:continue
  if r.get('auto'):unique[key]=r
  else:unique[r['id']]=r
 base={r['id']:r for r in unique.values()}
 manual=ROOT/'data'/'manual.json'
 if manual.exists():
  try:
   for r in json.loads(manual.read_text()):
    if isinstance(r,dict) and r.get('id') and r.get('date') and r.get('source'):base[r['id']]=r
  except (ValueError,TypeError) as exc:statuses.append({'name':'manual.json','result':'error','reason':str(exc)})
 out=dict(seed)
 out['reports']=sorted(base.values(),key=lambda r:r.get('date') or '',reverse=True)
 out['last_collected']=now
 out['last_success']=now if good else current.get('last_success')
 out['source_status']=statuses
 DATA.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'at':now,'source_successes':good,'total_records':len(out['reports']),'status':statuses},ensure_ascii=False,indent=2))
 # No success is an error; workflow can fail rather than misleadingly showing "updated".
 if good==0:sys.exit(2)
if __name__=='__main__':main()
