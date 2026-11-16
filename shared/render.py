from __future__ import annotations
import datetime, html, json, re
from html.parser import HTMLParser
from pathlib import Path
import datause
NEXT = True
NAV = [('map', 'ecosystem.html', 'Overview'), ('fits', 'how-to-irl.html', 'How to IRL'), ('links', 'links.html', 'Links'), ('standards', 'standards.html', 'Standards'), ('help', 'help.html', 'Help'), ('working', 'roadmap.html', 'Roadmap'), ('about', 'about.html', 'About'), ('contribute', 'contribute.html', 'Contribute')]

FOOT_GROUPS = [('Start', [('home', 'index.html', 'Home'), ('map', 'ecosystem.html', 'Overview'), ('fits', 'how-to-irl.html', 'How to IRL')]), ('Guides', [('plans', 'data-plans.html', 'Data plans and SIMs'), ('why', 'why-bonding.html', 'Why more than one network?'), ('help', 'help.html', 'Help'), ('checks', 'checks.html', 'Quick checks'), ('glossary', 'glossary.html', 'Glossary')]), ('Data and standards', [('links', 'links.html', 'Links'), ('standards', 'standards.html', 'Standards'), ('open', 'open-standards.html', 'Open standards'), ('contribute', 'contribute.html', 'Contribute')]), ('About and legal', [('about', 'about.html', 'About'), ('working', 'roadmap.html', 'Roadmap')])]

FOOT_PAGES = [x for _, items in FOOT_GROUPS for x in items]

COMMONS = {'repo': 'https://github.com/irl-commons/irl-commons', 'suggest': 'https://github.com/irl-commons/irl-commons/issues', 'licence': 'https://creativecommons.org/licenses/by/4.0/'}

def commons_line() -> str:
    return f'''<p class="commons-line">From <a href="{COMMONS['repo']}">irl-commons</a> · <a href="{COMMONS['licence']}">CC BY 4.0</a> · <a href="{COMMONS['suggest']}">Suggest a change</a></p>'''

def commons_teaser() -> str:
    return f'''<p class="commons-teaser" id="listed">Missing an app, a service or a guide? The lists on this site are open data in irl-commons. <a href="{COMMONS['suggest']}">Suggest it there</a>, or see <a href="data.html#commons">Data and standards</a>.</p>'''

LEGAL = [('legal-notice.html', 'Legal notice', 'en'), ('impressum.html', 'Impressum', 'de'), ('privacy.html', 'Privacy policy', 'en'), ('datenschutz.html', 'Datenschutz', 'de')]

STABLE_ANCHORS = {'index.html': ['commons', 'standing'], 'how-to-irl.html': ['start', 'more', 'one-phone', 'second-network', 'build', 'ready-made', 'cloud', 'hybrid', 'receiver', 'into-obs', 'satellite', 'sims', 'combine', 'all'], 'help.html': ['my-stack', 'start-here', 'guides', 'where-to-ask'], 'glossary.html': ['all-words'], 'roadmap.html': ['ideas', 'one-show', 'chain', 'screens', 'status'], 'standards.html': ['shared', 'app-formats', 'hardware-codecs', 'mine', 'compare-codecs', 'compare-transports'], 'open-standards.html': ['why', 'fit', 'around', 'comments', 'credits'], 'contribute.html': ['contact', 'commons', 'streamers', 'mods', 'helpers', 'production', 'makers', 'developers', 'listed'], 'data-plans.html': ['upload', 'data', 'small-print', 'use-rules', 'fact-sheet', 'maps', 'spot-check', 'abroad', 'calculator', 'overhead', 'units', 'eu-roaming', 'maker-data'], 'why-bonding.html': ['one-modem', 'best-case', 'shared-cell', 'moving', 'handover', 'priority', 'upload', 'how-it-helps', 'diversity', 'pieces', 'how-srtla-splits', 'add-up', 'freeze', 'limits', 'same-network', 'more-data', 'not-camera', 'heat-power', 'next-steps']}

UNLISTED_PAGES: set[str] = {'help-ideas.html'}

MOVED_PAGES = {'words.html': 'glossary.html', 'working-on.html': 'roadmap.html'}

APEX = False

APEX_KEEP_NOINDEX = UNLISTED_PAGES | set(MOVED_PAGES)

NEXT = False

LIVE_MOVED = dict(MOVED_PAGES)

SITE: str | None = None

def moved_nginx_problems() -> list[str]:
    conf = PREVIEW_NGINX.read_text(encoding='utf-8')
    problems = []
    for old, new in LIVE_MOVED.items():
        if not re.search(f'^\\s*/{re.escape(old)} /{re.escape(new)};$', conf, re.M):
            problems.append(f"preview-host/nginx.conf: no map line '/{old} /{new};' for a moved page")
        block = re.search(f'location = /{re.escape(old)} \\{{(.*?)(?=\\n\\s*(?:location|# moved pages: end))', conf, re.S)
        if not block or 'auth_basic_user_file' not in block.group(1) or '@moved' not in block.group(1):
            problems.append(f"preview-host/nginx.conf: no login-protected 'location = /{old}' sending to @moved")
    for old in re.findall('^\\s*/([\\w.-]+\\.html) /[\\w.-]+\\.html;$', conf, re.M):
        if old not in LIVE_MOVED:
            problems.append(f'preview-host/nginx.conf: map redirects /{old}, which is not in MOVED_PAGES')
    return problems

SOURCED_SECTIONS = {'data-plans.html': ['upload', 'data', 'small-print', 'use-rules', 'fact-sheet', 'maps', 'spot-check', 'abroad', 'eu-roaming', 'maker-data'], 'why-bonding.html': ['one-modem', 'how-it-helps', 'limits']}

NO_CARRIERS = {'data-plans.html', 'why-bonding.html'}

CARRIER = re.compile('\\b(?:Telekom|Vodafone|o2|O2|Telef[oó]nica|1&1|congstar|fraenk|ALDI|spusu|freenet|T-Mobile|AT&T|Verizon|Visible|Google Fi|US Mobile|Mint|Airalo|Holafly|Yesim|Kolet|Nomad|Ubigi|Saily|Sprint)\\b')

NO_PRICES = {'data-plans.html', 'why-bonding.html'}

PRICE = re.compile('[$€£]\\s?\\d|\\d\\s?(?:€|£|EUR\\b|USD\\b)|\\bper month\\b|/mo\\b', re.I)

# Pages on this site that explain a word further. Shown only inside the closed "More" disclosure.
WORD_LINKS = {'data-cap': ('How much data a stream uses', 'data-plans.html#data'), 'upload-speed': ('Why upload matters most', 'data-plans.html#upload'), 'bonding': ('Why more than one network?', 'why-bonding.html'), 'srtla': ('How bonding splits a stream', 'why-bonding.html#pieces')}

WORD_TEXT = {'en': {'also': 'Also called', 'more': 'More', 'about': 'about', 'all': 'All words', 'page': 'glossary.html'}}

def loc(w: dict, lang: str, key: str) -> str:
    if lang == 'en':
        return w.get(key, '')
    return w.get('l10n', {}).get(lang, {}).get(key, '')

def word_names(w: dict) -> list[str]:
    """Every name a reader might search for. Only `also_called` is ever shown as a name."""
    n = w.get('naming') or {}
    return [w['term'], *w.get('also_called', []), *w.get('search_terms', []), *([n['label']] if n else []), *([n['plural']] if n.get('plural') else []), *(a['term'] for a in n.get('alternatives', []))]

def words_entries(words: list[dict], lang: str) -> str:
    # The streamer glossary: the word, a plain explanation and its true synonyms. Further reading sits in a closed "More".
    t = WORD_TEXT[lang]
    names = {w['id']: loc(w, lang, 'term') for w in words}
    out = []
    for w in sorted(words, key=lambda w: names[w['id']].lower()):
        term = names[w['id']]
        plain = loc(w, lang, 'plain')
        rows = [f'<dd class="plain">{html.escape(plain, quote=False)}</dd>']
        if w.get('also_called'):
            rows.append(f"""<dd class="aka"><strong>{t['also']}:</strong> {html.escape(', '.join(w['also_called']), quote=False)}</dd>""")
        links = []
        if w['id'] in WORD_LINKS:
            label, href = WORD_LINKS[w['id']]
            links.append(f'<li><a href="{href}">{html.escape(label, quote=False)}</a></li>')
        links += [f'<li>{guide_link(g)}</li>' for g in guides_for('words', w['id'])]
        if links:
            # Closed by default: the main glossary stays word, explanation and "Also called".
            rows.append(f'''<dd class="word-more"><details id="{w['id']}-more"><summary>{t['more']}<span class="vh"> {t['about']} {html.escape(term, quote=False)}</span></summary><ul>{''.join(links)}</ul></details></dd>''')
        rows.append(f'<dd class="edit-line">{edit_icon("words", w["id"], term)}</dd>')
        hay = ' '.join([*word_names(w), plain]).lower()
        out.append(f'''        <div class="entry" id="{w['id']}" data-search="{html.escape(hay)}">\n          <dt data-word="{w['id']}">{html.escape(term, quote=False)}</dt>\n          ''' + '\n          '.join(rows) + '\n        </div>')
    return '\n'.join(out)

def words_toc(words: list[dict], lang: str) -> str:
    names = {w['id']: loc(w, lang, 'term') for w in words}
    items = [f'<li data-for="{i}"><a href="#{i}">{html.escape(n, quote=False)}</a></li>' for i, n in sorted(names.items(), key=lambda kv: kv[1].lower())]
    return '\n      '.join(items)

def words_core(words: list[dict]) -> str:
    rows = []
    for w in words:
        if w['tier'] != 'core':
            continue
        rows.append(f"""        <div><dt><a href="glossary.html#{w['id']}">{html.escape(w['term'], quote=False)}</a></dt><dd>{html.escape(w['plain'], quote=False)}</dd></div>""")
    return '      <dl class="words">\n' + '\n'.join(rows) + '\n      </dl>\n      <p class="more-words"><a href="glossary.html">All words in the glossary <span class="arrow" aria-hidden="true">→</span></a></p>'

# ---------- Words for app makers (irlcommons.org): the naming guide in irl-commons ----------
NAMING_STATUS = {'also-used': 'Also used', 'narrower': 'Narrower', 'technical': 'Technical', 'ambiguous': 'Ambiguous here'}
NAMING_CASE = {'sentence': 'Sentence case', 'proper': 'As a name', 'acronym': 'Capitals'}

def label_href(wid: str) -> str:
    from urllib.parse import urlencode
    return EDIT_FORM + urlencode({'template': 'edit-entry.yml', 'title': f'Label: words/{wid}', 'entry': f'words/{wid}'})

