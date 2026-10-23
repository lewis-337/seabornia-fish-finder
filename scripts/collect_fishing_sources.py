"""Refresh reviewed public sources, retain old records and explicit provenance.

Normal scheduled runs read the newest two archive pages. The initial 24-month
backfill is reviewed and retained in each public marina pack. A new source must
declare its parser, marina association and evidence class before collection.
"""
import concurrent.futures
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

from fishing_reports import PARSERS, fish_name, named_fish

ROOT = Path(__file__).resolve().parents[1]


def reviewed_names(species):
    # Older catalogues keep prose in `aliases`; never split prose into characters.
    return list(dict.fromkeys(name for f in species for name in
        [f['name']] + (f.get('aliases', []) if isinstance(f.get('aliases'), list) else [])))


def validate_source(html, adapter):
    selectors = {'fishing-index': '.fishing_index', 'katakura-table': 'table',
        'newport-table': '#main .post', 'central-list': '#blog_list article',
        'naturum': '.blogbody', 'iwataya-list': '.infoListBox', 'yado-feed': '.blogbody'}
    selector = selectors.get(adapter)
    if selector and not BeautifulSoup(html, 'html.parser').select_one(selector):
        raise ValueError('Expected fishing source structure missing')


def retain_review(row, previous):
    r = dict(row)
    # These reviewed factual enrichments must survive an unchanged scheduled fetch.
    for key in ['area_id', 'location_note', 'kind', 'fish_reported', 'identity_status']:
        if previous.get(key) is not None:
            r[key] = previous[key]
    r['fish'] = fish_name(r['fish'])
    return r


def shared_kind(source, row):
    if source.get('sharedKind') == 'other-rental-report':
        return 'other-rental-report' if row.get('evidence_kind') == 'rental-report' else 'other-marina-report'
    return source.get('sharedKind', 'nearby-report')


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'SeaborniaFishFinder/10 (public fishing facts; personal app)'}), timeout=25) as r:
        raw = r.read(3_000_001)
        if len(raw) > 3_000_000:
            raise ValueError('source too large')
    # cp932 includes the boat numerals in legacy Japanese marina tables.
    if b'shift_jis' in raw[:2500].lower() or b'shift-jis' in raw[:2500].lower():
        return raw.decode('cp932', 'replace')
    return str(BeautifulSoup(raw, 'html.parser'))


def pages(config):
    yield config['url']
    if config.get('pages', 1) > 1:
        mode = config.get('paging', 'wordpress')
        if mode == 'pagecount':
            yield config['url'] + '?pagecount=2'
        elif mode == 'naturum':
            yield urljoin(config['url'], 'index_2.html')
        else:
            yield config['url'].rstrip('/') + '/page/2/'


def collected_evidence(reports, names=None):
    """One summary per species/method/source class; event counts are not rates."""
    groups = {}
    for r in reports:
        kind = 'report' if r.get('evidence_kind') == 'rental-report' else 'reference'
        fish = named_fish(r['fish'], names) if names is not None else [r['fish']]
        for name in fish:
            key = (name, r.get('method_kind', 'unknown'), r.get('source_id', ''), kind)
            groups.setdefault(key, []).append(r)
    out = []
    for (fish, method, source_id, kind), rows in groups.items():
        latest = max(rows, key=lambda r: r.get('date') or '')
        dated = [r for r in rows if r.get('date')]
        recent = sorted(rows, key=lambda r:r.get('date') or '', reverse=True)
        def facts(key):
            return ' / '.join(list(dict.fromkeys(r.get(key) for r in recent if r.get(key) and r[key] not in ['未掲載','非公開','不明']))[:3])
        out.append(dict(fish=fish, kind=kind, method=method, date=latest.get('date'),
                        depth=facts('depth'), tackle=facts('method'), ground=facts('ground_text'),
                        months=sorted({int(r['date'][5:7]) for r in dated}),
                        source=latest['source'], sourceType=latest.get('evidence_kind'),
                        source_id=source_id, collected_record_id=latest['id'],
                        sampleCount=len({r.get('event_id', r['id']) for r in rows}),
                        period=[min(r['date'] for r in dated), max(r['date'] for r in dated)] if dated else [],
                        note='公開された釣行日の分布。通年の釣れやすさ・成功率ではありません。複数魚名の一括数量は種別に配分しません。水深・仕掛けは最近の掲載例で、個別の記録は元の情報へ。' + ('レンタル艇の記録。' if kind == 'report' else '周辺・利用区分未確定の参考記録。レンタル航行可否は別確認。')))
    return out


