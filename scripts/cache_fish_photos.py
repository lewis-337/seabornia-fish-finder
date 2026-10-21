#!/usr/bin/env python3
"""Cache freely reusable species images from Commons and reviewed source overrides.

This script does not assert that every species will have an available image: successful
Pillow decode + Commons license metadata is required before marking verified.
File and metadata are cached, and failed items are logged without creating fake photos.
Reviewed iNaturalist references in photo_overrides.json retain taxon/photo identity and attribution.
"""
import json, time, os, re, io, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, quote, unquote, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from PIL import Image, ImageOps
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
SPECIES=json.loads((ROOT/'data'/'seed.json').read_text(encoding='utf-8'))['species']
OUT=ROOT/'images'/'fish'; OUT.mkdir(parents=True,exist_ok=True)
MANIFEST=ROOT/'data'/'photo_manifest.json'
HEAD={'User-Agent':'SeaborniaFishFinder/4.0 (Wikimedia attribution + identification; personal demo)','Accept':'application/json,image/jpeg,image/png,image/webp,*/*'}

def get(url,params=None,limit=7_000_000):
 if urlparse(url).hostname in ['upload.wikimedia.org','thumb.wikimedia.org']:
  url=url.split('?',1)[0]
 if params:url += ('&' if '?' in url else '?')+urlencode(params)
 req=Request(url,headers=HEAD)
 with urlopen(req,timeout=18) as r:
  data=r.read(limit+1)
  if len(data)>limit:raise RuntimeError('image too big')
  return data,r.headers.get('content-type','')

def wiki_file(lang,title):
 try:
  obj=json.loads(get(f'https://{lang}.wikipedia.org/w/api.php',{'action':'query','format':'json','redirects':'1','prop':'pageimages','titles':title,'pithumbsize':'580'})[0]);page=next(iter(obj.get('query',{}).get('pages',{}).values()),{})
  filename=page.get('pageimage') or ''
  return filename if filename.lower().endswith(('.jpg','.jpeg','.png','.webp')) else ''
 except HTTPError as exc:
  if exc.code != 429: raise
  # Public article HTML is a separate documented representation; do not retry a rate-limited API.
  page=BeautifulSoup(get(f'https://{lang}.wikipedia.org/wiki/'+quote(title.replace(' ','_')))[0],'html.parser')
  for link in page.select('.infobox a.mw-file-description'):
   name=unquote(urlparse(link.get('href','')).path).split(':',1)[-1]
   if name.lower().endswith(('.jpg','.jpeg','.png','.webp')):return name
  return ''

def commons_html_info(filename):
 url='https://commons.wikimedia.org/wiki/File:'+quote(filename.replace(' ','_'))
 page=BeautifulSoup(get(url)[0],'html.parser')
 license_name=next((n.get_text(strip=True) for n in page.select('.licensetpl_short') if re.match(r'^(CC0\b|CC BY(?:-SA)?\b|Public domain\b|PD\b)',n.get_text(strip=True),re.I)),None)
 image=page.select_one('#file img')
 if not license_name or not image:return None
 previews=[a.get('href','') for a in page.select('#file a') if '/thumb/' in a.get('href','') and urlparse(a.get('href','')).hostname in ['upload.wikimedia.org','thumb.wikimedia.org']]
 src=previews[0] if previews else image.get('src','')
 if src.startswith('//'):src='https:'+src
 if urlparse(src).hostname not in ['upload.wikimedia.org','thumb.wikimedia.org']:return None
 artist=page.select_one('#fileinfotpl_aut')
 cells=artist.parent.find_all('td',recursive=False) if artist else []
 return {'url':src,'page_url':url,'license':license_name,'artist_html':cells[-1].get_text(' ',strip=True) if cells else 'See source file','credit_html':'','filename':filename}

def commons_info(filename):
 if not filename:return None
 try:
  obj=json.loads(get('https://commons.wikimedia.org/w/api.php',{'action':'query','format':'json','prop':'imageinfo','titles':'File:'+filename,'iiprop':'url|extmetadata','iiurlwidth':'580'})[0]);page=next(iter(obj.get('query',{}).get('pages',{}).values()),{}); info=(page.get('imageinfo') or [None])[0]
 except HTTPError as exc:
  if exc.code != 429:raise
  return commons_html_info(filename)
 if not info:return None
 ext=info.get('extmetadata',{})
 lic=(ext.get('LicenseShortName') or {}).get('value','')
 # Exclude files that cannot be confidently redistributed; include BY and SA with credits in UI.
 ok=bool(re.match(r'^(CC0\b|CC BY(?:-SA)?\b|Public domain\b|PD\b)',lic,re.I))
 if not ok:return None
 return {'url':info.get('thumburl') or info.get('url'),'page_url':info.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/File:'+quote(filename),
         'license':lic,'artist_html':(ext.get('Artist') or {}).get('value','')[:500],
         'credit_html':(ext.get('Credit') or {}).get('value','')[:500], 'filename':filename}