def naming_entry(w: dict, words: list[dict], services: list[dict]) -> str:
    e = lambda t: html.escape(t, quote=False)
    n = w['naming']
    service_names = {x['id']: x['name'] for x in services}
    by_id = {x['id']: x for x in words}
    wid = w['id']
    status = 'Draft' if n['status'] == 'draft' else 'Reviewed'
    facts = [('Glossary word', f'<a href="glossary.html#{wid}">{e(w["term"])}</a>')]
    if n.get('short_label'):
        facts.append(('Short form', e(n['short_label'])))
    if n.get('plural'):
        facts.append(('Plural', e(n['plural'])))
    facts.append(('Written', NAMING_CASE[n['case']]))
    rows = []
    for a in n['alternatives']:
        seen = ', '.join(service_names[x] for x in a.get('seen_in', [])) or '–'
        about = e(a.get('why', 'Means the same thing.'))
        if a.get('see'):
            target = by_id[a['see']]
            label = target.get('naming', {}).get('label', target['term'])
            about += f''' {e(a['term'])} usually means {e(target['plain'])} → <a href="glossary.html#{target['id']}">{e(label)}</a>'''
        rows.append(f'''<tr><th scope="row">{e(a['term'])}</th><td data-label="Status"><span class="nm-st nm-{a['status']}">{NAMING_STATUS[a['status']]}</span></td>'''
                    f'''<td data-label="About it">{about}</td><td data-label="Seen in"{' class="nm-empty"' if seen == '–' else ''}>{e(seen)}</td></tr>''')
    table = (f'''<table class="nm-table"><caption>Other names</caption><thead><tr><th scope="col">Name</th><th scope="col">Status</th>'''
             f'''<th scope="col">About it</th><th scope="col">Seen in</th></tr></thead><tbody>{''.join(rows)}</tbody></table>''') if rows else ''
    ev = []
    for x in n['evidence']:
        flag = ' <span class="nm-unv">Context only</span>' if x['support'] == 'context-only' else ''
        ev.append(f'''<li><strong>{e(service_names[x['service']])}</strong>{flag}: “{e(x['label'])}” — {e(x['note'])} <a href="{html.escape(x['url'])}">{e(short_url(x['url']))}</a> <span class="dated">Read {long_date(x['read_on'])}</span></li>''')
    summary = 'Where seen'
    evidence = fold(summary, f'<ul class="nm-ev">{"".join(ev)}</ul>', 'nm-evidence') if ev else '<p class="nm-none">No evidence yet.</p>'
    hay = ' '.join(word_names(w)).lower()
    return (f'''    <section class="part nm" id="{wid}" aria-labelledby="{wid}-h" data-search="{html.escape(hay)}">\n'''
            f'''      <h2 id="{wid}-h">{e(n['label'])} <span class="nm-badge nm-{n['status']}">{status}</span></h2>\n'''
            f'''      <p class="nm-scope"><span class="nm-k">Use it for</span> {e(n['scope'])}</p>\n'''
            f'''      <p class="nm-why">{e(n['why'])}</p>\n'''
            f'''      <dl class="std-facts nm-facts">{''.join(f'<div><dt>{k}</dt><dd>{v}</dd></div>' for k, v in facts)}</dl>\n'''
            f'''      {table}\n'''
            f'''      <p class="nm-tr"><span class="nm-k">Translating</span> {e(n['translation_note'])}</p>\n'''
            f'''      {evidence}\n'''
            f'''      <p class="nm-propose"><a href="{html.escape(label_href(wid))}">Propose a different label</a></p>\n    </section>''')

def fill_naming(body: str, words: list[dict], services: list[dict]) -> str:
    if '<!--naming:' not in body:
        return body
    named = sorted((w for w in words if w.get('naming')), key=lambda w: w['naming']['label'].lower())
    toc = '\n      '.join(f'''<li><a href="#{w['id']}">{html.escape(w['naming']['label'], quote=False)}</a></li>''' for w in named)
    return (body.replace('<!--naming:toc-->', toc).replace('<!--naming:entries-->', '\n\n'.join(naming_entry(w, words, services) for w in named))
            .replace('<!--naming:count-->', str(len(named))))

ANSWER_LINKS = {'feed-into-obs': ('Into OBS, step by step', 'how-to-irl.html#into-obs'), 'second-link-idle': ('Adding a second network', 'how-to-irl.html#second-network'), 'live-not-on-platform': ('Into OBS, step by step', 'how-to-irl.html#into-obs'), 'switcher-no-stats': ('Into OBS, step by step', 'how-to-irl.html#into-obs')}

DERIVED_CELLS = re.compile('^(The baseline: .+ compares? with it\\.|No published comparison listed\\.|Not listed for audio\\.)$')

def compare_problems(text: str) -> list[str]:
    out = []
    for anchor, prefix in (('compare-codecs', 'cc'), ('compare-transports', 'ct')):
        m = re.search(f'<section class="part cmp" id="{anchor}".*?</section>', text, re.S)
        if not m:
            out.append(f'standards.html: comparison table #{anchor} is missing')
            continue
        sec = m.group(0)
        notes = set(re.findall(f'<li id="({prefix}-\\d+)">', sec))
        for i, cell in enumerate(re.findall('<td>(.*?)</td>', sec, re.S)):
            refs = re.findall(f'href="#({prefix}-\\d+)"', cell)
            if not refs and (not DERIVED_CELLS.match(re.sub('<[^>]+>', '', cell).strip())):
                out.append(f'standards.html: #{anchor} cell {i + 1} has no source note')
            out += [f'standards.html: #{anchor} cell {i + 1} points at a missing note #{r}' for r in refs if r not in notes]
        for li in re.findall('<li id="[a-z]+-\\d+">(.*?)</li>', sec, re.S):
            if 'class="tip-src">Sources: <a href="https://' not in li or 'Checked ' not in li:
                out.append(f'standards.html: #{anchor}: a source note lacks a link or a checked date')
        if 'class="cmp-scroll"' not in sec:
            out.append(f'standards.html: #{anchor} must scroll inside its own box on phones')
    return out

def fold(summary: str, inner: str, cls: str='', fid: str='') -> str:
    c = f'more fold {cls}'.strip()
    i = f' id="{fid}"' if fid else ''
    return f'<details class="{c}"{i} open><summary>{summary}</summary>{inner}</details>'

def sources_fold(links: str, cls: str='') -> str:
    return fold('Sources', f'<p class="tip-src">{links}</p>', f'sources {cls}'.strip())

STANDARD_GROUPS = [('shared', 'shared', 'Shared across apps', 'Apps and services from different makers understand these.'), ('app-formats', 'app-formats', 'App formats', "One app's own format that a second app also reads or writes. Both are named."), ('hardware-codecs', 'hardware-codecs', 'Hardware and codecs', "How the picture and sound get compressed, and the cables a camera's picture comes in on."), ('steward-projects', 'mine', 'From IRL Commons', 'Drafts IRL Commons started. They are listed apart, so nobody takes them for standards already in use. <a href="open-standards.html">See the drafts</a>.')]

STANDARD_KIND = {'protocol': 'Protocol', 'format': 'Format', 'settings': 'Setup link or file', 'data': 'Data', 'codec': 'Codec', 'interface': 'Hardware interface'}

STANDARD_STATUS = {'in-use': 'In use', 'proposed': 'Proposed', 'idea': 'Idea'}

STANDARD_OPEN = {'open': 'Open', 'documented-closed': 'Closed, documented', 'undocumented': 'No written spec', 'not-public': 'Not public yet'}

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

STANDARD_IDS: list[str] = []

STANDARDS_SOURCED: list[str] = []

def long_date(day: str) -> str:
    y, m, d = (int(x) for x in day.split('-'))
    return f'{d} {MONTHS[m - 1]} {y}'

def short_url(url: str) -> str:
    host, _, path = re.sub('^https://(www\\.)?', '', url).split('#')[0].split('?')[0].partition('/')
    parts = [p for p in path.split('/') if p]
    return '/'.join([host, *parts[:2]]) + ('/…' if len(parts) > 2 else '')

def standard_plain(x: dict, words: dict[str, dict]) -> str:
    return words[x['word']]['plain'] if 'word' in x else x['description']

def standard_entry(x: dict, by_id: dict[str, dict], on_links: set[str], words: dict[str, dict]) -> str:
    e = lambda t: html.escape(t, quote=False)
    users, itself = standard_users(x, by_id, on_links)
    tags = [STANDARD_KIND[x['kind']], STANDARD_STATUS[x['status']], STANDARD_OPEN[x['openness']]]
    facts = x.get('codec') or x.get('transport')
    rows = [('Made by', e(x['maker']))]
    if x['licence']:
        rows.append(('Licence', e(x['licence'])))
    elif facts:
        rows.append(('Licence', e(facts['licensing']['text'])))
    if x['group'] == 'app-formats':
        rows.append(('App', users[0]))
        rows.append(('Also used by', ', '.join(users[1:])))
    elif users:
        rows.append(('Used by', ', '.join(users)))
    else:
        rows.append(('Used by', 'None named yet'))
    if itself:
        rows.append(('Listed', itself))
    if facts:
        table = ('compare-codecs', 'Codecs compared') if 'codec' in x else ('compare-transports', 'Ways to send a stream compared')
        rows.append(('More', f'<a href="#{table[0]}">{table[1]}</a>'))
    plain = e(standard_plain(x, words))
    if 'word' in x:
        plain += f""" <a class="std-word" href="glossary.html#{x['word']}">From the glossary</a>"""
    link = f'''Described at <a href="{html.escape(x['url'])}">{e(short_url(x['url']))}</a>''' if x['url'] else 'No public page yet'
    more = f"""\n          <p class="std-note">{e(x['notes'])}</p>""" if x['notes'] else ''
    if x['sources']:
        more += '\n          ' + sources_fold(' · '.join((f'''<a href="{html.escape(s['url'])}">{e(s['label'])}</a>''' for s in x['sources'])), 'std-src')
    hay = ' '.join([x['name'], standard_plain(x, words), x['maker'], *tags, *(by_id[r]['name'] for r in x['service_ids']), *x['other_users']]).lower()
    return f'''        <article class="std" id="{x['id']}" aria-labelledby="{x['id']}-h" data-search="{html.escape(hay)}">\n          <h3 id="{x['id']}-h">{e(x['name'])}</h3>\n          <p class="std-tags">''' + ''.join((f'<span class="tag">{t}</span>' for t in tags)) + f'</p>\n          <p class="plain">{plain}</p>\n          <dl class="std-facts">' + ''.join((f'<div><dt>{k}</dt><dd>{v}</dd></div>' for k, v in rows)) + f"""</dl>\n          <p class="std-foot">{link}<span class="dated">Checked {long_date(x['checked_on'])}</span> {edit_icon('standards', x['id'], x['name'])}</p>{more}\n        </article>"""

