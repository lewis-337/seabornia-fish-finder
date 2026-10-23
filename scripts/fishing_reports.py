"""Source-specific public catch parsers. Publication dates alone are not trips.

Only structured caught-fish fields are imported, never page-wide substring matches.
Raw article text/photos stay with the publisher; this stores factual catch fields.
"""
import hashlib
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit, urljoin

from bs4 import BeautifulSoup


def text(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value or ''))).strip()


def iso(value):
    m = re.search(r'(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})', text(value))
    if not m:
        return None
    try:
        return date(*map(int, m.groups())).isoformat()
    except ValueError:
        return None


ALIASES = {'イトヨリ': 'イトヨリダイ', 'キス': 'シロギス', 'シロキス': 'シロギス',
           'シーバス': 'スズキ', '太刀魚': 'タチウオ', '白アマダイ': 'シロアマダイ',
           '本ガツオ': 'カツオ', 'チダイ': 'ハナダイ', 'ウマズラハギ': 'ウマヅラハギ',
           'ブり': 'ブリ', 'ショゴ(カンパチ)': 'ショゴ', 'カンパチ(ショゴ)': 'ショゴ',
           'スミイカ': 'コウイカ', 'マルイカ': 'ケンサキイカ', 'スマガツオ': 'スマ',
           'イトフエフキダイ': 'イトフエフキ'}


def fish_name(value):
    v = text(value).strip('・、, ✿【】[]')
    return ALIASES.get(v, v)


def named_fish(value, names):
    """Match reviewed names longest-first, without extracting fish from tackle."""
    rest = text(value)
    found = []
    for name in sorted(set(names) | set(ALIASES), key=len, reverse=True):
        pattern = r'(?<![ァ-ヶー])' + re.escape(name) + r'(?![ァ-ヶー])'
        if re.search(pattern, rest):
            found.append(fish_name(name))
            rest = re.sub(pattern, ' ', rest)
    return list(dict.fromkeys(found))


def trip_date(body, heading, published):
    """Use an explicit full trip date, or month/day corroborated by nearby year.
    A year inferred from the posting year is recorded transparently, never the
    posting day itself. Cross-year dates and Japanese weekdays are checked.
    """
    full = iso(heading) or iso(body[:100])
    if full:
        return full, '釣行日の明記'
    m = re.search(r'(\d{1,2})月\s*(\d{1,2})日(?:\s*[（(]([月火水木金土日])(?:曜日)?[)）])?', text(body[:100]))
    if not m or not published:
        return None, '釣行日不明'
    posted = date.fromisoformat(published)
    for year in [posted.year, posted.year - 1]:
        try:
            d = date(year, int(m[1]), int(m[2]))
        except ValueError:
            continue
        if 0 <= (posted - d).days <= 31 and (not m[3] or '月火水木金土日'[d.weekday()] == m[3]):
            return d.isoformat(), '釣行月日と掲載年を照合' + ('・曜日一致' if m[3] else '')
    return None, '釣行年を照合できず'


def field(lines, name):
    for i, line in enumerate(lines):
        m = re.match(r'(?:【' + name + r'】|' + name + r'\s*[:：])\s*(.*)', line)
        if m:
            rest = m[1].strip()
            if rest:
                return rest[:200]
            for following in lines[i + 1:]:
                if following:
                    return '' if following.startswith('【') else following[:200]
    return ''


def method_kind(tackle):
    bait = bool(re.search('エサ|餌|オキアミ|沖アミ|アサリ|泳がせ|サビキ|胴[付突]|落とし込み', tackle))
    lure = bool(re.search('ジグ|ジギング|タイラバ|ルアー|ミノー|ワーム|ティップラン|エギ|カブラ|キャスティング|ポッパー', tackle))
    return 'all' if bait and lure else 'bait' if bait else 'lure' if lure else 'unknown'


def zero_only(amount):
    return bool(re.match(r'^0(?:\s*[-〜~～]\s*0)?\s*(?:匹|尾|枚|杯|本|個)(?:$|[（(\s])', text(amount)))


def record(config, event, fish, caught, published=None, **values):
    mid = config['marinaIds'][0]
    return dict(id='catch-' + hashlib.sha256((config['id'] + '|' + event + '|' + fish).encode()).hexdigest()[:20],
                event_id=config['id'] + ':' + event, source_id=config['id'], marinaId=mid,
                date=caught, publishedAt=published, fish=fish, source=config['url'],
                source_name=config['name'], evidence_kind=config.get('kind', 'nearby-report'),
                area_id=None, method='未掲載', depth='未掲載', amount='数量未掲載', **values)


