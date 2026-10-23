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

class ReportProvenance(unittest.TestCase):
 def test_only_explicit_rental_use_is_a_rental_catch(self):
  m={'id':'J47-0010','name':'test'};fish=[{'id':'1','name':'マダイ'}]
  a=parse_article('<main>レンタル艇で釣果 釣行日：2026年10月1日 マダイ</main>','https://example.com/',m,fish)
  b=parse_article('<main>オーナー艇の釣果 釣行日：2026年10月1日 マダイ</main>','https://example.com/',m,fish)
  self.assertEqual(a[0]['evidence_kind'],'rental-report');self.assertEqual(b[0]['evidence_kind'],'nearby-report')
 def test_japanese_date_is_not_dropped_at_utc_midnight_boundary(self):
  from datetime import datetime as RealDateTime,timezone as TZ,timedelta as TD
  from unittest.mock import patch
  class Clock(RealDateTime):
   @classmethod
   def now(cls,tz=None):return cls.fromtimestamp(RealDateTime(2026,10,23,16,30,tzinfo=TZ.utc).timestamp(),tz)
   def astimezone(self,tz=TZ.utc):return super().astimezone(tz)
  with patch('update_marina_reports.datetime',Clock):
   rows=parse_article('<main>釣行日：2026年10月24日 釣果 マダイ</main>','https://example.com/',{'id':'J47-0010','name':'test'},[{'id':'1','name':'マダイ'}])
  self.assertEqual(len(rows),1)

if __name__=='__main__':unittest.main()