def fill_standards(body: str, standards: list[dict], services: list[dict], words: list[dict]) -> str:
    if '<!--standards:' not in body:
        return body
    words_by_id = {w['id']: w for w in words}
    by_id = {s['id']: s for s in services}
    on_links = {s['id'] for s in services if s['class'] in STREAMER_CLASSES}
    groups = [(g, a, h, sub, [x for x in standards if x['group'] == g]) for g, a, h, sub in STANDARD_GROUPS]
    toc = '\n      '.join((f'<li data-for="{a}"><a href="#{a}">{h} <span class="count">{len(xs)}</span></a></li>' for _, a, h, _, xs in groups if xs))
    parts = []
    for _, a, h, sub, xs in groups:
        if not xs:
            continue
        names = ''.join((f"""<li><a href="#{x['id']}">{html.escape(x['name'].split(' (')[0], quote=False)}</a></li>""" for x in xs))
        entries = '\n      <div class="std-list">\n' + '\n'.join((standard_entry(x, by_id, on_links, words_by_id) for x in xs)) + '\n      </div>\n      '
        parts.append(f'''    <section class="part std-group" id="{a}" aria-labelledby="{a}-h">\n      <h2 id="{a}-h">{h}</h2>\n      <p class="sum">{sub}</p>\n      <ul class="std-names" aria-label="In this group">{names}</ul>\n      {fold(f'All {len(xs)} entries, with details', entries, 'std-fold')}\n    </section>''')
    toc += ''.join((f'\n      <li><a href="#{a}">{h}</a></li>' for a, h, _ in COMPARE_TABLES))
    if any(s['class'] == 'building-block' for s in services):
        toc += '\n      <li data-for="building-blocks"><a href="#building-blocks">Building blocks</a></li>'
    return body.replace('<!--standards:toc-->', toc).replace('<!--standards:sections-->', '\n\n'.join(parts)).replace('<!--standards:compare-->', compare_tables(standards)).replace('<!--standards:count-->', str(len(standards)))

COMPARE_TABLES = [('compare-codecs', 'Codecs compared', 'codec'), ('compare-transports', 'Ways to send a stream compared', 'transport')]

SUPPORT = {'yes': 'Yes', 'some': 'Some', 'no': 'No', 'unknown': 'Unknown'}

FACT_LABELS = {'licensing': {'royalty-free': 'Royalty-free', 'patent-pools': 'Patent pools', 'open-spec': 'Open spec', 'open-code': 'Open code', 'proprietary': 'Proprietary'}, 'bonding': {'built-in': 'Built in', 'add-on': 'Add-on', 'no': 'No'}, 'latency': {'buffer': 'Buffer you set', 'real-time': 'Real-time', 'tcp': 'Follows TCP'}, 'loss_recovery': {'resend': 'Resends', 'resend-and-fec': 'Resends and FEC', 'tcp': 'TCP resends'}}

GEAR = [('ios', 'iPhone'), ('android', 'Android'), ('rk3588', 'RK3588'), ('intel', 'Intel'), ('nvidia', 'NVIDIA'), ('apple_mac', 'Mac')]

PLATFORMS = [('twitch', 'Twitch'), ('youtube', 'YouTube'), ('kick', 'Kick')]

CODEC_HEADERS = ['Codec', 'Licence and royalties', 'Efficiency', 'Hardware encode', 'Hardware decode', 'Twitch', 'YouTube', 'Kick']

TRANSPORT_HEADERS = ['Protocol', 'Can be bonded', 'Free to use or licence', 'Latency', 'Loss recovery', 'Twitch', 'YouTube', 'Kick']

UNVERIFIED = '<abbr class="unv" title="Not confirmed by the makers\' or platforms\' own pages">U</abbr>'

class Notes:
    """Numbered source notes under one table. A cell that shows its claim inline points at a note with the sources
    and the check date; a compact cell (Yes, No…) points at a note that also holds the claim. Equal notes share a number."""

    def __init__(self, prefix: str):
        self.prefix, self.items, self.index = (prefix, [], {})

    def ref(self, fact: dict, with_text: bool) -> str:
        key = json.dumps([fact['text'] if with_text else None, fact['sources'], fact['checked_on'], bool(fact.get('unverified'))])
        if key not in self.index:
            self.items.append((fact, with_text))
            self.index[key] = len(self.items)
        n = self.index[key]
        u = f' {UNVERIFIED}' if fact.get('unverified') else ''
        return f'<a class="fn" href="#{self.prefix}-{n}" aria-label="Source {n}">[{n}]</a>{u}'

    def html(self) -> str:
        e = lambda t: html.escape(t, quote=False)
        out = []
        for n, (fact, with_text) in enumerate(self.items, 1):
            text = ("Not confirmed by the makers' or platforms' own pages. " if fact.get('unverified') else '') + (e(fact['text']) + ' ' if with_text else '')
            src = ' · '.join((f'''<a href="{html.escape(s['url'])}">{e(s['label'])}</a>''' for s in fact['sources']))
            out.append(f'''<li id="{self.prefix}-{n}">{text}<span class="tip-src">Sources: {src}</span> <span class="dated">Checked {long_date(fact['checked_on'])}</span></li>''')
        return '<ol class="cmp-notes">' + ''.join(out) + '</ol>'

def compare_tables(standards: list[dict]) -> str:
    e = lambda t: html.escape(t, quote=False)

    def inline(notes: Notes, field: str, fact: dict) -> str:
        label = FACT_LABELS[field][fact['value']]
        text = re.sub(f'^{re.escape(label)}\\s*[:;,.]\\s*', '', fact['text'], flags=re.I)
        if text != fact['text'] and (not text.startswith('lib')):
            text = text[:1].upper() + text[1:]
        return f'<strong>{label}</strong> {e(text)} {notes.ref(fact, False)}'

    def compact(notes: Notes, value: str, fact: dict) -> str:
        return f'<strong>{SUPPORT[value]}</strong> {notes.ref(fact, True)}'

    def row_head(x: dict) -> str:
        return f"""<th scope="row"><a href="#{x['id']}">{e(x['name'].split(' (')[0])}</a></th>"""

    def table(anchor: str, title: str, lede: str, teaser: str, headers: list[str], rows: list[str], notes: Notes) -> str:
        head = ''.join((f'<th scope="col">{h}</th>' for h in headers))
        inner = f'\n      <p class="cmp-hint" aria-hidden="true">Scroll the table sideways to see every column. Each [number] leads to its source.</p>\n      <div class="cmp-scroll" role="region" aria-label="{title}, the table" tabindex="0">\n        <table class="cmp-table"><thead><tr>{head}</tr></thead><tbody>\n' + '\n'.join((f'          <tr>{r}</tr>' for r in rows)) + '\n        </tbody></table>\n      </div>\n      ' + fold(f'Sources for this table ({len(notes.items)} notes)', notes.html(), 'sources cmp-src') + '\n      '
        return f'''    <section class="part cmp" id="{anchor}" aria-labelledby="{anchor}-h">\n      <h2 id="{anchor}-h">{title}</h2>\n      <p class="sum">{lede}</p>\n      <p class="cmp-teaser">{teaser}</p>\n      {fold('Show the table', inner, 'cmp-fold')}\n    </section>'''

    def row_names(xs: list[dict]) -> str:
        ns = [f"""<a href="#{x['id']}">{e(x['name'].split(' (')[0])}</a>""" for x in xs]
        return ', '.join(ns[:-1]) + ' and ' + ns[-1]
    codecs = [x for x in standards if 'codec' in x]
    baselines = {r for x in codecs for r in (x['codec']['efficiency'] or {}).get('compared_with', [])}
    names = {x['id']: x['name'].split(' (')[0] for x in standards}
    cn, rows = (Notes('cc'), [])
    for x in sorted(codecs, key=lambda x: x['codec']['media'] != 'video'):
        c = x['codec']
        lic = inline(cn, 'licensing', c['licensing'])
        if c['efficiency']:
            eff = f"{e(c['efficiency']['text'])} {cn.ref(c['efficiency'], False)}"
        elif x['id'] in baselines:
            others = [names[y['id']] for y in codecs if x['id'] in (y['codec']['efficiency'] or {}).get('compared_with', [])]
            eff = f"The baseline: {e(' and '.join(others))} {('compare' if len(others) > 1 else 'compares')} with it."
        else:
            eff = 'No published comparison listed.'
        hw = []
        for side in ('encode', 'decode'):
            if c['hardware'] is None:
                hw.append('<td>Not listed for audio.</td>')
            else:
                hw.append('<td><ul class="cmp-gear">' + ''.join((f"<li><span>{label}</span> {compact(cn, c['hardware'][k][side], c['hardware'][k])}</li>" for k, label in GEAR)) + '</ul></td>')
        cells = [f'<td>{lic}</td>', f'<td>{eff}</td>', *hw, *(f"<td>{compact(cn, c['ingest'][k]['value'], c['ingest'][k])}</td>" for k, _ in PLATFORMS)]
        rows.append(row_head(x) + ''.join(cells))
    ordered = sorted(codecs, key=lambda x: x['codec']['media'] != 'video')
    out = [table('compare-codecs', 'Codecs compared', 'Video first, then sound. Hardware is what the chip or platform maker lists; a phone app may still fall back to software.', f'{row_names(ordered)}, side by side: licence and royalties, how much data they need for the same quality, which chips encode and decode them, and which platforms take them.', CODEC_HEADERS, rows, cn)]
    tn, rows = (Notes('ct'), [])
    for x in [x for x in standards if 'transport' in x]:
        t = x['transport']
        cells = [f'<td>{inline(tn, f, t[f])}</td>' for f in ('bonding', 'licensing', 'latency', 'loss_recovery')]
        cells += [f"<td>{compact(tn, t['ingest'][k]['value'], t['ingest'][k])}</td>" for k, _ in PLATFORMS]
        rows.append(row_head(x) + ''.join(cells))
    transports = [x for x in standards if 'transport' in x]
    out.append(table('compare-transports', 'Ways to send a stream compared', "How each protocol gets a stream from the phone or box to the next step. Where a platform doesn't take one, a receiver or production service turns it into RTMP.", f'{row_names(transports)}, side by side: whether they can be bonded, licence, delay, how they recover lost packets, and which platforms take them.', TRANSPORT_HEADERS, rows, tn))
    return '\n\n'.join(out)

WORDS_FOR_CHECK: list[dict] = []

GUIDES: list[dict] = []

