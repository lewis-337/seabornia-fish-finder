import unittest
from unittest.mock import patch
from scripts.cache_fish_photos import commons_html_info


class PhotoMetadataTests(unittest.TestCase):
    def parse(self, licenses, image='https://upload.wikimedia.org/photo.jpg'):
        html = '<div id="file"><img src="' + image + '"></div><table><tr><td id="fileinfotpl_aut">Author</td><td>Named photographer</td></tr></table>'
        html += ''.join('<span class="licensetpl_short">' + value + '</span>' for value in licenses)
        with patch('scripts.cache_fish_photos.get', return_value=(html.encode(), 'text/html')):
            return commons_html_info('Example.jpg')

    def test_dual_license_can_select_freely_reusable_option(self):
        meta = self.parse(['GFDL', 'CC BY-SA 3.0'])
        self.assertEqual(meta['license'], 'CC BY-SA 3.0')
        self.assertEqual(meta['artist_html'], 'Named photographer')

    def test_unknown_license_or_non_wikimedia_image_is_rejected(self):
        self.assertIsNone(self.parse(['All rights reserved']))
        self.assertIsNone(self.parse(['CC BY-NC 4.0']))
        self.assertIsNone(self.parse(['CC BY 4.0'], 'https://example.com/photo.jpg'))


if __name__ == '__main__':
    unittest.main()
