"""Merge reviewed source facts without replacing collected or device-local records."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def apply(root=ROOT):
    source = json.loads((root / 'data/marina-enrichment.json').read_text())
    path = root / 'data/marinas.json'
    registry = json.loads(path.read_text())
    for marina in registry['marinas']:
        mid = marina['id']
        if mid in source['profiles']:
            marina['profile'] = source['profiles'][mid]
            for item in marina['profile'].get('fishing', []):
                item['sourceStatus'] = source.get('sourceChecks', {}).get(item['source'])
        if mid in source['availability']:
            state = source['availability'][mid]
            marina['availability'] = state
            marina.update(status=state['status'], reason=state['reason'])
            if state['status'] == 'verified':
                marina['proof'] = state['source']
        # Idempotent: only this curated set is replaced; hourly collection survives.
        marina['evidence'] = [e for e in marina.get('evidence', []) if not e.get('curated_id', '').startswith('v9-')]
        marina['evidence'] += [dict(e, sourceStatus=source.get('sourceChecks', {}).get(e['source'])) for e in source['evidence'] if e['marinaId'] == mid]
    path.write_text(json.dumps(registry, ensure_ascii=False, separators=(',', ':')) + '\n')
    if (root / 'data/fishing-research.json').exists():
        from apply_fishing_research import apply as apply_research
        apply_research(root)
        registry = json.loads(path.read_text())
    return registry


if __name__ == '__main__':
    print('Enriched marina profiles:', sum('profile' in m for m in apply()['marinas']))
