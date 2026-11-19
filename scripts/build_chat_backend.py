"""Create a deployment bundle containing only the fishing API and public reference data."""
from pathlib import Path
import argparse
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]


def build(destination):
    out = Path(destination).resolve()
    # A fresh directory avoids silently replacing an existing deployment or unrelated files.
    out.mkdir(parents=True, exist_ok=False)
    files = ['api/chat.js', 'server/chat-service.cjs', 'server/start.cjs',
             'fishing-chat-core-v11.js', 'data/fishing-knowledge-v11.json',
             'data/marinas.json', 'data/fishing-research.json', 'data/latest.json',
             'data/marina-evidence.json']
    registry = json.loads((ROOT / 'data/marinas.json').read_text())
    for row in registry['marinas']:
        if row['status'] != 'excluded' and row.get('availability', {}).get('state') not in ['closed', 'rental-suspended', 'no-fleet']:
            files.append(f"data/marinas/{row['id']}.json")
    for name in files:
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    (out / 'package.json').write_text(json.dumps({
        'name': 'sff-private-chat-api', 'version': '1.0.0', 'private': True,
        'engines': {'node': '22.x'}, 'scripts': {'start': 'node server/start.cjs'}
    }, indent=2) + '\n')
    (out / 'vercel.json').write_text(json.dumps({
        '$schema': 'https://openapi.vercel.sh/vercel.json',
        'functions': {'api/chat.js': {'maxDuration': 60, 'includeFiles': 'data/**'}}
    }, indent=2) + '\n')
    (out / '.vercelignore').write_text('.env\n.env.*\nnode_modules\n')
    (out / 'bundle-manifest.json').write_text(json.dumps({'publicFiles': files}, indent=2) + '\n')
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', help='New output folder, normally under /tmp')
    print(build(parser.parse_args().destination))
