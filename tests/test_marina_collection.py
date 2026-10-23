# -*- coding: utf-8 -*-
import unittest,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect_marina_conditions import station_for
from update_marina_reports import parse_article
class MarinaCollection(unittest.TestCase):
 def test_station_mapping_does_not_reuse_oil_tsubo_across_coasts(self):
  a=station_for(dict(id='J47-0010',basin='okinawa-west'));b=station_for(dict(id='J47-0020',basin='okinawa-east'))
  self.assertEqual(a['id'],'47-23');self.assertEqual(b['id'],'47-32')
  self.assertEqual(station_for(dict(id='J08-0040',basin='pacific'))['id'],'8-5')
 def test_publication_date_never_becomes_catch_date(self):
  rows=parse_article('<main>更新日：2026年10月1日 釣果 マダイ</main>','https://example.com/',{'id':'J47-0010','name':'test'},[{'name':'マダイ','id':'1'}])
  self.assertEqual(rows,[])
 def test_explicit_catch_time_and_gps_remain_unknown(self):
  rows=parse_article('<main>釣行日：2026年10月1日 釣果 マダイ</main>','https://example.com/',{'id':'J47-0010','name':'test'},[{'name':'マダイ','id':'1'}])
  self.assertEqual(rows[0]['date'],'2026-10-01');self.assertIsNone(rows[0]['area_id']);self.assertNotIn('time',rows[0]);self.assertNotIn('lat',rows[0])
 def test_longer_fish_names_do_not_become_shorter_species(self):
  rows=parse_article('<main>釣行日：2026年10月1日 釣果 シロアマダイ</main>','https://example.com/',{'id':'J47-0010','name':'test'},[{'name':'アマダイ','id':'1'},{'name':'シロアマダイ','id':'2'}])
  self.assertEqual([r['fish'] for r in rows],['シロアマダイ'])
if __name__=='__main__':unittest.main()
