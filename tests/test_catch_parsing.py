import unittest
from datetime import datetime, timezone, timedelta
from scripts.update_catches import parse_ship_html, parse_mitsuji

SHIP = {'url': 'https://example.com/catch/', 'name': 'Test', 'port': 'Test port'}


class CatchParsingTests(unittest.TestCase):
    def test_separate_fish_keep_their_own_size_and_amount(self):
        html = '<p>釣行日：2025年10月18日</p><p>マダイ</p><p>30～45cm</p><p>1～3匹</p><p>アオリイカ</p><p>0.3～0.8kg</p><p>2～5杯</p><p>釣行当日の潮汐</p>'
        rows = parse_ship_html(html, SHIP)
        self.assertEqual([(r['fish'], r['size'], r['amount']) for r in rows], [('マダイ', '30～45cm', '1～3匹'), ('アオリイカ', '0.3～0.8kg', '2～5杯')])
        self.assertTrue(all(r['area_id'] is None for r in rows))

    def test_measurement_changes_keep_stable_record_identity(self):
        base = '<p>釣行日：2025年10月18日</p><p>マダイ</p><p>{}匹</p>'
        a = parse_ship_html(base.format(2), SHIP)
        b = parse_ship_html(base.format(3), SHIP)
        self.assertEqual(a[0]['id'], b[0]['id'])

    def test_invalid_or_future_dates_are_rejected(self):
        for day in ['2025年2月31日', '2099年10月18日']:
            self.assertEqual(parse_ship_html(f'<p>釣行日：{day}</p><p>マダイ</p>', SHIP), [])

    def test_long_species_name_does_not_create_short_name_duplicate(self):
        now = datetime.now(timezone(timedelta(hours=9)))
        html = f'<h2>{now.month}月{now.day}日の釣果</h2><p>マサバ 3匹</p><p>シロアマダイ 1匹</p>'
        rows = parse_mitsuji(html, SHIP)
        self.assertEqual([r['fish'] for r in rows], ['マサバ', 'シロアマダイ'])


if __name__ == '__main__':
    unittest.main()
