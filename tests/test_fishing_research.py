import json, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from fishing_reports import trip_date, named_fish, parse_index, parse_yado_feed, fish_name, parse_naturum
from collect_fishing_sources import reviewed_names, validate_source, retain_review, refresh, shared_kind, aggregate_coverage, deduplicate_aggregates

CONFIG = dict(id='test', name='公式', url='https://example.com/fishing', marinaIds=['J14-0130'])
HTML = '''<div class="fishing_index" id="fishing-123"><h5>2026年10月20日 釣果</h5><div class="date">2026年10月21日</div><div class="user_name">シースタイルのお客様</div><div class="main_text">【水深】30〜50m<br>【仕掛け】タイラバ</div><div class="fishing_result">マダイ2匹</div></div>'''

class FishingResearchTests(unittest.TestCase):
 def test_catch_date_is_not_publication_date(self):
  self.assertEqual(trip_date('魚を釣りました', '釣果', '2026-10-20')[0], None)
  self.assertEqual(trip_date('12月31日', '', '2026-01-02')[0], '2025-12-31')
  self.assertIsNone(trip_date('10月20日(月)', '', '2026-10-21')[0])
  self.assertEqual(trip_date('10月20日(火)', '', '2026-10-21')[0], '2026-10-20')
 def test_tackle_and_other_species_do_not_become_catches(self):
  self.assertEqual(named_fish('ブリッジからタイラバ。シロアマダイ2匹', ['ブリ','イラ','アマダイ','シロアマダイ']), ['シロアマダイ'])
  self.assertEqual(fish_name('イトフエフキダイ'),'イトフエフキ')
  self.assertEqual(reviewed_names([dict(name='カサゴ', aliases='長い説明'), dict(name='スマ',aliases=['スマガツオ'])]), ['カサゴ','スマ','スマガツオ'])
 def test_structured_fields_and_unknown_species_are_preserved(self):
  r=parse_index(HTML, CONFIG['url'],CONFIG)[0]
  self.assertEqual((r['date'],r['publishedAt'],r['amount'],r['depth'],r['method_kind']),('2026-10-20','2026-10-21','2匹','30〜50m','lure'))
  self.assertEqual(r['evidence_kind'],'rental-report');self.assertIsNone(r['area_id'])
  self.assertEqual(parse_index(HTML.replace('マダイ','未同定魚'), CONFIG['url'],CONFIG)[0]['fish'],'未同定魚')
 def test_zero_only_and_blank_targets_are_not_catches(self):
  html='''<h2 class="date">2026年10月20日</h2><div class="blogbody"><h3 class="title"><a href="/ChokaDetail/1">釣果</a></h3><span class="fish-name">マダイ</span><span class="fish-num">0〜0匹</span></div>'''
  self.assertEqual(parse_yado_feed(html,CONFIG['url'],CONFIG),[])
 def test_shared_owner_or_unspecified_use_never_becomes_rental_evidence(self):
  source=dict(sharedKind='other-rental-report')
  self.assertEqual(shared_kind(source,dict(evidence_kind='rental-report')),'other-rental-report')
  self.assertEqual(shared_kind(source,dict(evidence_kind='owner-report')),'other-marina-report')
  self.assertEqual(parse_index(HTML.replace('シースタイルのお客様','お客様'),CONFIG['url'],CONFIG)[0]['evidence_kind'],'marina-report')
 def test_combined_free_text_rows_do_not_duplicate_new_per_species_rows(self):
  rows=[dict(id='combined',source_id='free',event_id='outing',fish='サワラ・サゴシ',amount='数量未掲載'),dict(id='single',source_id='free',event_id='outing',fish='サワラ',amount='数量未掲載'),dict(id='measured',source_id='free',event_id='outing',fish='サワラ',amount='2匹'),dict(id='another',source_id='free',event_id='another',fish='サワラ',amount='数量未掲載')]
  names=['サワラ','サゴシ'];kept=deduplicate_aggregates(rows,names,{'free'})
  self.assertEqual([r['id'] for r in kept],['combined','measured','another'])
  self.assertEqual(aggregate_coverage(kept,names,{'free'})[('free','outing')],{'サワラ','サゴシ'})
  self.assertEqual(deduplicate_aggregates(rows,names,{'structured'}),rows)
  self.assertEqual(fish_name('ハマフエフキ'),'タマン');self.assertEqual(fish_name('キダイ'),'レンコダイ')
 def test_scheduled_refresh_does_not_reinsert_split_duplicates(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);d=root/'data';(d/'marinas').mkdir(parents=True);cfg=dict(CONFIG,adapter='naturum')
   species=[dict(name=n) for n in ['サワラ','サゴシ','マダイ']]
   (d/'seed.json').write_text(json.dumps(dict(species=species)));(d/'marina-evidence.json').write_text('{"species":[]}');(d/'fishing-sources.json').write_text(json.dumps(dict(sources=[cfg])));(d/'marinas.json').write_text(json.dumps(dict(marinas=[dict(id='J14-0130',status='active',evidence=[])])))
   html='<div class="blogbody"><h3 class="title"><a href="/catch-1.html">2026年10月20日 釣果情報</a></h3><div class="main">レンタルの釣果 サワラ・サゴシ・マダイをキャッチ</div></div>'
   parsed=parse_naturum(html,cfg['url'],dict(cfg,fishNames=['サワラ','サゴシ','マダイ']))
   combined=dict(parsed[0],id='combined',fish='サワラ・サゴシ')
   path=d/'marinas/J14-0130.json';path.write_text(json.dumps(dict(areas=[],reports=[combined],last_success='original')))
   refresh(root,lambda url:html);out=json.loads(path.read_text());self.assertEqual({r['fish'] for r in out['reports']},{'サワラ・サゴシ','マダイ'})
   refresh(root,lambda url:html);out=json.loads(path.read_text());self.assertEqual(len(out['reports']),2);self.assertFalse(out['changed'])
 def test_maintenance_page_is_failure_not_empty_collection(self):
  with self.assertRaises(ValueError):validate_source('<h1>メンテナンス</h1>','fishing-index')
 def test_refresh_stability_and_failure_keep_reviewed_records(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);d=root/'data';(d/'marinas').mkdir(parents=True)
   (d/'seed.json').write_text(json.dumps(dict(species=[dict(name='マダイ')])));(d/'marina-evidence.json').write_text('{"species":[]}')
   (d/'fishing-sources.json').write_text(json.dumps(dict(sources=[dict(CONFIG,adapter='fishing-index')])))
   (d/'marinas.json').write_text(json.dumps(dict(marinas=[dict(id='J14-0130',status='active',evidence=[])])))
   path=d/'marinas/J14-0130.json';previous=parse_index(HTML, CONFIG['url'], CONFIG)[0];previous.update(area_id='reviewed-ground',location_note='概略位置',kind='current')
   path.write_text(json.dumps(dict(areas=[],reports=[previous],last_success='original')))
   refresh(root,lambda url:HTML);out=json.loads(path.read_text());self.assertFalse(out['changed']);self.assertEqual(out['last_success'],'original');self.assertEqual(out['reports'][0]['area_id'],'reviewed-ground')
   refresh(root,lambda url:'<h1>サービス一時停止</h1>');out=json.loads(path.read_text());self.assertFalse(out['source_status'][0]['ok']);self.assertEqual(out['reports'],[previous]);self.assertEqual(out['last_success'],'original')