GUIDE_GROUPS = [('camera', 'Camera into the sender'), ('sender', 'Sending from the phone or box'), ('connections', 'Connections and bonding'), ('receiver', 'Receivers'), ('obs', 'Into OBS'), ('platform', 'Going out to the platform')]

def guide_meta(g: dict, with_creator: bool=False) -> str:
    kind = 'video' if g['kind'] == 'video' else 'article'
    by = f" by {html.escape(g['creator'], quote=False)}" if with_creator else ''
    return f"""<span class="guide-meta">“{html.escape(g['title'], quote=False)}”, {kind}{by}</span>"""

def guide_link(g: dict) -> str:
    return f'''<a href="{html.escape(g['url'])}">{html.escape(g['title_display'], quote=False)}</a> {guide_meta(g, True)}'''

def guides_for(key: str, ident: str) -> list[dict]:
    return [g for g in GUIDES if ident in g[key]]

def guide_by(g: dict) -> str:
    others = [c for c in g['covers'] if c != g['publisher']]
    if g['publisher'] and (not others):
        return "Maker's own guide"
    if g['publisher']:
        return f"Guide by {SERVICES_BY_ID[g['publisher']]['name']}"
    return f"Guide by {g['creator']}"

PLATFORM_LABEL = {'ios': 'iPhone', 'android': 'Android'}

def channels(s: dict) -> list[dict]:
    return s['support'] + SITE_SUPPORT_EXTRA.get(s['id'], [])

def stack_keys(s: dict) -> list[str]:
    return s['covers'] if s['kind'] == 'community' else [s['id']]

def guide_count(sid: str) -> int:
    return sum((1 for g in GUIDES if sid in g['covers']))

def service_tags(s: dict) -> str:
    tags = []
    if s['status']:
        tags.append(s['status'][0].upper() + s['status'][1:])
    if s['licence']:
        tags.append(s['licence'])
    elif s['open_source'] is False:
        tags.append('Closed source')
    return ''.join((f' <span class="tag">{html.escape(x, quote=False)}</span>' for x in tags))

def service_line(s: dict, with_extra: bool=True) -> str:
    extra = ''
    url, links, home = (s['url'], s['links'], '')
    if NEXT and with_extra and (s['id'] in SITE_HOME):
        url, home = SITE_HOME[s['id']]
        links = [{'label': 'GitHub' if 'github.com/' in s['url'] else site_name(s['url']), 'url': s['url']}, *links]
    if with_extra and (links or home):
        extra = ' <span class="also">(' + (html.escape(home, quote=False) + '; ' if home else '') + ', '.join((f'''<a href="{html.escape(l['url'])}">{html.escape(l['label'], quote=False)}</a>''' for l in links)) + ')</span>'
    n = sum((1 for g in GUIDES if s['id'] in g['covers']))
    guides = f""" <a class="guides-n" href="help.html#for-{s['id']}">{n} guide{('s' if n != 1 else '')}</a>""" if with_extra and n else ''
    if NEXT and with_extra:
        chans = channels(s)
        if chans:
            guides += ' <span class="ask-line"><strong>Where to ask:</strong> ' + ' · '.join((f'''<a href="{html.escape(c['url'])}">{html.escape(c['label'], quote=False)}</a>''' for c in chans)) + '</span>'
    role = '' if with_extra else f""" <span class="tag">{ROLE_CHIP[s['role']]}</span>"""
    anchor = f''' id="{s['id']}"''' if with_extra else ''
    return f'''<li{anchor}><a href="{html.escape(url)}">{html.escape(s['name'], quote=False)}</a>{extra}: {html.escape(s['description'], quote=False)}{role}{service_tags(s)}{guides} {edit_icon('services', s['id'], s['name'])}</li>'''

SITE_SUPPORT_EXTRA = {'irlplus-cast': [{'label': 'IRL+ Discord', 'url': 'https://discord.gg/GCrKZNj5VA'}], 'irlplus-chat': [{'label': 'IRL+ Discord', 'url': 'https://discord.gg/GCrKZNj5VA'}], 'irl-pro': [{'label': 'IRL Pro Discord', 'url': 'https://discord.gg/irlpro'}], 'moblin': [{'label': 'Moblin Discord', 'url': 'https://discord.moblin.app'}], 'tvu-go': [{'label': 'TVU Go Discord', 'url': 'https://discord.com/invite/NYemJf98A5'}], 'belabox-cloud': [{'label': 'BELABOX Discord', 'url': 'https://discord.gg/hS8TcpsCKu'}], 'irlplus-bond': [{'label': 'IRL+ Discord', 'url': 'https://discord.gg/GCrKZNj5VA'}], 'belabox': [{'label': 'BELABOX Discord', 'url': 'https://discord.gg/hS8TcpsCKu'}], 'ceralive': [{'label': 'CeraLive Discord', 'url': 'https://discord.gg/Q2bvU49yx2'}], 'irlplus-store': [{'label': 'IRL+ Discord', 'url': 'https://discord.gg/GCrKZNj5VA'}], 'yolobox-ultra': [{'label': 'YoloLiv Discord', 'url': 'https://discord.gg/UtdFmhS3J5'}], 'irlplus-video-mixer': [{'label': 'IRL+ Discord', 'url': 'https://discord.gg/GCrKZNj5VA'}], 'irlhosting': [{'label': 'IRLhosting Discord', 'url': 'https://discord.gg/IRltools'}], 'irltoolkit': [{'label': 'IRLToolkit Discord', 'url': 'https://irltoolkit.com/discord'}], 'obs-studio': [{'label': 'OBS Discord', 'url': 'https://discord.gg/obsproject'}], 'streamer-bot': [{'label': 'Streamer.bot Discord', 'url': 'https://discord.streamer.bot'}]}

SITE_HOME = {'moblink': ('https://discord.gg/kh3KMng4JV', "on Moblin's Discord, in #tech-support-forum")}

ROLE_CHIP = {'streaming-app': 'Streaming app', 'extra-connections': 'Extra connection', 'camera-capture': 'Camera and capture', 'remote-control': 'Remote control', 'chat-overlays': 'Chat, alerts and overlays', 'other-app': 'Other app', 'relay': 'Receiver', 'hub': 'Hosted hub', 'production': 'Production and OBS', 'hardware': 'Hardware', 'community': 'Community and docs'}

PARTS = [('camera', 'Camera and mic', 'what you film and hear'), ('sender', 'Sender', 'the app or box that encodes and sends'), ('connections', 'Connections', 'mobile data, Wi-Fi, hotspots'), ('receiver', 'Receiver', 'joins bonded connections back together'), ('obs', 'OBS', 'your scenes, switching and BRB'), ('platform', 'Platform', 'Twitch, YouTube, Kick and the rest')]

PART_LABEL = {k: label for k, label, _ in PARTS}

SERVICES_BY_ID: dict[str, dict] = {}

def chain_html() -> str:
    items = '\n      '.join((f'<li class="link-{k}"><strong>{html.escape(label, quote=False)}</strong> <span>{html.escape(sub, quote=False)}</span></li>' for k, label, sub in PARTS))
    return f'<ol class="part-chain" aria-label="The chain, from camera to platform">\n      {items}\n    </ol>'

def ask_link(sid: str) -> str:
    s = SERVICES_BY_ID[sid]
    href = f'help.html#ask-{sid}' if s['support'] or SITE_SUPPORT_EXTRA.get(sid) else s['url']
    return f'''<a href="{html.escape(href)}">{html.escape(s['name'], quote=False)}</a>'''

def answers_html(answers: list[dict], words: list[dict]) -> tuple[str, str]:
    names = {w['id']: w['term'] for w in words}
    toc = '\n      '.join((f"""<li><a href="#{a['id']}">{html.escape(a['question'], quote=False)}</a></li>""" for a in answers))
    out = []
    for a in answers:

        def check(c: dict) -> str:
            tag = f"""<span class="chk-part">{html.escape(PART_LABEL[c['part']], quote=False)}</span> """ if c.get('part') else ''
            return f"<li>{tag}{html.escape(c['text'], quote=False)}</li>"
        checks = '\n          '.join((check(c) for c in a['checks']))
        wl = ', '.join((f'<a href="glossary.html#{w}">{html.escape(names[w], quote=False)}</a>' for w in a.get('words', [])))
        lines = [f'<p class="answer-words"><strong>Words:</strong> {wl}</p>'] if wl else []
        gs = guides_for('answers', a['id'])
        if gs:
            lines.append('<p class="answer-guides"><strong>Guides:</strong> ' + '; '.join((guide_link(g) for g in gs)) + '</p>')
        if a['services']:
            lines.append('<p class="answer-ask"><strong>Where to ask:</strong> ' + ' · '.join((ask_link(i) for i in a['services'])) + '</p>')
        if a['sources']:
            src = ', '.join((f'''<a href="{html.escape(s['url'])}">{html.escape(s['label'], quote=False)}</a>''' for s in a['sources']))
            lines.append(sources_fold(src, 'answer-sources'))
        if a['id'] in ANSWER_LINKS:
            label, href = ANSWER_LINKS[a['id']]
            lines.append(f'<p class="more"><a href="{html.escape(href)}">{html.escape(label, quote=False)} <span class="arrow" aria-hidden="true">→</span></a></p>')
        extra = ''.join(('\n        ' + x for x in lines))
        out.append(f'''      <section class="answer" id="{a['id']}" aria-labelledby="{a['id']}-h">\n        <h2 id="{a['id']}-h">{html.escape(a['question'], quote=False)}</h2>\n        <p class="sum">{html.escape(a['summary'], quote=False)}</p>\n        <ol class="checklist">\n          {checks}\n        </ol>{extra}\n        <p class="send">Link to send: <a href="#{a['id']}">checks.html<wbr>#{a['id']}</a></p>\n      </section>''')
    return (toc, '\n'.join(out))

LANGUAGE_NAME = {'en': 'English', 'de': 'German', 'es': 'Spanish', 'fr': 'French', 'pt': 'Portuguese', 'ja': 'Japanese'}

GUIDE_THUMBS: dict[str, dict] = {}

def site_name(url: str) -> str:
    host = re.sub('^https://', '', url).split('/')[0]
    return host[4:] if host.startswith('www.') else host

def guides_in_order(guides: list[dict]) -> list[dict]:
    order = {k: i for i, (k, _, _) in enumerate(PARTS)}
    return sorted(guides, key=lambda g: (order[g['part'][0]], g['title_display'].lower()))

def fill_words(body: str, words: list[dict], answers: list[dict] | None=None) -> str:
    if answers is not None and '<!--answers:' in body:
        toc, entries = answers_html(answers, words)
        body = body.replace('<!--answers:toc-->', toc).replace('<!--answers:entries-->', entries).replace('<!--answers:chain-->', chain_html())
    body = body.replace('<!--words:core-->', words_core(words))
    for lang in WORD_TEXT:
        body = body.replace(f'<!--words:entries:{lang}-->', words_entries(words, lang))
        body = body.replace(f'<!--words:toc:{lang}-->', words_toc(words, lang))
    return body

