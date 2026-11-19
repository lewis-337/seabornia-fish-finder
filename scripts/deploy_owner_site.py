"""Publish only after verifying all-deployment Vercel Authentication on the owner project."""
import json
from pathlib import Path
import subprocess
import tempfile
from build_owner_site import build

PROJECT = 'sff-fishing-app'
SCOPE = 'lewis-337s-projects'
TEAM = 'team_HaIg6ooh9LHChTOu2gI3KsKB'


def main():
    check = subprocess.run(
        ['vercel', 'api', f'/v9/projects/{PROJECT}?teamId={TEAM}', '--raw'],
        check=True, capture_output=True, text=True,
    )
    project = json.loads(check.stdout)
    if (project.get('ssoProtection') or {}).get('deploymentType') != 'all':
        raise SystemExit('Deployment stopped: owner chat requires Vercel Authentication for ALL deployments.')
    if not project.get('autoExposeSystemEnvs'):
        raise SystemExit('Deployment stopped: owner gateway needs Vercel system environment variables.')
    out = build(Path(tempfile.mkdtemp(prefix='sff-owner-')) / 'site')
    subprocess.run(
        ['vercel', 'deploy', str(out), '--project', PROJECT, '--scope', SCOPE, '--prod', '--yes'],
        check=True,
    )


if __name__ == '__main__':
    main()
