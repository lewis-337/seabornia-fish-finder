import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs
from scripts import collect_depths as c

class DepthCollection(unittest.TestCase):
    area = dict(id='test', lat=35.16, lng=139.60)
    good = "Layer 'GEBCO_2026_2'\n x = '139.60208'\n y = '35.160417'\n value_list = '-20'"

    def test_axis_order_and_pinned_release(self):
        u=c.query(self.area);q=parse_qs(urlparse(u).query)
        self.assertIn('/2026/mapserv',u)
        self.assertEqual(q['QUERY_LAYERS'],['GEBCO_2026_2'])
        self.assertLess(float(q['BBOX'][0].split(',')[0]),36)
        self.assertEqual(q['WIDTH'],['3'])

    def test_numeric_land_and_invalid_cells(self):
        self.assertEqual(c.parse(self.good,self.area)['elevation_m'],-20)
        self.assertEqual(c.parse(self.good.replace("'-20'","'12'"),self.area)['elevation_m'],12)
        for text in ['ServiceException', self.good.replace("'-20'","'-32768'"),self.good.replace("'139.60208'","'140'"),self.good.replace("'-20'","'nan'")]:
            with self.assertRaises(ValueError):c.parse(text,self.area)

    def test_failed_refresh_preserves_last_successful_cell_and_timestamp(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(c,'ROOT',Path(folder)):
            data=Path(folder)/'data';data.mkdir()
            (data/'latest.json').write_text(json.dumps(dict(areas=[self.area])))
            first=c.collect(lambda _:self.good)
            def fail(_):raise OSError('unavailable')
            second=c.collect(fail)
            self.assertEqual(first['areas'],second['areas'])
            self.assertFalse(second['status'][0]['ok'])
