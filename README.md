# irlcommons.org

A static Astro site for the IRL Commons initiative, open standards and open data.

## Build

Use the Node version in [`.nvmrc`](.nvmrc) (`nvm install && nvm use`)
and Python 3.12 or newer. The npm version is recorded in `package.json` (`packageManager`). Run `npm ci --ignore-scripts`, then
`npm run check`. Building never deploys. The `_headers` file records the required
response headers; configure equivalent headers when the host does not read it.

## Deploys and previews

GitHub Actions does both, once the repository variables `SITE_DEPLOY=on` and
`SITE_PREVIEWS=on` are set:

- **Live site:** every push to `main` is built, checked and put live
  ([deploy.yml](.github/workflows/deploy.yml)). The server keeps the last five
  releases and switches between them in one step. After the switch every file is
  fetched from the live site and compared with the build; if anything differs, the
  previous release goes back live. To undo a deploy by hand, run the Deploy workflow
  with `rollback`.
- **Previews:** each pull request from a branch of this repository gets its own
  address, `https://pr-<number>.preview.<domain>/`, posted as a comment on the pull
  request, rebuilt on every push and removed when it is closed
  ([preview.yml](.github/workflows/preview.yml)). Previews are not indexed. Pull
  requests from forks get no preview, because their code would run next to the
  deploy key; a maintainer can push the branch here to get one.
- **Data updates:** [data-bump.yml](.github/workflows/data-bump.yml) checks hourly
  for a new `@irl-commons/data` release and opens a pull request with a preview.
  Merging it puts the new data live.

The deploy key, the server address and its host key are secrets of the
`production` and `preview` environments; `production` only accepts `main`.

## Sources

Edit prose in `content/`, page metadata and navigation in `src/shells.json`,
and the Astro layout and components in `src/`. The build resolves catalogue
slots from `@irl-commons/data`, pinned to an exact npm version. To update it,
change the dependency pin, lockfile and `site.json` dataVersion together, then
run all checks. CI verifies registry signatures and provenance. The daily
update job follows npm’s `latest` tag and opens a release pull request.

`shared/` is the same versioned folder in both site repositories: rendering
functions, calculator formula, thumbnail attribution and the data-use model.
Shared version: 1.2.9. Changes should be copied to the sibling site in the same
review. Vendoring this small folder keeps either repository independently
buildable without a third package release. Styles and self-hosted fonts are
identical; one first-party script adds theme choice, search, the calculator and
the Help page's app list (My apps).
The site also works without script. Quick checks are not published.

Tests cover the build, local links and anchors, metadata, HTML validation,
schema addresses and the strict CSP. No third-party resources load in readers'
browsers. The data package is fetched at build time only.

## Licences

Code: MIT (`LICENSE`). Original prose and drawings: CC BY 4.0
(`LICENSE-CONTENT`). Data from [IRL Commons](https://github.com/irl-commons/irl-commons),
CC BY 4.0. Video thumbnails belong to their credited creators and are linked to
the originals; they are not relicensed here. Fonts retain their bundled OFL notices.

Glossary and naming search reads `also_called`, `search_terms` and every naming
alternative term, along with the term, recommended label and plural. Deprecated
`aliases` is not used. Naming sources are displayed as “Where seen”, with
context-only sources identified, and without maker counts.