ALLOWED_SCRIPTS = {'assets/site.js'}

class Collector(HTMLParser):

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.hrefs: list[str] = []
        self.problems: list[str] = []
        self.robots = False
        self.h1 = 0
        self.mains = 0
        self.current_nav = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'script':
            if not (a.get('src') in ALLOWED_SCRIPTS and set(a) <= {'src', 'defer'}):
                self.problems.append('<script> is allowed only as a first-party file from ALLOWED_SCRIPTS')
        elif tag == 'form':
            if set(a) - {'class', 'id', 'aria-label'}:
                self.problems.append('<form> may not send anywhere (no action, method or target)')
        elif tag == 'img':
            src = a.get('src') or ''
            if re.match('^(?:[a-z]+:|//)', src, re.I):
                self.problems.append(f'''<img src="{src[:60]}"> must be a file of this site (CSP img-src 'self')''')
            for need in ('alt', 'width', 'height'):
                if need not in a:
                    self.problems.append(f'<img src="{src[:60]}"> needs {need}')
            if a.get('loading') != 'lazy':
                self.problems.append(f'<img src="{src[:60]}"> needs loading="lazy"')
        elif tag in ('style', 'iframe', 'object', 'embed'):
            self.problems.append(f'<{tag}> is not allowed')
        if 'style' in a:
            self.problems.append(f'inline style on <{tag}>')
        if any((k.startswith('on') for k in a)):
            self.problems.append(f'event handler on <{tag}>')
        if 'id' in a:
            self.ids.append(a['id'])
        for key in ('href', 'src'):
            if key in a and a[key] is not None:
                self.hrefs.append(a[key])
        if tag == 'meta' and a.get('name') == 'robots' and ('noindex' in (a.get('content') or '')):
            self.robots = True
        if tag == 'h1':
            self.h1 += 1
        if tag == 'main':
            self.mains += 1

