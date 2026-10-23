"""Package only browser assets for GitHub Pages; never publish repository internals."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
if OUT.exists():
    shutil.rmtree(OUT)  # Generated, ignored output only; prevent publishing stale releases.
OUT.mkdir()
for name in ['index.html', 'styles-v10.css', 'app-v10.js', 'marina-core-v10.js', 'marina-discovery-v10.js', 'basemap-v10.js', 'fish-areas-v10.js', 'map-gestures.js', 'trip-conditions-v8.js', 'trip-ui-v8.js', 'sw.js', 'manifest.webmanifest', '.nojekyll']:
    shutil.copy2(ROOT / name, OUT / name)
for name in ['data', 'icons', 'images', 'vendor']:
    shutil.copytree(ROOT / name, OUT / name, dirs_exist_ok=True)
print('Static app ready in dist/')