def parse_index(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for item in soup.select('.fishing_index'):
        heading = item.select_one('h5')
        body = item.select_one('.main_text')
        if not heading or not body:
            continue
        title = text(heading.get_text(' ', strip=True))
        lines = [text(x) for x in body.get_text('\n', strip=True).splitlines()]
        full = text(body.get_text(' ', strip=True))
        pub = iso(item.select_one('.date').get_text()) if item.select_one('.date') else None
        caught, basis = trip_date(full, title, pub)
        # Dates with no defensible trip year stay in the reviewed-reference queue.
        if not caught or caught > datetime.now(timezone(timedelta(hours=9))).date().isoformat():
            continue
        owner = text(item.select_one('.user_name').get_text(' ', strip=True)) if item.select_one('.user_name') else ''
        rental = bool(re.search('シースタイルのお客|レンタル艇', owner + full[:100]))
        kind = 'rental-report' if rental else 'owner-report' if re.search('オーナー|保管艇',owner) else 'marina-report'
        grounds = [text(a.get_text()) for a in item.select('.user_name span a')]
        tackle = field(lines, '仕掛け')
        depth = field(lines, '水深')
        event = item.get('id') or hashlib.sha256((caught + title + owner).encode()).hexdigest()[:14]
        for result in item.select('.fishing_result'):
            value = text(result.get_text(' ', strip=True))
            match = re.match(r'^(.+?)(\d[\d.,〜~～\-・]*(?:匹|尾|枚|杯|本|個|kg|キロ|以上).*)$', value)
            if not match:
                continue
            if zero_only(match[2]):
                continue
            name = fish_name(match[1])
            r = record(config, event, name, caught, pub)
            r.update(source=url.split('#')[0] + '#' + event, evidence_kind=kind,
                     amount=match[2][:70], depth=depth or '未掲載', method=tackle or '未掲載',
                     method_kind=method_kind(tackle), ground_names=grounds,
                     ground_text=field(lines, 'ポイント') or '・'.join(grounds) or '非公開',
                     date_basis=basis, detail='レンタル艇の公開記録。' if rental else 'レンタル以外・利用区分未確定の参考記録。レンタル航行可否の証明ではありません。')
            rows.append(r)
    return rows


def parse_katakura(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for table in soup.find_all('table'):
        # Exclude wrapper tables containing several outings.
        if table.find('table'):
            continue
        fields = {}
        for tr in table.find_all('tr'):
            cells = tr.find_all(['td', 'th'], recursive=False)
            for i, cell in enumerate(cells[:-1]):
                key = text(cell.get_text()).replace(' ', '')
                if key in ['釣った日', 'ボート名', '釣り場', '魚種', '大きさ', '釣果', '仕掛け', 'ポイント', 'コメント']:
                    fields[key] = text(cells[i + 1].get_text(' ', strip=True))
        caught = iso(fields.get('釣った日'))
        if not caught or not fields.get('魚種') or caught > datetime.now(timezone(timedelta(hours=9))).date().isoformat():
            continue
        names = [fish_name(x) for x in re.split('[・、,]', fields['魚種']) if text(x)]
        amounts = [text(x) for x in re.split('[・、,]', fields.get('釣果', '')) if text(x)]
        tackle = fields.get('仕掛け', '')
        event = hashlib.sha256((caught + fields.get('ボート名', '') + fields['魚種']).encode()).hexdigest()[:16]
        rental = 'レンタル' in fields.get('ボート名', '')
        place = fields.get('釣り場', '')
        depth = re.search(r'水深\s*([0-9〜~～.\-]+\s*[mMｍＭ])', place + ' ' + fields.get('コメント', ''))
        for i, name in enumerate(names):
            amount = amounts[i] + '（原文）' if len(amounts) == len(names) else fields.get('釣果', '未掲載') + '（魚種別内訳不明）'
            r = record(config, event, name, caught)
            r.update(source=url, evidence_kind='rental-report' if rental else 'owner-report' if 'オーナー' in fields.get('ボート名','') else 'marina-report',
                     amount=amount, depth=depth[1] if depth else '未掲載', method=tackle or '未掲載',
                     method_kind=method_kind(tackle), ground_text=place or '非公開',
                     ground_names=[place] if place else [], date_basis='釣った日の明記',
                     detail='Sea-Styleレンタル艇の公開記録。' if rental else 'オーナー艇等の参考記録。レンタル航行可否の証明ではありません。')
            rows.append(r)
    return rows


def parse_yado(html, url, config):
    """Official ship sites using the public YadoCMS catch-detail template."""
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.select_one('#choka_detail,.choka_detail,.chokaDetail')
    if not main:
        return []
    full = text(main.get_text(' ', strip=True))
    caught = iso(full[:160])
    if not caught:
        return []
    rows = []
    for tr in main.select('tr'):
        cells = tr.find_all(['th', 'td'], recursive=False)
        if len(cells) < 2:
            continue
        name = fish_name(cells[0].get_text(' ', strip=True))
        if not re.fullmatch('[ァ-ヶー・（）()]+', name) or len(name) > 25:
            continue
        r = record(config, urlsplit(url).path, name, caught)
        r.update(source=url, amount=text(cells[-1].get_text(' ', strip=True)),
                 size=text(cells[1].get_text(' ', strip=True)) if len(cells) > 2 else '',
                 date_basis='公式の釣行日欄', detail='近隣遊漁船の参考釣果。釣果GPS・レンタル艇の航行許可は未確認。')
        rows.append(r)
    return rows


def parse_newport(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for post in soup.select('#main .post'):
        title = post.select_one('h2.title a')
        if not title:
            continue
        caught = iso(title.get_text())
        pub = iso(post.select_one('.blog_info').get_text()) if post.select_one('.blog_info') else None
        if not caught or not post.select('table tr'):
            continue
        source = urljoin(url, title['href'])
        for i, tr in enumerate(post.select('table tr')):
            cells = [text(c.get_text(' ', strip=True)) for c in tr.find_all(['td', 'th'], recursive=False)]
            if len(cells) < 3 or cells[0] == '魚種':
                continue
            name = fish_name(cells[0])
            if not name or len(name) > 35:
                continue
            r = record(config, source, name, caught, pub)
            # Rowspans are intentionally not borrowed from a previous fish row.
            r.update(source=source, amount=cells[2] + '（原文・匹欄）', size=cells[1],
                     ground_text=cells[3] if len(cells) > 3 else '魚種別の海域は原文参照',
                     date_basis='釣果見出しに年月日あり',
                     detail='ニューポート公式釣果。マリンクラブ・オーナー・Sea-Styleの利用区分は未確定。')
            rows.append(r)
    return rows


def parse_central(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    names = config.get('fishNames', [])
    for item in soup.select('#blog_list article'):
        heading = item.select_one('.title')
        excerpt = item.select_one('.excerpt')
        link = item.select_one('a.link[href]')
        posted = item.select_one('time')
        if not all([heading, excerpt, link, posted]):
            continue
        title, body = text(heading.get_text()), text(excerpt.get_text())
        pub = iso(posted.get('datetime'))
        # Reiwa dates explicitly supplied by the author are not publication dates.
        reiwa = re.search(r'令和\s*(\d+)年', body)
        if reiwa:
            body = body[:reiwa.start()] + str(int(reiwa[1]) + 2018) + '年' + body[reiwa.end():]
        normalized_title = re.sub(r'(\d{1,2})/(\d{1,2})', r'\1月\2日', title)
        caught, basis = trip_date(body, normalized_title, pub)
        if not caught:
            caught, basis = trip_date(normalized_title, '', pub)
        if not caught or not re.search('釣果', title):
            continue
        # These are actual catch entries; target-only event adverts are excluded.
        if any(v in title for v in ['募集', '予定', 'スクール', '大会案内']):
            continue
        kind = 'rental-report' if 'レンタル釣果' in title else 'owner-report' if 'オーナー' in title else 'marina-report'
        for name in named_fish(body, names):
            r = record(config, link['href'], name, caught, pub)
            depth = re.search(r'水深\s*(\d+(?:[〜~～-]\d+)?\s*[mM])', body)
            r.update(source=link['href'], evidence_kind=kind, date_basis=basis,
                     depth=depth[1] if depth else '未掲載',
                     detail='木更津・セントラル公式のレンタル釣果。' if kind == 'rental-report' else '木更津・セントラルのオーナー艇等の参考記録。')
            rows.append(r)
    return rows


def parse_naturum(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for post in soup.select('.blogbody'):
        heading = post.select_one('h3.title a')
        body = post.select_one('.main')
        if not heading or not body or '釣果情報' not in heading.get_text():
            continue
        caught = iso(heading.get_text())
        if not caught:
            continue
        summary = text(body.get_text(' ', strip=True)).split('◆')[0][:700]
        if re.search('釣れず|釣れな|釣果なし|お休み|休業', summary):
            continue
        kind = 'staff-report' if 'スタッフ' in summary else 'owner-report' if 'オーナー' in summary else 'rental-report' if re.search('レンタル|シースタイル|Sea.?Style', summary, re.I) else 'marina-report'
        if kind == 'rental-report' and not re.search('釣れ|釣果|ゲット|GET|キャッチ|好調|大漁', summary, re.I):
            continue
        source = urljoin(url, heading['href'])
        for name in named_fish(summary, config.get('fishNames', [])):
            # Never import a target that the same sentence says was not landed.
            if re.search(re.escape(name) + r'.{0,14}(?:バラシ|バラし|釣れず|不発|狙い)', summary):
                continue
            r = record(config, source, name, caught)
            r.update(source=source, evidence_kind=kind, date_basis='釣果見出しの年月日',
                     detail={'rental-report': 'D-marina公式のレンタル利用を記した釣果。艇・個別海域・魚種別数量は未掲載。', 'marina-report': 'D-marina公式の釣果まとめ。利用区分は本文に明記されず、レンタル実績とは断定しません。', 'owner-report': 'D-marinaのオーナー艇を含む参考記録。', 'staff-report': 'D-marinaスタッフ調査の参考記録。レンタル実績とは別。'}[kind])
            rows.append(r)
    return rows


def parse_iwataya(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for item in soup.select('.infoListBox'):
        heading = item.select_one('.entryTitle a')
        posted = item.select_one('.infoDate')
        if not heading or not posted:
            continue
        title = text(heading.get_text())
        pub = iso(posted.get_text())
        normalized = re.sub(r'(\d{1,2})/(\d{1,2})', r'\1月\2日', title)
        caught, basis = trip_date(normalized, '', pub)
        if not caught:
            continue
        body = text(item.get_text(' ', strip=True))
        m = re.search(r'ターゲット\s+([ァ-ヶー]+)\s+数\s+([^ ]+)\s+大きさ\s+([^ ]+)\s+ポイント\s+([^ ]+)', body)
        if not m or re.search('休船|中止', title):
            continue
        r = record(config, heading['href'], fish_name(m[1]), caught, pub)
        r.update(source=heading['href'], amount=m[2], size=m[3], ground_text=m[4],
                 date_basis=basis, detail='浦安・岩田屋の遊漁船釣果。Sea-Style艇の航行・釣り許可は未確認。')
        rows.append(r)
    return rows


def parse_yado_feed(html, url, config):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for item in soup.select('.blogbody'):
        heading = item.select_one('h3.title a[href*="ChokaDetail"]')
        if not heading:
            continue
        day = item.find_previous('h2', class_='date')
        caught = iso(day.get_text()) if day else None
        if not caught:
            continue
        source = urljoin(url, heading['href'])
        body = item.select_one('.text')
        lines = [text(x) for x in body.get_text('\n', strip=True).splitlines()] if body else []
        ground, depth = '', ''
        for i, line in enumerate(lines):
            if '釣り場と水深' in line:
                next_lines = [x for x in lines[i + 1:] if x][:2]
                ground = next_lines[0] if next_lines else ''
                depth = next_lines[1] if len(next_lines) > 1 else ''
                break
        for fish in item.select('.fish-name'):
            quantity = fish.find_next('span', class_='fish-num')
            if not quantity:
                continue
            amount = text(quantity.get_text(' ', strip=True))
            # A target-only zero catch does not become a caught-species record.
            if not text(fish.get_text()) or zero_only(amount):
                continue
            r = record(config, source, fish_name(fish.get_text()), caught)
            r.update(source=source, amount=amount, ground_text=ground or '非公開',
                     depth=depth if re.search(r'\d', depth) else '未掲載',
                     date_basis='公式釣果の日付見出し',
                     detail='近隣遊漁船の参考釣果。レンタル艇の航行・釣り許可の証明ではありません。')
            rows.append(r)
    return rows


PARSERS = {'fishing-index': parse_index, 'katakura-table': parse_katakura, 'yado-detail': parse_yado,
           'newport-table': parse_newport, 'central-list': parse_central,
           'naturum': parse_naturum, 'iwataya-list': parse_iwataya, 'yado-feed': parse_yado_feed}
