"""Validate and import a reviewed public backfill, preserving stable source IDs.

Usage: python scripts/import_reviewed_reports.py reviewed-rows.json
Rows must have been read in full, parsed with fishing_reports and reviewed; this
command is deliberately not a search-snippet or private-record import.
"""
import json
import sys
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from urllib.parse import urlsplit
from collect_fishing_sources import shared_kind, collected_evidence, reviewed_names
ROOT = Path(__file__).resolve().parents[1]


def import_rows(rows, root=ROOT):
    configs = {s['id']:s for s in json.loads((root/'data/fishing-sources.json').read_text())['sources']}
    today = datetime.now(timezone(timedelta(hours=9))).date()
    if not isinstance(rows,list) or not rows:
        raise ValueError('Reviewed public rows required')
    for r in rows:
        source=configs.get(r.get('source_id'))
        if not source or not r.get('event_id') or not r.get('fish') or not r.get('id'):
            raise ValueError('Source identity, fish and event required')
        caught=date.fromisoformat(r['date'])
        if not date(2024,10,24)<=caught<=today:
            raise ValueError('Catch date outside reviewed backfill period')
        if urlsplit(r['source']).scheme!='https' or urlsplit(r['source']).hostname!=urlsplit(source['url']).hostname:
            raise ValueError('Full source page must belong to reviewed source')
        if any(k in r for k in ['lat','lng','lon','photo','photoData','private']):
            raise ValueError('Private/exact positions and photos are not public catch facts')
    registry_path=root/'data/marinas.json';registry=json.loads(registry_path.read_text())
    species=json.loads((root/'data/seed.json').read_text())['species']+json.loads((root/'data/marina-evidence.json').read_text())['species']
    names=reviewed_names(species);writes={};stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
    for m in registry['marinas']:
        if m['status']=='excluded':continue
        path=root/'data/marinas'/f"{m['id']}.json";pack=json.loads(path.read_text());old={r['id']:r for r in pack.get('reports',[])};changed=False
        for row in rows:
            source=configs[row['source_id']]
            if m['id'] not in source['marinaIds']:continue
            r=dict(row,marinaId=m['id'])
            if m['id']!=source['marinaIds'][0]:r['evidence_kind']=shared_kind(source,r)
            if old.get(r['id'])!=r:old[r['id']]=r;changed=True
        if not changed:continue
        pack.update(reports=sorted(old.values(),key=lambda r:r['date'],reverse=True),last_success=stamp)
        m['evidence']=[e for e in m.get('evidence',[]) if not e.get('collected_record_id')]+[dict(e,marinaId=m['id']) for e in collected_evidence(pack['reports'],names)]
        writes[path]=json.dumps(pack,ensure_ascii=False,separators=(',',':'))+'\n'
    writes[registry_path]=json.dumps(registry,ensure_ascii=False,separators=(',',':'))+'\n'
    # All rows and destination packs are validated before the first replacement.
    originals={p:p.read_bytes() for p in writes}
    try:
        for p,body in writes.items():p.write_text(body)
    except Exception:
        for p,body in originals.items():p.write_bytes(body)
        raise
    return len(writes)-1


if __name__=='__main__':
    print('Updated public marina packs:',import_rows(json.loads(Path(sys.argv[1]).read_text())))