class SourceLines(HTMLParser):
    """Which of the wanted element ids contain a "Sources:" line (span.tip-src) or a Sources disclosure
    (details.sources, whose summary starts "Sources") with at least one link."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self, wanted: list[str]) -> None:
        super().__init__(convert_charrefs=True)
        self.wanted = set(wanted)
        self.stack: list[str | None] = []
        self.sourced: set[str] = set()
        self.src_depth = 0
        self.src_text = ''
        self.src_links = 0
        self.src_lead = 'Sources:'

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.src_depth and tag == 'a':
            self.src_links += 1
        if tag in self.VOID:
            return
        self.stack.append(a.get('id') if a.get('id') in self.wanted else None)
        classes = (a.get('class') or '').split()
        if (tag == 'span' and 'tip-src' in classes or (tag == 'details' and 'sources' in classes)) and (not self.src_depth):
            self.src_depth, self.src_text, self.src_links = (len(self.stack), '', 0)
            self.src_lead = 'Sources' if tag == 'details' else 'Sources:'

    def handle_data(self, data):
        if self.src_depth:
            self.src_text += data

    def handle_endtag(self, tag):
        if tag in self.VOID or not self.stack:
            return
        if self.src_depth == len(self.stack):
            if self.src_text.strip().startswith(self.src_lead) and self.src_links:
                self.sourced.update((i for i in self.stack if i))
            self.src_depth = 0
        self.stack.pop()

PERMALINK_LABEL = 'Link to this section: '

class HeadingScan(HTMLParser):
    """Every h2 and h3 with an id, and marked glossary terms, for the section links ("#" after the heading text).

    For each heading: where its closing tag starts, the link target (the id of the enclosing
    element that the heading labels via aria-labelledby, so links stay #upload rather than
    #upload-h; otherwise the heading's own id), its text, whether it is left out (visually
    hidden, or data-permalink="no" for headings that only make sense with My stack picks),
    and the section links found inside it. Links outside any linked heading are listed too."""
    VOID = SourceLines.VOID
    SKIP_TEXT = {'vh', 'soon-tag', 'permalink'}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, str | None, str | None]] = []
        self.headings: list[dict] = []
        self.cur: dict | None = None
        self.skip_depth = 0
        self.stray: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = (a.get('class') or '').split()
        if tag == 'a' and 'permalink' in classes:
            if self.cur is not None and (not self.cur['excluded']):
                self.cur['links'].append((a.get('href'), a.get('aria-label') or ''))
            else:
                self.stray.append(a.get('href') or '')
        if (tag in ('h2', 'h3') and a.get('id')) or (tag == 'dt' and a.get('data-word')):
            hid = a.get('id') or a['data-word']
            target = next((i for _, i, lab in reversed(self.stack) if i and lab == hid), hid)
            self.cur = {'tag': tag, 'id': hid, 'target': target, 'text': '', 'links': [], 'end': None, 'excluded': 'vh' in classes or a.get('data-permalink') == 'no'}
        if tag in self.VOID:
            return
        self.stack.append((tag, a.get('id'), a.get('aria-labelledby')))
        if self.cur is not None and (self.skip_depth or self.SKIP_TEXT & set(classes)):
            self.skip_depth += 1

    def handle_data(self, data):
        if self.cur is not None and (not self.skip_depth):
            self.cur['text'] += data

    def handle_endtag(self, tag):
        if tag in self.VOID or not self.stack:
            return
        if self.skip_depth:
            self.skip_depth -= 1
        if self.cur is not None and tag == self.cur['tag']:
            self.cur['end'] = self.getpos()
            self.cur['text'] = ' '.join(self.cur['text'].split())
            self.headings.append(self.cur)
            self.cur = None
        self.stack.pop()

def add_permalinks(body: str) -> str:
    scan = HeadingScan()
    scan.feed(body)
    scan.close()
    line_starts = [0]
    for line in body.splitlines(keepends=True):
        line_starts.append(line_starts[-1] + len(line))
    out, last = ([], 0)
    for h in scan.headings:
        if h['excluded'] or h['links']:
            continue
        pos = line_starts[h['end'][0] - 1] + h['end'][1]
        label = html.escape(('Link to ' if h['tag'] == 'dt' else PERMALINK_LABEL) + h['text'])
        out.append(body[last:pos].rstrip())
        out.append(f'''&nbsp;<a class="permalink" href="#{h['target']}" aria-label="{label}">#</a>''')
        last = pos
    out.append(body[last:])
    return ''.join(out)

def permalink_problems(name: str, text: str) -> list[str]:
    scan = HeadingScan()
    scan.feed(text)
    scan.close()
    found = []
    targets = []
    for h in scan.headings:
        if h['excluded']:
            continue
        if len(h['links']) != 1:
            found.append(f"{name}: heading #{h['id']} has {len(h['links'])} section links (needs exactly one)")
            continue
        href, label = h['links'][0]
        if href != f"#{h['target']}":
            found.append(f"{name}: heading #{h['id']}: section link goes to {href}, expected #{h['target']}")
        if label != ('Link to ' if h['tag'] == 'dt' else PERMALINK_LABEL) + h['text'] or not h['text']:
            found.append(f"{name}: heading #{h['id']}: section link label {label!r} doesn't match the heading")
        targets.append(href)
    for href in scan.stray:
        found.append(f'{name}: section link {href} outside a linked heading')
    for dup in sorted({t for t in targets if targets.count(t) > 1}):
        found.append(f'{name}: two section links to {dup}')
    return found

def calc_table_html(m: dict) -> str:
    t = m['table']
    head = ''.join((f'<th scope="col">{h} h</th>' for h in t['hours']))
    rows = []
    for v in t['video_mbps']:
        for i, mode in enumerate(('single', 'bonded')):
            sizes = [datause.fmt_size(datause.data_use(m, h, v, t['audio_kbps'], mode, t['links'], t['loss_pct'])['total'], m) for h in t['hours']]
            if not all((x.endswith(' GB') for x in sizes)):
                raise SystemExit('data-use table: every cell must be in GB (the unit is in the caption)')
            cells = ''.join((f'<td data-video="{v}" data-hours="{h}" data-mode="{mode}">{x[:-3]}</td>' for h, x in zip(t['hours'], sizes)))
            lead = f'<th scope="row" rowspan="2">{v} Mbit/s</th>' if i == 0 else ''
            how = 'One connection' if mode == 'single' else f"Bonded, {t['links']} links"
            rows.append(f'<tr>{lead}<td>{how}</td>{cells}</tr>')
    return f"""<table class="plans-table calc-table" id="data-table">\n          <caption>GB for a whole stream, upload and download together, with {t['audio_kbps']} kbit/s audio and {t['loss_pct']} % loss</caption>\n          <thead><tr><th scope="col">Video</th><th scope="col">Sent over</th>{head}</tr></thead>\n          <tbody>\n            """ + '\n            '.join(rows) + '\n          </tbody>\n        </table>'

def calc_ui_html(m: dict) -> str:
    d, lim = (m['defaults'], m['limits'])
    model = html.escape(json.dumps({k: v for k, v in m.items() if k != 'about'}, separators=(',', ':'), ensure_ascii=False))
    modes = [('single', 'One connection', 'the whole stream over one network'), ('bonded', 'Bonded (SRTLA)', 'the stream is split over your links'), ('redundant', 'Redundant', 'every link sends every packet, as in Speedify’s Redundant Mode')]
    radios = '\n'.join((f'''            <p class="calc-radio"><input type="radio" name="calc-mode" id="calc-mode-{k}" value="{k}"{(' checked' if k == d['mode'] else '')}><label for="calc-mode-{k}"><strong>{label}</strong> <span>{hint}</span></label></p>''' for k, label, hint in modes))
    parts = [('media', 'Video and audio', 'your bitrates × time ÷ 8 bits per byte'), ('packing', 'Packing (MPEG-TS)', '4 bytes in every 188, plus about 64 kbit/s'), ('headers', 'Packet headers', '44 bytes per 1,316 bytes of stream'), ('resends', 'Resent packets', 'SRT sends lost packets again'), ('control', 'Replies', 'acknowledgements and loss reports, both ways'), ('keepalives', 'Keepalives', 'SRTLA, once a second per link')]
    rows = '\n'.join((f'              <tr id="calc-row-{k}"><th scope="row">+ {label} <span>{how}</span></th><td id="calc-part-{k}"></td></tr>'.replace('+ Video', 'Video') for k, label, how in parts))
    return f'''<div class="calc" id="calc" data-model="{model}" hidden>\n          <form class="calc-form" id="calc-form" aria-label="Data calculator">\n            <div class="calc-grid">\n              <p class="calc-field"><label for="calc-dur">Stream length</label><span class="calc-in"><input type="text" id="calc-dur" inputmode="decimal" autocomplete="off" value="{d['hours']:g}" size="5"><select id="calc-dur-unit" aria-label="Unit for stream length"><option value="h" selected>hours</option><option value="min">minutes</option></select></span></p>\n              <p class="calc-field"><label for="calc-video">Video bitrate</label><span class="calc-in"><input type="text" id="calc-video" inputmode="decimal" autocomplete="off" value="{d['video_mbps']:g}" size="5"><span class="calc-unit" aria-hidden="true">Mbit/s</span></span></p>\n              <p class="calc-field"><label for="calc-audio">Audio bitrate</label><span class="calc-in"><input type="text" id="calc-audio" inputmode="decimal" autocomplete="off" value="{d['audio_kbps']:g}" size="5"><span class="calc-unit" aria-hidden="true">kbit/s</span></span></p>\n            </div>\n            <fieldset class="calc-modes">\n              <legend>How you send it</legend>\n{radios}\n            </fieldset>\n            <div class="calc-grid">\n              <p class="calc-field" id="calc-links-row"><label for="calc-links">Links</label><span class="calc-in"><input type="text" id="calc-links" inputmode="numeric" autocomplete="off" value="{d['links']}" size="3"><span class="calc-unit" aria-hidden="true">{lim['links_min']}–{lim['links_max']}</span></span></p>\n              <p class="calc-field"><label for="calc-loss">Packet loss</label><span class="calc-in"><input type="text" id="calc-loss" inputmode="decimal" autocomplete="off" value="{d['loss_pct']:g}" size="3" aria-describedby="calc-loss-hint"><span class="calc-unit" aria-hidden="true">%</span></span></p>\n            </div>\n            <p class="calc-hint" id="calc-loss-hint">SRT sends every lost packet again while there's still time within its latency setting. {d['loss_pct']:g} % is only an example. Your app's statistics show your own loss.</p>\n            <p class="calc-check"><input type="checkbox" id="calc-rec"><label for="calc-rec">Also record on the phone or box</label></p>\n            <p class="calc-field" id="calc-rec-row" hidden><label for="calc-rec-video">Recording video bitrate <span class="calc-opt">if it differs</span></label><span class="calc-in"><input type="text" id="calc-rec-video" inputmode="decimal" autocomplete="off" size="5" placeholder="{d['video_mbps']:g}"><span class="calc-unit" aria-hidden="true">Mbit/s</span></span></p>\n          </form>\n          <div class="calc-out" id="calc-out">\n            <p class="calc-total"><span class="calc-big" id="calc-total"></span> <span id="calc-total-what">of mobile data</span></p>\n            <p class="calc-line" id="calc-per-link"></p>\n            <p class="calc-line" id="calc-dir"></p>\n            <p class="calc-line" id="calc-rec-out" hidden></p>\n            <p class="calc-error" id="calc-error" hidden></p>\n            <p class="vh" id="calc-status" role="status"></p>\n            <details class="more fold calc-more" id="arithmetic" open><summary>The arithmetic</summary>\n            <table class="calc-math" id="calc-math">\n              <caption class="vh">The arithmetic</caption>\n              <tbody>\n{rows}\n              <tr class="calc-sum"><th scope="row">= Data used</th><td id="calc-part-total"></td></tr>\n              </tbody>\n            </table>\n            </details>\n          </div>\n        </div>\n        <p class="calc-nojs" id="calc-nojs">The calculator needs JavaScript. The table above has common cases.</p>'''

def fill_calc(body: str, m: dict) -> str:
    return body.replace('<!--calc:table-->', calc_table_html(m)).replace('<!--calc:ui-->', calc_ui_html(m))

KICKER_BEFORE_HEADING = re.compile('<(p|span|div|small)\\b[^>]*\\bclass="[^"]*\\b(label|kicker|eyebrow)\\b[^"]*"[^>]*>(?:(?!</\\1>).){0,300}</\\1>\\s*(?:<h[1-6]\\b|<p\\b[^>]*\\bclass="[^"]*\\b(?:lede|mission-line|sum)\\b)', re.S)

HEADING_AS_KICKER = re.compile('<h[1-6]\\b[^>]*\\bclass="[^"]*\\b(label|kicker|eyebrow)\\b', re.S)

def kicker_problems(name: str, text: str) -> list[str]:
    found = []
    for m in KICKER_BEFORE_HEADING.finditer(text):
        snippet = re.sub('<[^>]+>', '', m.group(0))[:60].strip()
        found.append(f'{name}: kicker line above a heading: {snippet!r}')
    for m in HEADING_AS_KICKER.finditer(text):
        found.append(f'{name}: heading styled as a kicker label')
    return found

def check(pages: dict[str, str]) -> list[str]:
    problems: list[str] = []
    for name, text in pages.items():
        problems += kicker_problems(name, text)
        problems += permalink_problems(name, text)
        if 'what-fits' in text:
            problems.append(f'{name}: leftover reference to what-fits (renamed to how-to-irl.html)')
        for tag in re.findall('<details\\b[^>]*\\bclass="[^"]*\\bfold\\b[^"]*"[^>]*>', text):
            if not re.search('\\sopen(?=[\\s>])', tag):
                problems.append(f'{name}: a disclosure (details.fold) must be open in the HTML; site.js closes it')
        if text.count('<details') != text.count('<summary>') + text.count('<summary '):
            problems.append(f'{name}: every <details> needs a <summary>')
        for body in re.findall('<script\\b[^>]*>(.*?)</script>', text, re.S | re.I):
            if body.strip():
                problems.append(f'{name}: inline script content is not allowed')
    parsed: dict[str, Collector] = {}
    for name, text in pages.items():
        c = Collector()
        c.feed(text)
        parsed[name] = c
        for anchor in STABLE_ANCHORS.get(name, []) + ([w['id'] for w in WORDS_FOR_CHECK] if name == 'glossary.html' else []) + (STANDARD_IDS if name == 'standards.html' else []):
            if anchor not in c.ids:
                problems.append(f'{name}: stable anchor #{anchor} is missing (outreach templates link to it)')
        for p in c.problems:
            problems.append(f'{name}: {p}')
        if (APEX or SITE) and name not in APEX_KEEP_NOINDEX:
            if c.robots:
                problems.append(f"{name}: robots noindex in the {('apex' if APEX else SITE)} build (only moved and unlisted pages keep it)")
        elif not c.robots:
            problems.append(f'{name}: robots noindex missing')
        if c.h1 != 1:
            problems.append(f'{name}: {c.h1} h1 elements')
        if c.mains != 1:
            problems.append(f'{name}: {c.mains} main elements')
        dupes = {i for i in c.ids if c.ids.count(i) > 1}
        if dupes:
            problems.append(f'{name}: duplicate ids {sorted(dupes)}')
    for name, ids in {**SOURCED_SECTIONS, 'standards.html': STANDARDS_SOURCED}.items():
        if name not in pages:
            continue
        s = SourceLines(ids)
        s.feed(pages[name])
        for missing in [i for i in ids if i not in s.sourced]:
            problems.append(f'{name}: section #{missing} has no Sources line (span.tip-src with a link)')
    if 'standards.html' in pages:
        problems += compare_problems(pages['standards.html'])
    for name in NO_CARRIERS & pages.keys():
        main_text = html.unescape(re.sub('<[^>]+>', ' ', pages[name].split('<main id="main"', 1)[-1].split('</main>', 1)[0]))
        for m in CARRIER.finditer(main_text):
            problems.append(f'{name}: names a carrier or seller ({m.group(0)!r}); this page is a guideline without examples')
    for name in NO_PRICES & pages.keys():
        main_text = pages[name].split('<main id="main"', 1)[-1].split('</main>', 1)[0]
        for m in PRICE.finditer(re.sub('<[^>]+>', ' ', main_text)):
            problems.append(f'{name}: looks like a price ({m.group(0)!r}); plan prices stay off this page')
    for href in [h for _, h, _ in NAV + FOOT_PAGES]:
        if href in UNLISTED_PAGES:
            problems.append(f'{href}: unlisted page is in the nav or footer')
    problems += moved_nginx_problems()
    for old, new in MOVED_PAGES.items():
        if old not in pages:
            problems.append(f'{old}: moved page is missing (old links to it must keep working)')
        elif f'data-moved="{new}"' not in pages[old] or f'url={new}"' not in pages[old]:
            problems.append(f"{old}: must send visitors on to {new} (metadata 'moved: {new}')")
    for name, c in parsed.items():
        for href in c.hrefs:
            target = href.partition('#')[0]
            if target in MOVED_PAGES and target != name:
                problems.append(f'{name}: links to {target}, which moved to {MOVED_PAGES[target]}')
    for href in [h for _, h, _ in NAV + FOOT_PAGES]:
        if href in MOVED_PAGES:
            problems.append(f'{href}: moved page is in the nav or footer')
    in_footer = {h for _, h, _ in FOOT_PAGES} | {h for h, _, _ in LEGAL}
    for name in pages:
        if name not in MOVED_PAGES and name not in UNLISTED_PAGES and (name not in in_footer):
            problems.append(f"{name}: not in the footer's page list (FOOT_GROUPS); every page must be findable there")
    for name, c in parsed.items():
        for href in c.hrefs:
            target = href.partition('#')[0]
            if target in UNLISTED_PAGES and target != name:
                problems.append(f"{name}: links to the unlisted page {target} (it stays unlinked until it's published)")
    for name, c in parsed.items():
        for href in c.hrefs:
            if re.match('^(https?:|mailto:|tel:)', href):
                if href.startswith('http:'):
                    problems.append(f'{name}: plain http link {href}')
                continue
            path, _, frag = href.partition('#')
            target = name if path == '' else path
            if target not in parsed:
                if not (OUT / target).is_file():
                    problems.append(f'{name}: broken link {href}')
                continue
            if frag and frag not in parsed[target].ids:
                problems.append(f'{name}: missing anchor {href}')
    return problems
NEXT = True

# ---------- Edit links (shared 1.1) ----------
# One tiny pencil per data entry, inside the entry so it hides with it, labelled for screen readers.
EDIT_FORM = 'https://github.com/irl-commons/irl-commons/issues/new?'

def edit_href(dataset: str, ident: str) -> str:
    from urllib.parse import urlencode
    return EDIT_FORM + urlencode({'template': 'edit-entry.yml', 'title': f'Edit: {dataset}/{ident}', 'entry': f'{dataset}/{ident}'})

def edit_icon(dataset: str, ident: str, name: str) -> str:
    label = html.escape(f'Suggest an edit to {name}')
    return (f'<a class="edit" href="{html.escape(edit_href(dataset, ident))}" title="{label}">'
            f'<svg aria-hidden="true"><use href="#i-edit"/></svg><span class="vh">{label}</span></a>')

# ---------- Apps and services: one overview per class ----------
# (class, anchor, heading, what it is for). Building blocks and docs are not on the streamer site.
CLASS_SECTIONS = [
    ('phone-app', 'phone-apps', 'Phone streaming apps', 'The app on your phone that films and sends your stream.'),
    ('helper-app', 'helper-apps', 'Helper apps', 'Small apps around the stream: chat, sharing your location, remote control, a camera into the phone.'),
    ('connections', 'connections', 'More connections', 'Add another network to your stream, so one weak signal doesn’t end it.'),
    ('bonding', 'bonding', 'Bonding and receivers', 'A bonded stream leaves over several connections. A receiver joins it back together and passes it on to OBS or the platform.'),
    ('hardware', 'hardware', 'Backpacks and encoders', 'A box that encodes and sends over several modems, and takes a standalone camera. Ready-made, or a kit you build.'),
    ('parts', 'parts', 'Parts and add-ons', 'Extras for a box or backpack you already have.'),
    ('store', 'stores', 'Shops', 'Where to buy built backpacks, cases and parts.'),
    ('cloud', 'cloud', 'Cloud production', 'OBS and its tools running on a server for you, so your stream doesn’t depend on your home PC and internet.'),
    ('production', 'production', 'OBS and tools on your computer', 'Scenes, switching and BRB on your own PC, and the tools that plug into OBS.'),
]
HOSTING_GROUPS = [('self', 'host-self', 'Host it yourself', 'Software you run on your own server or computer.'),
                  ('service', 'host-service', 'Services', 'Someone runs it for you, paid or free.')]
CLASS_ANCHOR = {c: a for c, a, _, _ in CLASS_SECTIONS}
STREAMER_CLASSES = set(CLASS_ANCHOR)
# Platform filters: (anchor key, label, platforms that count).
RUNS_ON = [('android', 'Android', {'android'}), ('ios', 'iPhone', {'ios'}), ('desktop', 'Computer', {'windows', 'macos', 'linux'}),
           ('hardware', 'Hardware', {'hardware'}), ('online', 'Online', {'web', 'service'})]
PLATFORM_NAME = {'android': 'Android', 'ios': 'iPhone', 'windows': 'Windows', 'macos': 'Mac', 'linux': 'Linux', 'web': 'Browser',
                 'hardware': 'Hardware', 'service': 'Online service'}
PLATFORM_ORDER = list(PLATFORM_NAME)
PARTS_LISTS = ('belabox-wiki', 'ceralive-docs')  # community docs that keep parts lists; named in the parts overview

def first_sentence(text: str) -> tuple[str, str]:
    parts = re.split(r'(?:(?<=[.!?])|(?<=[.!?]["”]))\s+(?=["“A-Z])', text.strip(), maxsplit=1)
    return (parts[0], parts[1] if len(parts) > 1 else '')

def runs_on(s: dict) -> list[str]:
    return [k for k, _, ps in RUNS_ON if ps & set(s['platforms'])]

def service_entry(s: dict) -> str:
    """Name (linked to the official site), what it runs on, what it does in one line; Details only for the rest
    of the description, where to ask and guides. No licence, maker or other technical facts."""
    esc = lambda t: html.escape(t, quote=False)
    url = SITE_HOME[s['id']][0] if s['id'] in SITE_HOME else s['url']
    lead, rest = first_sentence(s['description'])
    plats = ' · '.join(PLATFORM_NAME[p] for p in sorted(s['platforms'], key=PLATFORM_ORDER.index))
    more = []
    if rest:
        more.append(f'<p>{esc(rest)}</p>')
    chans = channels(s)
    if chans:
        more.append('<p><strong>Where to ask:</strong> ' + ' · '.join(f'<a href="{html.escape(c["url"])}">{esc(c["label"])}</a>' for c in chans) + '</p>')
    n = guide_count(s['id'])
    if n:
        more.append(f'<p><a href="help.html#for-{s["id"]}">{n} guide{"s" if n != 1 else ""} in Help</a></p>')
    edit = edit_icon('services', s['id'], s['name'])
    tag = f' <span class="tag">{esc(s["status"][0].upper() + s["status"][1:])}</span>' if s['status'] else ''
    head = (f'<li class="svc" id="{s["id"]}" data-on="{" ".join(runs_on(s))}">'
            f'<p class="svc-head"><a class="svc-name" href="{html.escape(url)}">{esc(s["name"])}</a>{tag} <span class="svc-plat">{plats}</span></p>')
    if not more:
        return head + f'<p class="svc-what">{esc(lead)} {edit}</p></li>'
    return (head + f'<p class="svc-what">{esc(lead)}</p>'
            f'<details class="svc-more"><summary>More<span class="vh"> about {esc(s["name"])}</span></summary>{"".join(more)}<p class="edit-line">{edit}</p></details></li>')

def class_entries(items: list[dict]) -> str:
    return '      <ul class="svcs">\n        ' + '\n        '.join(service_entry(s) for s in items) + '\n      </ul>\n'

def by_name(items) -> list[dict]:
    return sorted(items, key=lambda s: re.sub('[^a-z0-9 ]', '', s['name'].lower()))

def fill_services(body: str, services: list[dict]) -> str:
    by_id = {s['id']: s for s in services}
    of = lambda c: by_name(s for s in services if s['class'] == c)
    sections = [x for x in CLASS_SECTIONS if of(x[0])]
    toc = '\n      '.join(f'<li data-for="{a}"><a href="#{a}">{h} <span class="count">{len(of(c))}</span></a></li>' for c, a, h, _ in sections)
    parts = []
    for c, a, h, sub in sections:
        inner = ''
        if c == 'bonding':
            for hk, ha, hh, hsub in HOSTING_GROUPS:
                items = [s for s in of(c) if s['hosting'] == hk]
                if items:
                    inner += f'      <div class="host-group" id="{ha}">\n      <h3 id="{ha}-h">{hh} <span class="count">{len(items)}</span></h3>\n      <p class="sum">{hsub}</p>\n' + class_entries(items) + '      </div>\n'
        else:
            inner = class_entries(of(c))
        after = ''
        if c == 'parts':
            docs = [by_id[i] for i in PARTS_LISTS if i in by_id]
            if docs:
                after = '      <p class="meta">Which modems, power banks and audio devices work: ' + ' and '.join(f'<a href="{html.escape(d["url"])}">{html.escape(d["name"], quote=False)}</a>' for d in docs) + ' keep lists.</p>\n'
        if c == 'connections':
            after = '      <p class="meta">Each connection needs its own SIM or data plan: see <a href="data-plans.html">Data plans and SIMs</a>.</p>\n'
        parts.append(f'    <section class="part cls" id="{a}" aria-labelledby="{a}-h">\n      <h2 id="{a}-h">{h}</h2>\n      <p class="sum">{sub}</p>\n{inner}{after}    </section>')
    marks = ''.join(f'<span class="on-mark" id="on-{k}"></span>' for k, _, _ in RUNS_ON)
    counts = {k: sum(1 for s in services if s['class'] in STREAMER_CLASSES and k in runs_on(s)) for k, _, _ in RUNS_ON}
    total = sum(1 for s in services if s['class'] in STREAMER_CLASSES)
    filt = (f'    <div class="on-marks">{marks}</div>\n    <nav class="on-filter" aria-label="Show what runs on">\n      <p class="fh">Runs on</p>\n      <ul>'
            f'<li><a href="#apps" class="on-all">All <span class="n">{total}</span></a></li>'
            + ''.join(f'<li><a href="#on-{k}">{l} <span class="n">{counts[k]}</span></a></li>' for k, l, _ in RUNS_ON if counts[k])
            + '</ul>\n    </nav>')
    body = body.replace('<!--services:toc-->', toc).replace('<!--services:filter-->', filt).replace('<!--services:sections-->', '\n\n'.join(parts))

    def names(ids: list[str]) -> str:
        groups = []
        for c, _, h, _ in CLASS_SECTIONS + [('building-block', '', 'Building blocks', '')]:
            ns = sorted((by_id[i]['name'] for i in ids if by_id[i]['class'] == c), key=str.lower)
            if ns:
                groups.append(f"{h[0].lower() + h[1:] if not h.startswith('OBS') else h} ({html.escape(', '.join(ns), quote=False)})")
        return '; '.join(groups)
    body = re.sub('<!--services:names:([a-z0-9,-]+)-->', lambda m: names(m.group(1).split(',')), body)
    body = re.sub('<!--services:picks:([a-z0-9,-]+)-->', lambda m: '\n        '.join((service_line(by_id[i], with_extra=False) for i in m.group(1).split(','))), body)
    if '<!--help:index-->' in body:
        body = body.replace('<!--help:index-->', help_index_html(GUIDES))
    if '<!--services:docs-->' in body:
        docs = by_name(s for s in services if s['class'] == 'docs')
        body = body.replace('<!--services:docs-->', ', '.join(f'<a href="{html.escape(s["url"])}">{html.escape(s["name"], quote=False)}</a> ({html.escape(s["description"][0].lower() + s["description"][1:].rstrip("."), quote=False)})' for s in docs))
    if '<!--services:blocks-->' in body:
        body = body.replace('<!--services:blocks-->', building_blocks_html(services))
    body = body.replace('<!--commons:line-->', commons_line())
    body = body.replace('<!--commons:teaser-->', commons_teaser())
    return body

def links_filters_css(services: list[dict]) -> str:
    """Generated: while a platform's anchor is the :target, hide entries, groups, sections and contents lines with nothing for it."""
    rules = ['/* Platform filters for the apps and services page, derived from upstream data. */', '@supports selector(:has(a)) {']
    for k, _, _ in RUNS_ON:
        on = f'.links-page:has(#on-{k}:target)'
        rules += [f'  {on} .svc:not([data-on~="{k}"]), {on} .host-group:not(:has(.svc[data-on~="{k}"])), {on} .cls:not(:has(.svc[data-on~="{k}"])) {{ display: none; }}',
                  f'  {on} .on-filter a[href="#on-{k}"] {{ border-color: var(--fg); background: var(--sunk); box-shadow: inset 0 -3px 0 var(--fg); }}',
                  f'  {on} .on-filter .on-all {{ border-color: var(--rule-strong); background: transparent; box-shadow: none; }}']
        for c, a, _, _ in CLASS_SECTIONS:
            if not any(s['class'] == c and k in runs_on(s) for s in services):
                rules.append(f'  {on} .toc li[data-for="{a}"] {{ display: none; }}')
    rules += ['  .links-page:not(:has(.on-mark:target)) .on-filter .on-all { border-color: var(--fg); background: var(--sunk); box-shadow: inset 0 -3px 0 var(--fg); }', '}']
    return '\n'.join(rules) + '\n'

