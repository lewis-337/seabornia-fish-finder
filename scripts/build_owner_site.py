"""Bundle the owner app for the SSO-protected sff-fishing-app Vercel project only."""
from pathlib import Path
import argparse
import json
import runpy
import shutil

ROOT = Path(__file__).resolve().parents[1]


def build(destination):
    out = Path(destination).resolve()
    out.mkdir(parents=True, exist_ok=False)
    runpy.run_path(str(ROOT / 'scripts/build_site.py'))
    shutil.copytree(ROOT / 'dist', out, dirs_exist_ok=True)
    for name in ['api/owner-chat.js', 'server/owner-chat-gateway.cjs']:
        target = out / name
        target.parent.mkdir(exist_ok=True, parents=True)
        shutil.copy2(ROOT / name, target)
    (out / 'data/chat-config-v11.json').write_text(json.dumps({
        'enabled': True, 'auth': 'session',
        'endpoint': '/api/owner-chat',
    }, indent=2) + '\n')
    (out / 'vercel.json').write_text(json.dumps({
        '$schema': 'https://openapi.vercel.sh/vercel.json', 'framework': None,
        'functions': {'api/owner-chat.js': {'maxDuration': 70}},
    }, indent=2) + '\n')
    (out / 'package.json').write_text(json.dumps({
        'name': 'sff-owner-app', 'private': True, 'engines': {'node': '22.x'},
    }, indent=2) + '\n')
    (out / '.vercelignore').write_text('.env\n.env.*\n.vercel\nnode_modules\n')
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination')
    print(build(parser.parse_args().destination))