def refresh(root=ROOT, fetcher=fetch):
    source_file = root / 'data/fishing-sources.json'
    sources = json.loads(source_file.read_text())['sources']
    registry_path = root / 'data/marinas.json'
    registry = json.loads(registry_path.read_text())
    species = json.loads((root / 'data/seed.json').read_text())['species'] + json.loads((root / 'data/marina-evidence.json').read_text())['species']
    names = reviewed_names(species)
    stamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
    today = datetime.now(timezone(timedelta(hours=9))).date().isoformat()
    review_path = root / 'data/fish-name-review.json'
    review = json.loads(review_path.read_text()) if review_path.exists() else dict(unresolved=[])
    unresolved = {q['name']:q for q in review['unresolved']}

    def one(source):
        config = dict(source, fishNames=names)
        rows, statuses = [], []
        for url in pages(config):
            try:
                html = fetcher(url)
                validate_source(html, config['adapter'])
                parsed = PARSERS[config['adapter']](html, url, config)
                parsed = [r for r in parsed if r.get('date') and r['date'] <= today]
                rows += parsed
                statuses.append(dict(source=url, source_id=source['id'], ok=True, checkedAt=stamp,
                                     records=len(parsed), contentHash=hashlib.sha256(html.encode()).hexdigest()))
            except Exception as e:
                statuses.append(dict(source=url, source_id=source['id'], ok=False, checkedAt=stamp, error=type(e).__name__))
        return source, rows, statuses

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(one, [s for s in sources if s.get('adapter') in PARSERS and s.get('scheduled', True)]))
    for m in registry['marinas']:
        if m['status'] == 'excluded':
            continue
        path = root / 'data/marinas' / (m['id'] + '.json')
        pack = json.loads(path.read_text())
        old = {r['id']: r for r in pack.get('reports', [])}
        by_event = {(r.get('source_id'),r.get('event_id'),fish_name(r['fish'])):r for r in old.values() if r.get('event_id')}
        before = json.dumps(old, sort_keys=True, ensure_ascii=False)
        statuses = []
        for source, rows, checks in results:
            if m['id'] not in source['marinaIds']:
                continue
            statuses += checks
            for row in rows:
                r = dict(row, marinaId=m['id'])
                # A shared nearby source never becomes another base's rental catch.
                if m['id'] != source['marinaIds'][0]:
                    r['evidence_kind'] = shared_kind(source, r)
                previous = old.get(r['id']) or by_event.get((r.get('source_id'),r.get('event_id'),fish_name(r['fish'])), {})
                if previous:
                    r['id'] = previous['id']  # Keep links stable after reviewed alias normalization.
                # Keep reviewed ground associations on re-collection.
                r = retain_review(r, previous)
                if not named_fish(r['fish'], names):
                    r['identity_status'] = '原文魚名・同定未確認'
                    q = unresolved.setdefault(r['fish'],dict(name=r['fish'],recordIds=[],sources=[],firstSeen=stamp))
                    q['recordIds'] = sorted(set(q['recordIds'] + [r['id']]))
                    q['sources'] = sorted(set(q['sources'] + [r['source']]))
                old[r['id']] = r
                if r.get('event_id'):
                    by_event[(r.get('source_id'),r['event_id'],r['fish'])] = r
        changed = before != json.dumps(old, sort_keys=True, ensure_ascii=False)
        pack.update(reports=sorted(old.values(), key=lambda r: r.get('date') or '', reverse=True),
                    checkedAt=stamp, source_status=statuses, changed=changed)
        if any(s['ok'] for s in statuses):
            pack['last_checked'] = stamp
        if changed:
            pack['last_success'] = stamp
        path.write_text(json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + '\n')
        m['evidence'] = [e for e in m.get('evidence', []) if not e.get('collected_record_id')]
        m['evidence'] += [dict(e, marinaId=m['id']) for e in collected_evidence(pack['reports'], names)]
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, separators=(',', ':')) + '\n')
    review['unresolved'] = list(unresolved.values())
    review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
    print('Public fishing sources:', len(results), '; successful pages:', sum(s['ok'] for _, _, ss in results for s in ss))
    return results


if __name__ == '__main__':
    refresh()
