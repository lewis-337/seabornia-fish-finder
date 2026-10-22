"""Package only browser assets for GitHub Pages; never publish repository internals."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
for name in ['index.html', 'styles.css', 'app.js', 'map-gestures.js', 'sw.js', 'manifest.webmanifest', '.nojekyll']:
    shutil.copy2(ROOT / name, OUT / name)
for name in ['data', 'icons', 'images']:
    shutil.copytree(ROOT / name, OUT / name, dirs_exist_ok=True)
print('Static app ready in dist/')
