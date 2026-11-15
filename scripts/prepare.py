"""Render catalogue slots from the pinned upstream package before Astro builds."""
import json, pathlib, sys, re
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'shared'))
import render as r
pkg=ROOT/'node_modules/@irl-commons/data'
data={k:json.loads((pkg/'data'/f'{k}.json').read_text())[k] for k in ['words','services','guides','standards']}
r.GUIDES[:]=data['guides'];r.SERVICES_BY_ID.update({s['id']:s for s in data['services']})
r.GUIDE_THUMBS.update({m['for']['guide']:m for m in json.loads((ROOT/'shared/thumbnails.json').read_text())})
from html import escape
from urllib.parse import urlencode

def suggest(dataset,ident):
 query=urlencode({'template':'edit-entry.yml','title':f'Edit: {dataset}/{ident}','entry':f'{dataset}/{ident}'})
 return '<a class="suggest-edit" href="https://github.com/irl-commons/irl-commons/issues/new?'+escape(query)+'">Suggest an edit</a>'
# Decorate every rendered entry, including short product picks and embedded definitions.
for function,dataset in [('service_line','services'),('standard_entry','standards'),('guide_row','guides')]:
 original=getattr(r,function)
 def wrapper(entry,*args,_fn=original,_dataset=dataset,**kwargs):
  text=_fn(entry,*args,**kwargs);pos=text.rfind('</li>')
  return text[:pos]+' '+suggest(_dataset,entry['id'])+text[pos:] if pos>=0 else text+' '+suggest(_dataset,entry['id'])
 setattr(r,function,wrapper)
original_words=r.words_entries
# A definition list needs dd rather than a bare link.
def words_entries(words,lang):
 text=original_words(words,lang)
 for word in words:
  start=text.index(f'id="{word["id"]}"');end=text.index('</div>',start)
  text=text[:end]+'<dd>'+suggest('words',word['id'])+'</dd>'+text[end:]
 return text
r.words_entries=words_entries
rendered={}
for src in (ROOT/'content').glob('*.html'):
 body=src.read_text()
 body=r.fill_words(body,data['words'])
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
 # The repeated step navigation needs a distinct accessible name at each location.
 count=[0]
 def landmark(match):
  count[0]+=1
  return match[0].replace('aria-label="','aria-label="Step navigation '+str(count[0])+': ')
 body=re.sub(r'<nav[^>]+aria-label="[^"]+"',landmark,body)
 body=re.sub(r'<nav(?![^>]*aria-label)([^>]*)>',lambda m: '<nav aria-label="Steps '+str(m.start())+'"'+m[1]+'>',body)
 rendered[src.name]=r.add_permalinks(body)
(ROOT/'.generated').mkdir(exist_ok=True)
(ROOT/'.generated/content.json').write_text(json.dumps(rendered,ensure_ascii=False))
(ROOT/'public/assets/help-filters.css').write_text(r.help_filters_css(data['guides']))