if __name__=='__main__':unittest.main()

class RegionalBudgetTests(unittest.TestCase):
 def test_historical_tide_backfill_stops_after_first_provider_failure(self):
  from collect_marina_conditions import collect
  from update_conditions import TIDE, JST
  from datetime import datetime
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);d=root/'data';(d/'marinas').mkdir(parents=True);(d/'tide-stations').mkdir()
   (d/'marinas.json').write_text(json.dumps(dict(marinas=[dict(id='J14-0170',name='M',status='verified',basin='sagami',lat=35.16,lng=139.62)])))
   (d/'marinas/J14-0170.json').write_text(json.dumps(dict(areas=[],reports=[dict(date=f'2025-{m:02d}-01') for m in range(1,13)])))
   calls=[]
   def unavailable(url,params):calls.append(url);raise TimeoutError('fixture outage')
   collect(root,unavailable,datetime(2026,10,24,tzinfo=JST))
   self.assertEqual(calls.count(TIDE),1)
   cache=json.loads((d/'tide-stations/14-16.json').read_text());self.assertGreater(cache['pendingDates'],30);self.assertEqual(cache['days'],{});self.assertEqual(cache['status'],'partial')
 def test_reviewed_import_rejects_private_coordinates_before_any_write(self):
  from import_reviewed_reports import import_rows
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);(root/'data').mkdir();(root/'data/fishing-sources.json').write_text(json.dumps(dict(sources=[CONFIG])))
   row=parse_index(HTML,CONFIG['url'],CONFIG)[0];row['lat']=35.2
   with self.assertRaises(ValueError):import_rows([row],root)
   self.assertFalse((root/'data/marinas.json').exists())

class GeographicFootprintTests(unittest.TestCase):
 def test_platform_roundoff_is_allowed_but_material_misalignment_is_rejected(self):
  from cache_marina_maps import same_bounds
  a=[127.7,26.2,127.9,26.4]
  self.assertTrue(same_bounds(a,[x+1e-12 for x in a]))
  self.assertFalse(same_bounds(a,[127.7,26.20001,127.9,26.4]))
  self.assertFalse(same_bounds(None,a));self.assertFalse(same_bounds(a,[float('nan')]*4))