# ---------- Building blocks (irlcommons.org, Standards) ----------
def building_blocks_html(services: list[dict]) -> str:
    esc = lambda t: html.escape(t, quote=False)
    items = by_name(s for s in services if s['class'] == 'building-block')
    if not items:
        return ''
    rows = []
    for s in items:
        extra = ', '.join(f'<a href="{html.escape(l["url"])}">{esc(l["label"])}</a>' for l in s['links'])
        hay = html.escape(' '.join([s['name'], s['description'], s['maker']]).lower())
        rows.append(f'<li class="block" id="block-{s["id"]}" data-search="{hay}"><p class="svc-head"><a class="svc-name" href="{html.escape(s["url"])}">{esc(s["name"])}</a>'
                    + (f' <span class="tag">{esc(s["licence"])}</span>' if s['licence'] else '') + '</p>'
                    + f'<p class="svc-what">{esc(s["description"])}' + (f' Also: {extra}.' if extra else '') + f' {edit_icon("services", s["id"], s["name"])}</p></li>')
    return ('    <section class="part" id="building-blocks" aria-labelledby="building-blocks-h">\n      <h2 id="building-blocks-h">Building blocks</h2>\n'
            '      <p class="sum">Protocol implementations, libraries and general media servers that apps and receivers are built from. For developers and self-hosters; streamers find the finished apps on <a href="links.html">How to IRL</a>.</p>\n'
            '      <ul class="svcs blocks">\n        ' + '\n        '.join(rows) + '\n      </ul>\n    </section>')

