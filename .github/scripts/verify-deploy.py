"""Check a deploy: the files the server unpacked, and the files it serves, equal the build.

    python3 .github/scripts/verify-deploy.py <dist> <manifest.json> <base url> [--noindex]

manifest.json is what the server printed after unpacking (path -> sha256).
Each file is then fetched from <base url> and compared. Pages are fetched at their
address without ".html" (x.html at /x, index.html at /), and their old ".html"
address must answer with a redirect there. Exits 1 on any difference.
With --noindex (previews), robots.txt must disallow everything and every page must
carry an X-Robots-Tag noindex header instead; the server answers robots.txt itself.
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def local_manifest(dist):
    out = {}
    for root, _, files in os.walk(dist):
        for name in files:
            path = os.path.join(root, name)
            with open(path, "rb") as f:
                out[os.path.relpath(path, dist).replace(os.sep, "/")] = hashlib.sha256(f.read()).hexdigest()
    return out


def fetch_with_headers(url):
    req = urllib.request.Request(url, headers={"User-Agent": "site-deploy-check", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(), r.headers


def fetch(url):
    return fetch_with_headers(url)[0]


def address(path):
    """Where a built file is served: pages without ".html", the home page at "", other files at their path."""
    if path == "index.html" or path.endswith("/index.html"):
        return path[: -len("index.html")]
    return path[: -len(".html")] if path.endswith(".html") else path


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def redirect_target(url):
    """The absolute address an old URL redirects to, or None when it answers without a redirect."""
    req = urllib.request.Request(url, headers={"User-Agent": "site-deploy-check", "Cache-Control": "no-cache"})
    try:
        with urllib.request.build_opener(_NoRedirect).open(req, timeout=20):
            return None
    except urllib.error.HTTPError as e:
        if e.code in (301, 308) and e.headers.get("Location"):
            return urllib.parse.urljoin(url, e.headers["Location"])
        return None


def check_noindex(base):
    robots = fetch(base.rstrip("/") + "/robots.txt").decode()
    if "Disallow: /" not in robots.split("\n") and "Disallow: /\r" not in robots:
        print("robots.txt does not disallow everything")
        return False
    _, headers = fetch_with_headers(base.rstrip("/") + "/")
    if "noindex" not in (headers.get("X-Robots-Tag") or ""):
        print("the home page has no X-Robots-Tag noindex header")
        return False
    return True


def main(dist, manifest_path, base, *flags):
    noindex = "--noindex" in flags
    want = local_manifest(dist)
    with open(manifest_path) as f:
        got = json.load(f)["files"]
    if got != want:
        missing = sorted(set(want) - set(got))
        extra = sorted(set(got) - set(want))
        changed = sorted(p for p in set(want) & set(got) if want[p] != got[p])
        print(f"server copy differs: missing {missing[:5]}, extra {extra[:5]}, changed {changed[:5]}")
        return 1
    bad = []
    for path, digest in sorted(want.items()):
        if noindex and path == "robots.txt":
            continue
        url = base.rstrip("/") + "/" + urllib.request.quote(address(path))
        old = base.rstrip("/") + "/" + urllib.request.quote(path) if address(path) != path else None
        for attempt in range(4):
            try:
                if hashlib.sha256(fetch(url)).hexdigest() == digest and (old is None or redirect_target(old) == url):
                    break
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(2 * (attempt + 1))
        else:
            bad.append(path)
    if noindex and not check_noindex(base):
        return 1
    if bad:
        print(f"{len(bad)} of {len(want)} files are not served as built, for example: {', '.join(bad[:5])}")
        return 1
    print(f"all {len(want)} files are served as built from {base}" + (" (not indexed)" if noindex else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
