# Contributing

Fixes to the pages, layout and accessibility are welcome. Use the Node version in [`.nvmrc`](.nvmrc) (`nvm install && nvm use`). Run `npm ci`, then
`npm run check` before opening a pull request. Explain what changes for readers.

The glossary, services, guides and standards belong to
[IRL Commons](https://github.com/irl-commons/irl-commons). Please send data
changes there first; this site consumes a pinned package and keeps no data fork.
See its CONTRIBUTING guide for source evidence and prefilled issue forms.
The organisation's community health defaults apply here.

## Frontend assets

Astro bundles the strict TypeScript modules in `src/scripts/` and the styles in
`src/styles/` through Vite. `npm run typecheck` checks the browser modules and is
part of `npm run check`. Built scripts and styles are external same-origin files
under `/assets/` so the site's CSP applies.

## Browser checks

`npm run check:browser` opens every page of the built site (`npm run build`
first) in headless Chromium, served locally with the headers from `_headers`, so
the strict CSP applies. Each page is checked at 320, 390 and 1280 pixels, light
and dark, with and without script: axe-core rules (WCAG 2.2 A and AA plus best
practice, including contrast, target size and heading order), sideways scroll,
console errors and CSP violations, failed or third-party requests, links and
fragments, images, controls that need script, and whether a theme picked with
the theme button matches the system theme. It takes under a minute and runs in
CI on every pull request. Install the Chromium build it expects once with
`npx playwright-core install chromium-headless-shell`.

`browser-checks.json` lists problems that are known and not fixed yet under
`baseline`, each with a reason. An entry covers findings with the same page and
check, and, when given, the same target and variants. The run prints every new
finding; it also fails when an entry no longer matches anything, so remove the
entry with the fix. `states` adds page states to check, such as home page answers
that only show when they are the URL fragment.

## Page weight

`npm test` compares the size of each page (its HTML, and the HTML with the
stylesheets, scripts and images it loads) and of each stylesheet, script and font
with `page-budget.json`. The limits are the size when they were last set plus
15 percent. `npm run budget` prints the current sizes; after an intended change,
run `npm run budget -- --write` and review the diff. The data update job runs
`npm run budget -- --raise` instead, which only raises the limits a new data
release goes over, so the growth shows in its pull request rather than failing it.

## Screenshots

`npm run snapshots -- before` saves full-page screenshots of every page at phone
and desktop width, light and dark, to `.snapshots/before/`. Rebuild with the
change, then `npm run snapshots -- after before` saves `.snapshots/after/` and lists
the screenshots that differ. `npm run serve` serves `dist/` at
http://127.0.0.1:4321/ with the headers from `_headers`.