def standard_users(x: dict, by_id: dict[str, dict], on_links: set[str]) -> tuple[list[str], str]:
    own = x['name'].split(' (')[0].lower()
    users, itself = ([], '')
    for r in x['service_ids']:
        s = by_id[r]
        name = html.escape(s['name'], quote=False)
        if s['class'] == 'building-block':
            link = f'<a href="#block-{r}">{name}</a>'
        elif r in on_links:
            link = f'<a href="links.html#{r}">{name}</a>'
        else:
            link = name
        if s['name'].lower() == own:
            itself = link
        else:
            users.append(link)
    return (users + [html.escape(n, quote=False) for n in x['other_users']], itself)

# ---------- Help: the guide directory (Index B) ----------
KIND_LABEL = {'article': 'Article', 'video': 'Video', 'docs': 'Docs'}

def help_filters(guides: list[dict]) -> list[tuple[str, str, str, str, int]]:
    out = [('part', f'guides-{k}', label, f'[data-p~="{k}"]', sum((1 for g in guides if k in g['part']))) for k, label, _ in PARTS]
    out += [('kind', f'kind-{k}', label, f'[data-k="{k}"]', sum((1 for g in guides if g['kind'] == k))) for k, label in (('article', 'Articles'), ('video', 'Videos'), ('docs', 'Docs'))]
    covered = sorted({c for g in guides for c in g['covers']}, key=lambda c: SERVICES_BY_ID[c]['name'].lower())
    out += [('product', f'for-{c}', SERVICES_BY_ID[c]['name'], f'[data-c~="{c}"]', sum((1 for g in guides if c in g['covers']))) for c in covered]
    return [f for f in out if f[4]]

def service_href(sid: str) -> str:
    """Where a product is listed: How to IRL's apps and services, or the building blocks on IRL Commons' Standards."""
    if SERVICES_BY_ID[sid]['class'] == 'building-block':
        return f'https://irlcommons.org/existing-formats.html#block-{sid}'
    return f'links.html#{sid}' if SERVICES_BY_ID[sid]['class'] in STREAMER_CLASSES else html.escape(SERVICES_BY_ID[sid]['url'])

def guide_row(g: dict, repeated: bool=False) -> str:
    esc = lambda t: html.escape(t, quote=False)
    title = f"{g['title_display']} (“{g['title']}”)" if repeated else g['title_display']
    kind = KIND_LABEL[g['kind']]
    site = site_name(g['url'])
    names = [SERVICES_BY_ID[c]['name'] for c in g['covers']]
    parts = list(dict.fromkeys(g['part']))
    hay = ' '.join([g['title_display'], g['title'], g['creator'], site, kind, *names, *(PART_LABEL[p] for p in parts)]).lower()
    m = GUIDE_THUMBS.get(g['id'])
    lead = f'<svg class="ix-icon" aria-hidden="true"><use href="#{"i-play" if g["kind"] == "video" else "i-doc"}"/></svg>'
    thumb = (f'<a class="ix-thumb" href="{html.escape(g["url"])}" tabindex="-1" aria-hidden="true"><img src="assets/thumbs/{html.escape(m["file"])}" '
             f'width="{m["width"]}" height="{m["height"]}" alt="" loading="lazy" decoding="async"></a>') if m else ''
    chips = ''.join(f'<span class="pchip">{esc(PART_LABEL[p])}</span>' for p in parts)
    date = long_date(g['published']) if g.get('published') else 'Not given on the page'
    facts = [('Original title', f"“{esc(g['title'])}”"), ('By', esc(g['creator']))]
    if g['language'] != 'en':
        facts.append(('Language', LANGUAGE_NAME.get(g['language'], g['language'])))
    if g.get('published'):
        facts.append(('Published', date))
    facts.append(('About', ', '.join(f'<a href="{service_href(c)}">{esc(SERVICES_BY_ID[c]["name"])}</a>' for c in g['covers'])))
    if m:
        facts.append(('Thumbnail', esc(m['credit'])))
    dl = ''.join((f'<div><dt>{k}</dt><dd>{v}</dd></div>' for k, v in facts))
    return (f'<li class="ix-row{" has-thumb" if m else ""}" id="{g["id"]}" data-p="{" ".join(parts)}" data-c="{" ".join(g["covers"])}" data-k="{g["kind"]}" data-search="{html.escape(hay)}">'
            f'<div class="ix-line">{lead}<span class="ix-kind">{kind}</span><span class="ix-tcell">{thumb}<a class="ix-title" href="{html.escape(g["url"])}">{esc(title)}</a></span><span class="ix-chips">{chips}</span></div>'
            f'<details class="ix-more"><summary><span class="vh">Details: {esc(title)}</span></summary><div class="ix-body"><dl class="ix-facts">{dl}</dl>'
            f'<p class="edit-line">{edit_icon("guides", g["id"], g["title_display"])}</p></div></details></li>')

def help_index_html(guides: list[dict]) -> str:
    esc = lambda t: html.escape(t, quote=False)
    filters = help_filters(guides)
    marks = '<span class="fm" id="guides"></span>' + ''.join((f'<span class="fm" id="{fid}"></span>' for _, fid, _, _, _ in filters))
    chain = ''.join(f'<li><a class="cstep" href="#{fid}" data-f="{fid}"><svg class="pi" aria-hidden="true"><use href="#p-{fid[7:]}"/></svg><span class="sl">{esc(label)}</span><span class="sn">{n}</span></a></li>'
                    for grp, fid, label, _, n in filters if grp == 'part')
    kinds = ''.join(f'<li><a class="fchip" href="#{fid}" data-f="{fid}"><svg class="ki" aria-hidden="true"><use href="#{"i-play" if fid.endswith("video") else "i-doc"}"/></svg>{esc(label)} <span class="sn">{n}</span></a></li>'
                    for grp, fid, label, _, n in filters if grp == 'kind')
    products = ''.join(f'<li><a class="fchip" href="#{fid}" data-f="{fid}">{esc(label)} <span class="sn">{n}</span></a></li>'
                       for grp, fid, label, _, n in filters if grp == 'product')
    notes = ''.join((f'<p class="fnote" data-f="{fid}">{esc(label)}: {n} guide{"s" if n != 1 else ""}. <a href="#guides" class="filter-reset">Clear filters</a></p>' for _, fid, label, _, n in filters))
    titles = [g['title_display'] for g in guides]
    rows = '\n        '.join((guide_row(g, titles.count(g['title_display']) > 1) for g in guides_in_order(guides)))
    total = len(guides)
    return f"""    <section class="part ix" aria-labelledby="guides-h">
      <h2 id="guides-h" class="vh">Guide directory</h2>
      <div class="fmarks">{marks}</div>
      <div class="ix-filters" id="ix-filters">
        <nav class="chainmap compact" aria-label="Filter by part of the chain"><p class="fh">Where in the chain?</p><ol>{chain}</ol></nav>
        <div class="ix-row2">
          <nav class="fgroup" aria-label="Filter by kind"><p class="fh">Kind</p><ul class="fchips">{kinds}</ul></nav>
          <div class="fgroup"><p class="fh" id="by-product-h">Product</p><details class="fprod" id="by-product"><summary aria-describedby="by-product-h"><span class="fsum">All products</span><span class="fcur"></span></summary><ul class="fchips">{products}</ul></details></div>
          <p class="search-field ix-search" id="dir-search" hidden><label for="dir-q" class="fh">Search</label> <input type="search" id="dir-q" autocomplete="off" spellcheck="false"></p>
        </div>
      </div>
      <div class="fnotes" role="status"><p class="fnote fnote-all">Showing all {total} guides.</p>{notes}<p class="fnote fnote-js" id="dir-count" hidden></p></div>
      <ul class="ix-rows">
        {rows}
      </ul>
    </section>"""

def help_filters_css(guides: list[dict]) -> str:
    """Generated: without script, the filter whose anchor is the :target hides the rows that don't match, marks itself and shows its note.
    With script (.ix-js), site.js filters and combines them instead."""
    rules = ['/* Guide filters, derived from upstream data. */', '.fnote:not(.fnote-all) { display: none; }', '.fnote-js:not([hidden]) { display: block; }', '@supports selector(:has(a)) {',
             '  .help-page:has(.fm:not(#guides):target) .fnote-all { display: none; }']
    for group, fid, label, match, _ in help_filters(guides):
        on = f'.help-page:not(.ix-js):has(#{fid}:target)'
        rules += [f'  {on} .ix-row:not({match}) {{ display: none; }}',
                  f'  {on} a[data-f="{fid}"] {{ border-color: var(--fg); background: var(--sunk); box-shadow: inset 0 -3px 0 var(--fg); }}',
                  f'  {on} .fnote[data-f="{fid}"] {{ display: block; }}']
        if group == 'product':
            rules.append(f"""  {on} #by-product .fcur::before {{ content: "{label.replace(chr(92), '').replace(chr(34), '')}"; }}""")
            rules.append(f'  {on} #by-product .fsum {{ display: none; }}')
    rules.append('}')
    return '\n'.join(rules) + '\n'
