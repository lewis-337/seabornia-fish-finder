import unittest
import tempfile
import json
from pathlib import Path
from datetime import datetime, timedelta
from scripts.update_conditions import collect, normalize_tide, normalize_forecast, JST

class ConditionsTests(unittest.TestCase):
    def test_failed_update_retains_last_successful_values_and_timestamp(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'data').mkdir()
            (root/'data/latest.json').write_text(json.dumps({'areas':[], 'marina':{'name':'M','lat':35.16,'lng':139.62},'reports':[]}))
            old={'schema_version':1,'areas':{'marina':{'weather':{'fetchedAt':'2026-10-20T00:00:00+09:00','hours':[{'time':'2026-10-20T01:00','wind_speed_10m':3}]}}}}
            (root/'data/conditions.json').write_text(json.dumps(old))
            def failed(url,params): raise TimeoutError('fixture')
            c,t=collect(root,failed,datetime(2026,10,22,tzinfo=JST))
            self.assertEqual(c['areas']['marina']['weather']['hours'],old['areas']['marina']['weather']['hours'])
            self.assertEqual(c['areas']['marina']['weather']['fetchedAt'],old['areas']['marina']['weather']['fetchedAt'])
            self.assertEqual(c['areas']['marina']['weather']['status'],'failed')
            self.assertNotIn('fetchedAt',c['areas']['marina']['marine'])
            self.assertEqual(t['days'],{})
            self.assertTrue(t['failures'])
    def test_tide_jst_milliseconds_and_24_hour_endpoint(self):
        d=datetime(2026,10,22,tzinfo=JST)
        curve=[{'time':(d+timedelta(minutes=i*20)).strftime('%H:%M') if i<72 else '24:00','unix':int((d+timedelta(minutes=i*20)).timestamp()*1000),'cm':50+i} for i in range(73)]
        raw={'status':1,'tide':{'port':{'harbor_code':16},'chart':{'2026-10-22':{'tide':curve,'flood':[],'edd':[],'moon':{'title':'中潮'},'sun':{'rise':'05:53','set':'16:59'}}}}}
        result=normalize_tide(raw,'2026-10-22','stamp')
        self.assertEqual(len(result['curve']),73)
        raw['tide']['port']['harbor_code']=15
        with self.assertRaises(ValueError): normalize_tide(raw,'2026-10-22','stamp')
    def test_weather_units_and_null_values(self):
        raw={'timezone':'Asia/Tokyo','hourly':{'time':['2026-10-22T00:00'],'wind_speed_10m':[3], 'wind_gusts_10m':[None]},'hourly_units':{'wind_speed_10m':'m/s','wind_gusts_10m':'m/s','precipitation':'mm'}}
        result=normalize_forecast(raw,'weather','stamp')
        self.assertIsNone(result['hours'][0]['wind_gusts_10m'])
        raw['hourly_units']['wind_speed_10m']='km/h'
        with self.assertRaises(ValueError):normalize_forecast(raw,'weather','stamp')

if __name__=='__main__':unittest.main()