def search_commons(query):
 obj=json.loads(get('https://commons.wikimedia.org/w/api.php',{'action':'query','generator':'search','gsrsearch':query,'gsrnamespace':'6','gsrlimit':'6','format':'json'})[0]);return [p['title'][5:] for p in obj.get('query',{}).get('pages',{}).values() if p.get('title','').startswith('File:')]

def main():
 try:old=json.loads(MANIFEST.read_text())
 except Exception:old={}
 entries=old.get('images',{});status=[]
 overrides=json.loads((ROOT/'data'/'photo_overrides.json').read_text()) if (ROOT/'data'/'photo_overrides.json').exists() else {}
 def checkpoint():
  result={'generated_at':datetime.now(timezone.utc).isoformat(timespec='seconds'),'counts':{'verified':sum(bool(v.get('ok')) for v in entries.values()),'all':len(SPECIES)},'images':entries}
  MANIFEST.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 for i,f in enumerate(SPECIES,1):
  fid=f['id']; existing=OUT/(fid+'.jpg')
  override=overrides.get(fid)
  preferred=f.get('file','').replace('_',' ')
  source_file=unquote(urlparse(entries.get(fid,{}).get('source','')).path).split('File:')[-1].replace('_',' ')
  matches_source=(not override or entries.get(fid,{}).get('source')==override['page_url']) and (not preferred or source_file==preferred)
  if existing.is_file() and existing.stat().st_size>5000 and entries.get(fid,{}).get('license') and matches_source:
   status.append((f['name'],'cached'));continue
  files=[]
  if override:files.append('reviewed-override')
  elif f.get('file'):files.append(f['file'].replace('_',' '))
  for lang in ['ja','en']:
   if files:break
   for title in [f['name'],f.get('wiki')]:
    if not title:continue
    try:
     filename=wiki_file(lang,title)
     if filename and filename not in files: files.append(filename);break
    except Exception:pass
  if not files:
   try:files+=search_commons(f.get('wiki') or f['name'])
   except Exception:pass
  ok=False
  for filename in files[:9]:
   try:
    meta=override if override else commons_info(filename)
    if not meta:continue
    if not re.match(r'^(CC0\b|CC BY(?:-SA)?\b|Public domain\b|PD\b)',meta.get('license',''),re.I):continue
    try:body,mime=get(meta['url'],limit=7_000_000)
    except HTTPError as exc:
     if exc.code!=429 or override:raise
     preview=commons_html_info(filename)
     if not preview or preview['url']==meta['url']:raise
     meta=preview
     body,mime=get(meta['url'],limit=7_000_000)
    im=Image.open(io.BytesIO(body));im.load()
    if im.width<130 or im.height<75: continue
    im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((580,400))
    # reject transparently suspicious image formats that do not decode
    path=OUT/(fid+'.jpg');im.save(path,format='JPEG',quality=78,optimize=True)
    entries[fid]={'name':f['name'],'local':'images/fish/'+fid+'.jpg','ok':True,'license':meta['license'], 'source':meta['page_url'], 'artist_html':meta['artist_html'],'credit_html':meta['credit_html'],'pixel_size':[im.width,im.height], 'checked':datetime.now(timezone.utc).isoformat(timespec='seconds')};ok=True;break
   except Exception: continue
  if not ok:entries[fid]={'name':f['name'],'ok':False,'checked':datetime.now(timezone.utc).isoformat(timespec='seconds'),'reason':'Verified freely reusable Commons thumbnail not found or could not decode'}
  checkpoint()
  status.append((f['name'],'OK' if ok else 'NOT_VERIFIED'))
  print(f'{i}/{len(SPECIES)} {f["name"]}: '+('OK' if ok else 'NOT_VERIFIED'),flush=True)
  time.sleep(.35)
 result={'generated_at':datetime.now(timezone.utc).isoformat(timespec='seconds'),'counts':{'verified':sum(bool(v.get('ok')) for v in entries.values()),'all':len(SPECIES)},'images':entries}
 MANIFEST.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(result['counts']))
 if not result['counts']['verified']:sys.exit(2)
if __name__=='__main__':main()
