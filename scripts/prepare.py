"""Render catalogue slots from the pinned upstream package before Astro builds."""
import json, pathlib, sys, re
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'shared'))
import render as r
pkg=ROOT/'node_modules/@irl-commons/data'
data={k:json.loads((pkg/'data'/f'{k}.json').read_text())[k] for k in ['words','services','guides','standards']}
r.GUIDES[:]=data['guides'];r.SERVICES_BY_ID.update({s['id']:s for s in data['services']})
r.GUIDE_THUMBS.update({m['for']['guide']:m for m in json.loads((ROOT/'shared/thumbnails.json').read_text())})
rendered={}
for src in (ROOT/'content').glob('*.html'):
 body=src.read_text()
 body=r.fill_words(body,data['words'])
 body=r.fill_naming(body,data['words'],data['services'])
 body=r.fill_standards(body,data['standards'],data['services'],data['words'])
 body=r.fill_services(body,data['services'])
 body=r.fill_calc(body,r.datause.load_model())
 # Resolve data-generated links across the two public sites.
 cfg=json.loads((ROOT/'site.json').read_text())
 body=body.replace('>Data and standards</a>', '>Open data at IRL Commons</a>' if cfg['domain']=='howtoirl.org' else '>Open data</a>')
 other='irlcommons.org' if cfg['domain']=='howtoirl.org' else 'howtoirl.org'
 def cross(match):
  page=match[1]
  return match[0] if page in cfg['pages'] else f'href="https://{other}/{page}'
 body=re.sub(r'href="([a-z0-9-]+\.html)',cross,body)
 # Each navigation needs a distinct accessible name. Keep the authored label;
 # only a label that repeats on the page gets "part 2", "part 3" and so on.
 seen={}
 def landmark(match):
  label=match[1]
  seen[label]=seen.get(label,0)+1
  return match[0] if seen[label]==1 else match[0][:-1]+f', part {seen[label]}"'
 body=re.sub(r'<nav[^>]+aria-label="([^"]+)"',landmark,body)
 body=re.sub(r'<nav(?![^>]*aria-label)([^>]*)>',lambda m: '<nav aria-label="Steps '+str(m.start())+'"'+m[1]+'>',body)
 rendered[src.name]=r.add_permalinks(body)
(ROOT/'.generated').mkdir(exist_ok=True)
(ROOT/'.generated/content.json').write_text(json.dumps(rendered,ensure_ascii=False))
if 'links.html' in json.loads((ROOT/'site.json').read_text())['pages']:
 (ROOT/'public/assets/links-filters.css').write_text(r.links_filters_css(data['services']))
