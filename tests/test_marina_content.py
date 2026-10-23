import unittest,json,tempfile,sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from apply_marina_enrichment import apply

class ContentIntegrity(unittest.TestCase):
 def test_every_selectable_marina_has_source_checked_profile(self):
  registry=json.loads((ROOT/'data/marinas.json').read_text())['marinas']
  for m in registry:
   if m['status']=='excluded':continue
   p=m['profile'];self.assertTrue(p['summary'] and p['preparation'] and p['checkedAt'])
   for k in ['address','phone','hours','closedDays','parking']:self.assertTrue(p['basics'][k],(m['id'],k))
   for f in p['fishing']:self.assertTrue(f['source'].startswith('https://'))
 def test_all_57_photos_decode_and_keep_reusable_attribution(self):
  species=json.loads((ROOT/'data/seed.json').read_text())['species']+json.loads((ROOT/'data/marina-evidence.json').read_text())['species']
  photos=json.loads((ROOT/'data/photo_manifest.json').read_text())['images']
  self.assertEqual(len(species),57)
  for f in species:
   p=photos[f['id']];self.assertTrue(p['ok']);self.assertRegex(p['license'],r'^(CC0|CC BY|Public domain|PD)');self.assertTrue(p['source'] and p['artist_html'])
   with Image.open(ROOT/p['local']) as img:img.load();self.assertGreaterEqual(img.width,130)
  self.assertIn('Sphyraena_pinguis',photos['45']['source'])
  for fid in ['gurukun','miibai','gara','fuefuki','saba']:
   self.assertIn('代表例',next(f for f in species if f['id']=='regional-'+fid)['photoLabel'])
 def test_review_post_dates_are_not_catch_dates_or_season_evidence(self):
  x=json.loads((ROOT/'data/marina-enrichment.json').read_text())
  for e in x['evidence']:
   if e.get('sourceType')=='member-review':
    self.assertNotIn('date',e);self.assertEqual(e['months'],[]);self.assertEqual(e['kind'],'reference');self.assertTrue(e['publishedAt'])
  # Do not misread ブリッジ, タイラバ, アマダイ, サバフグ or an unsuccessful target as catches.
  facts={(e['marinaId'],e.get('publishedAt'),e['fish']) for e in x['evidence']}
  for fact in [('J12-0045','2026-10-05','ブリ'),('J14-0130','2026-10-17','イラ'),('J14-0100','2026-02-20','マダイ'),('J14-0200','2026-06-07','サバ'),('J14-0200','2026-06-21','サワラ')]:self.assertNotIn(fact,facts)
 def test_curated_merge_is_idempotent_and_retains_collected_evidence(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);(root/'data').mkdir()
   for f in ['marina-enrichment.json','marinas.json']:(root/'data'/f).write_bytes((ROOT/'data'/f).read_bytes())
   p=root/'data/marinas.json';a=json.loads(p.read_text());a['marinas'][0]['evidence'].append({'fish':'マダイ','kind':'report','collected_record_id':'keep'});p.write_text(json.dumps(a))
   one=apply(root);two=apply(root);self.assertEqual(one,two)
   self.assertTrue(any(e.get('collected_record_id')=='keep' for e in two['marinas'][0]['evidence']))
   oil=next(m for m in two['marinas'] if m['id']=='J14-0180');self.assertEqual(oil['status'],'excluded');self.assertEqual(oil['availability']['state'],'no-fleet')
