"""Page addresses without ".html".

Pages stay files on disk (`phone-setup.html`) and are served at `/phone-setup`; the home page is `/`. The server
answers an old address ending in ".html" with a 301 to the clean one. Sources may keep writing `phone-setup.html`:
`clean_links` rewrites links to the two sites' pages in the finished HTML, so every page links to the address a reader
sees. Links to other sites, assets and data files are left alone.
"""
import re

DOMAINS = ('howtoirl.org', 'irlcommons.org')
_DOMAIN = '|'.join(re.escape(d) for d in DOMAINS)
_PAGE = r'(?:[a-z0-9-]+/)*[a-z0-9-]+'


def address(name: str) -> str:
    """The path of a page file, without the leading slash: `index.html` -> ``, `phone-setup.html` -> `phone-setup`."""
    if name == 'index.html' or name.endswith('/index.html'):
        return name.removesuffix('index.html')
    return name.removesuffix('.html')


def url(domain: str, name: str) -> str:
    """The full address of a page: `https://howtoirl.org/phone-setup`."""
    return f'https://{domain}/{address(name)}'


def _relative(m: re.Match) -> str:
    page = address(m['page'] + '.html')
    return f'{m["attr"]}="{page or "./"}{m["rest"]}'


def _absolute(m: re.Match) -> str:
    return m['site'] + address(m['page'] + '.html')


def _encoded(m: re.Match) -> str:
    return m['site'] + address(m['page'] + '.html').replace('/', '%2F')


def clean_links(html: str) -> str:
    """Links to pages of the two sites, at their clean addresses: `href="glossary.html#bonding"` becomes
    `href="glossary#bonding"`, `href="index.html"` becomes `href="./"`, and `https://howtoirl.org/help.html` (also
    URL-encoded, as in "Suggest an edit" links) loses its ".html"."""
    html = re.sub(rf'(?P<attr>href|data-copy)="(?P<page>{_PAGE})\.html(?P<rest>[#?"])', _relative, html)
    html = re.sub(rf'(?P<site>https://(?:{_DOMAIN})/)(?P<page>{_PAGE})\.html(?![\w.-])', _absolute, html)
    html = re.sub(rf'(?P<site>https%3A%2F%2F(?:{_DOMAIN})%2F)(?P<page>[a-z0-9-]+)\.html(?![\w.-])', _encoded, html,
                  flags=re.I)
    return html
