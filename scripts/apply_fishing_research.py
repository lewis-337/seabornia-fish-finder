"""Apply reviewed factual guides and per-marina research receipts idempotently."""
import json
from pathlib import Path


def apply(root):
    path = root / 'data/fishing-research.json'
    if not path.exists():
        return
    research = json.loads(path.read_text())
    registry_path = root / 'data/marinas.json'
    registry = json.loads(registry_path.read_text())
    for m in registry['marinas']:
        mid = m['id']
        if mid not in research['marinas']:
            continue
        m['research'] = research['marinas'][mid]
        m['evidence'] = [e for e in m.get('evidence', []) if not e.get('research_id')]
        m['evidence'] += [dict(e, marinaId=mid) for e in research.get('guides', []) if mid in e['marinaIds']]
        pack_path = root / 'data/marinas' / (mid + '.json')
        pack = json.loads((root / 'data/latest.json').read_text()) if mid == 'J14-0170' else json.loads(pack_path.read_text())
        m['research']['counts'] = dict(reports=len(pack.get('reports', [])),
            events=len({r.get('event_id', r['id']) for r in pack.get('reports', [])}),
            rentalEvents=len({r.get('event_id', r['id']) for r in pack.get('reports', []) if r.get('evidence_kind') == 'rental-report'}),
            species=len({e['fish'] for e in m['evidence']}), grounds=len(pack['areas']))
        plans = []
        # Practical facts, not paragraphs copied from publishers.
        for e in m['evidence']:
            if e.get('research_id') and (e.get('tackle') or e.get('depth')):
                plans.append(dict(fish=e['fish'], where=e.get('ground', '海域未確認'),
                                  tackle=' / '.join(x for x in [e.get('depth'), e.get('tackle')] if x),
                                  context=e.get('note', ''), source=e['source'], research_id=e['research_id']))
        catches = [dict(fish=e['fish'],where=e.get('ground') or '海域非公開',
            tackle=' / '.join(x for x in [e.get('depth'),e.get('tackle')] if x),
            context=(e.get('date') or '')+' '+('レンタル艇の記録。' if e['kind']=='report' else '参考記録・レンタル実績とは別。')+' 個別の根拠は出典へ。',
            source=e['source'],collected_plan=True)
            for e in sorted(m['evidence'],key=lambda e:(e.get('kind')=='report',e.get('date') or ''),reverse=True)
            if e.get('collected_record_id') and (e.get('depth') or e.get('tackle'))]
        m['profile']['fishing'] = catches + plans + [x for x in m.get('profile', {}).get('fishing', []) if not x.get('research_id') and not x.get('collected_plan')]
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    apply(Path(__file__).resolve().parents[1])
