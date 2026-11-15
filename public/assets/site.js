
(function () {
  "use strict";

  var KEY = "osb.stack.v1";
  var THEME_KEY = "osb.theme";
  var THEMES = ["auto", "dark", "light"];

  
  function readTheme(storage) {
    try {
      var v = storage && storage.getItem(THEME_KEY);
      return v === "dark" || v === "light" ? v : "auto";
    } catch (e) { return "auto"; }
  }

  
  function writeTheme(storage, theme) {
    try {
      if (theme === "dark" || theme === "light") storage.setItem(THEME_KEY, theme); else storage.removeItem(THEME_KEY);
      return true;
    } catch (e) { return false; }
  }

  function nextTheme(theme) {
    return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  }

  var THEME_TEXT = {
    en: { auto: "auto", dark: "dark", light: "light", label: "Colour theme: ", device: ", follows your device", press: ". Switch to ", tip: "Theme: " },
    de: { auto: "automatisch", dark: "dunkel", light: "hell", label: "Farbschema: ", device: ", wie Ihr Gerät", press: ". Wechseln zu ", tip: "Farbschema: " }
  };

  
  function themeLabel(theme, lang) {
    var t = THEME_TEXT[lang] || THEME_TEXT.en;
    return t.label + t[theme] + (theme === "auto" ? t.device : "") + t.press + t[nextTheme(theme)] + ".";
  }

  function storageOrNull() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  
  function hasSaved(storage) {
    try {
      var v = JSON.parse((storage && storage.getItem(KEY)) || "null");
      return !!v && Array.isArray(v.ids) && v.ids.length > 0;
    } catch (e) { return false; }
  }

  var BETA_KEY = "osb.beta.hidden";

  
  function betaHidden(storage) {
    try { return !!storage && storage.getItem(BETA_KEY) === "1"; } catch (e) { return false; }
  }
  function hideBeta(storage) {
    try { storage.setItem(BETA_KEY, "1"); return true; } catch (e) { return false; }
  }
  function sessionOrNull() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  
  function movedUrl(target, hash) {
    if (!/^[a-z0-9-]+\.html$/.test(target || "")) return null;
    return target + (/^#[A-Za-z0-9_-]+$/.test(hash || "") ? hash : "");
  }

  
  function hashId(hash) {
    var raw = String(hash || "").replace(/^#/, "");
    try { raw = decodeURIComponent(raw); } catch (e) { return ""; }
    return /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(raw) ? raw : "";
  }

  if (typeof document !== "undefined" && document.documentElement) {
    var movedTo = movedUrl(document.documentElement.getAttribute("data-moved"), window.location.hash);
    if (movedTo) { window.location.replace(movedTo); return; }

    document.documentElement.classList.add("fold-js");
    var early = readTheme(storageOrNull());
    if (early !== "auto") document.documentElement.setAttribute("data-theme", early);
    if (betaHidden(sessionOrNull())) document.documentElement.classList.add("beta-hidden");

    if (/(?:^#|&)stack=[a-z0-9]/.test(window.location.hash) || hasSaved(storageOrNull())) document.documentElement.classList.add("stack-collapsed");
  }
  var ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  
  function splitHash(hash) {
    var out = { section: "", stack: null };
    String(hash || "").replace(/^#/, "").split("&").forEach(function (part) {
      if (part.indexOf("stack=") === 0) { if (out.stack === null) out.stack = part.slice(6); }
      else if (!out.section && /^[A-Za-z][A-Za-z0-9_-]*$/.test(part)) out.section = part;
    });
    return out;
  }

  
  function parseHash(hash, known) {
    var raw = splitHash(hash).stack;
    if (raw === null) return null;
    var out = [];
    raw.split(",").forEach(function (id) {
      if (ID.test(id) && known.indexOf(id) !== -1 && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  function buildHash(ids) {
    return "#stack=" + ids.filter(function (id) { return ID.test(id); }).join(",");
  }

  
  function stateHash(section, ids) {
    var parts = [];
    if (section && /^[A-Za-z][A-Za-z0-9_-]*$/.test(section)) parts.push(section);
    var clean = ids.filter(function (id) { return ID.test(id); });
    if (clean.length) parts.push("stack=" + clean.join(","));
    return parts.length ? "#" + parts.join("&") : "";
  }

  
  function inOrder(ids, known) {
    return known.filter(function (id) { return ids.indexOf(id) !== -1; });
  }

  function sameIds(a, b) {
    return !!a && !!b && a.length === b.length && a.every(function (id) { return b.indexOf(id) !== -1; });
  }

  
  function startPicks(hash, known, savedIds) {
    var fromLink = parseHash(hash, known);
    if (fromLink && fromLink.length) {
      var ids = inOrder(fromLink, known);
      return { ids: ids, from: "link", remember: sameIds(savedIds, ids) };
    }
    if (savedIds) return { ids: inOrder(savedIds, known), from: "memory", remember: true };
    return { ids: [], from: "none", remember: false };
  }

  
  function matches(dataStack, picked) {
    return (dataStack || "").split(" ").some(function (id) { return id && picked.indexOf(id) !== -1; });
  }

  
  function store(storage) {
    return {
      load: function (known) {
        try {
          var v = JSON.parse(storage.getItem(KEY) || "null");
          if (!v || !Array.isArray(v.ids)) return null;
          return v.ids.filter(function (id) { return typeof id === "string" && known.indexOf(id) !== -1; });
        } catch (e) { return null; }
      },
      save: function (ids) {
        try { storage.setItem(KEY, JSON.stringify({ ids: ids })); return true; } catch (e) { return false; }
      },
      forget: function () {
        try { storage.removeItem(KEY); return true; } catch (e) { return false; }
      }
    };
  }

  function listNames(names) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  
  function fitLevel(needs, picked) {
    var groups = String(needs || "").split("|").filter(Boolean);
    var met = groups.filter(function (grp) { return matches(grp, picked); }).length;
    if (!groups.length || !met) return null;
    return met === groups.length ? "full" : "part";
  }

  function plural(n, one, many) { return n === 1 ? "1 " + one : n + " " + many; }

  
  function describe(picked, counts) {
    if (!picked.length) return "Nothing picked yet. All help shows in its usual order.";
    var parts = [];
    if (counts.full) parts.push(plural(counts.full, "guide that fits", "guides that fit"));
    if (counts.part) parts.push(plural(counts.part, "guide that partly fits", "guides that partly fit"));
    parts.push(plural(counts.asks, "place to ask", "places to ask"));
    return "First on this page: " + listNames(parts) + ". Everything else follows below.";
  }

  
  function summaryText(names) {
    return names.length ? names.join(", ") : "nothing picked yet";
  }

  
  function norm(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  
  function wordMatches(haystack, query) {
    var hay = norm(haystack);
    return norm(query).split(/\s+/).filter(Boolean).every(function (piece) { return hay.indexOf(piece) !== -1; });
  }

  function wordCount(shown, total) {
    if (shown === total) return "Showing all " + total + " words.";
    if (shown === 0) return "No words match.";
    return "Showing " + shown + " of " + total + " words.";
  }

  function standardCount(shown, total) {
    if (shown === total) return "Showing all " + total + ".";
    if (shown === 0) return "Nothing matches.";
    return "Showing " + shown + " of " + total + ".";
  }

  var MODES = ["single", "bonded", "redundant"];

  
  function dataUse(m, hours, videoMbps, audioKbps, mode, links, lossPct, recordMbps) {
    if (MODES.indexOf(mode) === -1) throw new Error("unknown mode " + mode);
    var secs = hours * 3600;
    var n = mode === "single" ? 1 : Math.floor(links);
    var copies = mode === "redundant" ? n : 1;
    var p = lossPct / 100;
    var ts = m.ts, pk = m.packet, rs = m.resend, ct = m.control, sl = m.srtla;
    var media = videoMbps * 1e6 + audioKbps * 1e3;
    var stream = media * ts.packet_bytes / (ts.packet_bytes - ts.header_bytes) + ts.fixed_kbps * 1e3;
    var ratio = (pk.payload_bytes + pk.srt_header_bytes + pk.udp_header_bytes + pk.ip_header_bytes) / pk.payload_bytes;
    var resend, nakShare;
    if (mode === "redundant") {
      var pLost = Math.pow(p, n); // a packet is resent only when every copy is lost
      resend = rs.factor * pLost / (1 - pLost);
      nakShare = pLost;
    } else {
      resend = rs.factor * p / (1 - p) + (mode === "bonded" ? rs.bonded_reorder : 0);
      nakShare = p + (mode === "bonded" ? rs.bonded_reorder : 0);
    }
    var sent = stream * ratio * (1 + resend);
    var acksUp = ct.up_kbps_per_link * 1e3 * n;
    var acksDown = ct.ack_down_kbps_per_link * 1e3 * n + ct.nak_down_share_per_loss * nakShare * stream * copies;
    var srtlaAcks = 0, keepalives = 0;
    if (mode === "bonded") {
      var packets = stream * (1 + resend) / (pk.payload_bytes * 8);
      srtlaAcks = packets / sl.ack_every_packets * sl.ack_bytes * 8;
      keepalives = 2 * n * sl.keepalive_kbps * 1e3;
    }
    var parts = {
      media: media * copies,
      packing: (stream - media) * copies,
      headers: stream * (ratio - 1) * copies,
      resends: stream * ratio * resend * copies,
      control: acksUp + acksDown + srtlaAcks,
      keepalives: keepalives
    };
    var total = parts.media + parts.packing + parts.headers + parts.resends + parts.control + parts.keepalives;
    var toBytes = function (bps) { return bps * secs / 8; };
    var out = {};
    Object.keys(parts).forEach(function (k) { out[k] = toBytes(parts[k]); });
    return {
      total: toBytes(total),
      up: toBytes(sent * copies + acksUp + keepalives / 2),
      down: toBytes(acksDown + srtlaAcks + keepalives / 2),
      per_link: toBytes(total / n),
      links: n,
      parts: out,
      overhead_pct: (total / media / copies - 1) * 100,
      recording: recordMbps === null || recordMbps === undefined ? null : toBytes(recordMbps * 1e6 + audioKbps * 1e3 + m.mp4.fixed_kbps * 1e3)
    };
  }

  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  
  function fmtSize(b, m) {
    var halfUp = function (x) { return Math.floor(x + 0.5); };
    var gb = b / m.units.gb_bytes;
    if (gb < 0.995) {
      if (!(b > 0)) return "0 MB";
      return group(Math.max(halfUp(b / m.units.mb_bytes / 10) * 10, 10)) + " MB";
    }
    if (gb < 99.95) {
      var tenths = halfUp(gb * 10);
      return Math.floor(tenths / 10) + "." + (tenths % 10) + " GB";
    }
    return group(halfUp(gb)) + " GB";
  }

  
  function readNumber(text) {
    var t = String(text || "").trim().replace(",", ".");
    return /^\d*\.?\d+$|^\d+\.$/.test(t) ? parseFloat(t) : NaN;
  }

  var api = { hashId: hashId, movedUrl: movedUrl, MODES: MODES, dataUse: dataUse, fmtSize: fmtSize, readNumber: readNumber, BETA_KEY: BETA_KEY, betaHidden: betaHidden, hideBeta: hideBeta, THEME_KEY: THEME_KEY, hasSaved: hasSaved, fitLevel: fitLevel, summaryText: summaryText, readTheme: readTheme, writeTheme: writeTheme, nextTheme: nextTheme, themeLabel: themeLabel, KEY: KEY, norm: norm, wordMatches: wordMatches, wordCount: wordCount, standardCount: standardCount, parseHash: parseHash, buildHash: buildHash, splitHash: splitHash, stateHash: stateHash, inOrder: inOrder, sameIds: sameIds, startPicks: startPicks, matches: matches, store: store, describe: describe, listNames: listNames };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }

  function init() {
    var form = document.getElementById("stack-form");
    var extra = document.getElementById("stack-js");
    var bar = document.getElementById("setup-bar");
    if (!form || !extra || !bar) return;
    var root = document.documentElement;
    var section = document.getElementById("my-stack");
    var picker = document.getElementById("setup-picker");
    var edit = document.getElementById("setup-edit");
    var namesOut = document.getElementById("setup-names");
    var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="stack"]'));
    var known = boxes.map(function (b) { return b.value; });
    var remember = document.getElementById("stack-remember");
    var forget = document.getElementById("stack-forget");
    var copy = document.getElementById("stack-copy");
    var note = document.getElementById("stack-link-note");
    var status = document.getElementById("stack-status");
    var find = document.getElementById("stack-q");
    var findCount = document.getElementById("stack-find-count");
    var noMatch = document.getElementById("stack-nomatch");
    var picks = Array.prototype.slice.call(form.querySelectorAll(".pick"));
    var steps = Array.prototype.slice.call(form.querySelectorAll(".stack-step"));
    var storage = storageOrNull();
    var saved = storage ? store(storage) : null;
    if (!saved) { remember.disabled = true; forget.disabled = true; }
    var collapsed = false;

    function picked() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
    function nameOf(id) {
      var box = document.getElementById("pick-" + id);
      var n = box && box.parentNode.querySelector(".pick-name");
      return n ? n.textContent : id;
    }
    function setPicked(ids) { boxes.forEach(function (b) { b.checked = ids.indexOf(b.value) !== -1; }); }

    function count(ids) {
      var page = document.querySelector(".help-page");
      var c = { full: 0, part: 0, asks: 0 };
      Array.prototype.forEach.call(page.querySelectorAll("#guides li.fit"), function (li) {
        var f = fitLevel(li.getAttribute("data-needs"), ids);
        if (f) c[f]++;
      });
      Array.prototype.forEach.call(page.querySelectorAll("#where-to-ask tr.mine"), function (tr) { if (matches(tr.getAttribute("data-stack"), ids)) c.asks++; });
      Array.prototype.forEach.call(page.querySelectorAll("#where-to-ask tr.fb"), function (tr) { if (ids.indexOf(tr.getAttribute("data-for")) !== -1) c.asks++; });
      return c;
    }

    function showBar() {
      var ids = picked();
      namesOut.textContent = summaryText(ids.map(nameOf));
      bar.classList.toggle("has-picks", ids.length > 0);
      edit.textContent = collapsed ? (ids.length ? "Edit" : "Pick your apps") : (ids.length ? "Done" : "Hide the list");
      edit.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    function render() {
      var ids = picked();
      status.textContent = describe(ids, count(ids));
      copy.disabled = !ids.length;
      note.textContent = ids.length ? "The link holds only: " + listNames(ids.map(nameOf)) + "." : "Pick something first.";
      showBar();
    }

    function setCollapsed(c, move) {
      collapsed = c;
      root.classList.toggle("stack-collapsed", c);
      showBar();
      if (!move) return;
      if (c) {
        if (bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: "nearest" });
      } else {
        section.scrollIntoView({ block: "start" });
        picker.focus({ preventScroll: true });
      }
    }

    
    function sectionNow() {
      var s = splitHash(window.location.hash).section;
      return s && document.getElementById(s) ? s : "";
    }
    
    function stateUrl() {
      return window.location.href.split("#")[0] + stateHash(sectionNow(), picked());
    }
    function jumpToSection(id) {
      var target = id && document.getElementById(id);
      if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
    }
    
    function syncUrl() {
      var hash = window.location.hash;
      if (!picked().length && splitHash(hash).stack === null) return; // nothing to add or remove
      var next = stateHash(sectionNow(), picked());
      if (next === hash) return;
      try {
        window.history.replaceState(window.history.state, "", next || window.location.pathname + window.location.search);
      } catch (e) {  }
    }

    function changed() {
      if (saved && remember.checked) saved.save(picked());
      syncUrl();
      render();
    }

    function applyFind() {
      var q = find.value.trim();
      var shown = 0;
      picks.forEach(function (li) {
        var ok = wordMatches(li.getAttribute("data-search"), q);
        li.hidden = !ok;
        if (ok) shown++;
      });
      steps.forEach(function (fs) { fs.hidden = !fs.querySelector(".pick:not([hidden])"); });
      form.classList.toggle("is-finding", q !== "");
      noMatch.hidden = shown > 0;
      findCount.textContent = q === "" ? "" : shown === 0 ? "" : plural(shown, "app or service matches.", "apps and services match.");
    }

    var start = startPicks(window.location.hash, known, saved ? saved.load(known) : null);
    setPicked(start.ids);
    remember.checked = start.remember;

    var jumpTo = start.from === "link" ? sectionNow() : "";
    collapsed = picked().length > 0 && root.classList.contains("stack-collapsed");

    form.addEventListener("submit", function (ev) { ev.preventDefault(); });
    form.addEventListener("change", function (ev) { if (ev.target !== find) changed(); });
    form.addEventListener("reset", function () {
      window.setTimeout(function () { find.dispatchEvent(new Event("input", { bubbles: true })); changed(); }, 0);
    });
    find.addEventListener("input", applyFind);
    edit.addEventListener("click", function () { setCollapsed(!collapsed, true); });


    window.addEventListener("hashchange", function () {
      var fromLink = parseHash(window.location.hash, known);
      if (fromLink && fromLink.length && !sameIds(inOrder(fromLink, known), picked())) {
        var next = startPicks(window.location.hash, known, saved ? saved.load(known) : null);
        setPicked(next.ids);
        remember.checked = next.remember;
      }
      var jump = fromLink ? sectionNow() : ""; // "#guides&stack=…": the browser can't jump there itself
      syncUrl();
      render();
      jumpToSection(jump);
    });
    remember.addEventListener("change", function () {
      if (!saved) return;
      if (remember.checked) saved.save(picked()); else saved.forget();
      render();
    });
    forget.addEventListener("click", function () {
      if (saved) saved.forget();
      remember.checked = false;
      status.textContent = "Removed from this device. Your picks stay in this page's address until you clear them.";
    });
    copy.addEventListener("click", function () {
      var url = stateUrl();
      var done = function () { status.textContent = "Link copied: " + url; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { status.textContent = "Copy this link: " + url; });
      } else {
        status.textContent = "Copy this link: " + url;
      }
    });
    document.getElementById("setup-find").hidden = false;
    extra.hidden = false;
    bar.hidden = false;
    setCollapsed(collapsed, false);
    syncUrl();
    render();
    jumpToSection(jumpTo);
  }

  function initWords() {
    var tools = document.getElementById("word-tools");
    if (!tools) return;
    var q = document.getElementById("word-q");
    var count = document.getElementById("word-count");
    var none = document.getElementById("no-words");
    var reset = document.getElementById("word-reset");
    var entries = Array.prototype.slice.call(document.querySelectorAll(".glossary .entry"));
    var toc = {};
    Array.prototype.forEach.call(document.querySelectorAll(".toc li[data-for]"), function (li) { toc[li.getAttribute("data-for")] = li; });
    function apply() {
      var shown = 0;
      entries.forEach(function (e) {
        var ok = wordMatches(e.getAttribute("data-search"), q.value);
        e.hidden = !ok;
        if (toc[e.id]) toc[e.id].hidden = !ok;
        if (ok) shown++;
      });
      count.textContent = wordCount(shown, entries.length);
      none.hidden = shown > 0;
    }
    q.addEventListener("input", apply);
    reset.addEventListener("click", function () { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); q.focus(); });
    tools.hidden = false;
    apply();
  }

  
  function initStandards() {
    var tools = document.getElementById("std-tools");
    if (!tools) return;
    var q = document.getElementById("std-q");
    var count = document.getElementById("std-count");
    var none = document.getElementById("no-std");
    var reset = document.getElementById("std-reset");
    var entries = Array.prototype.slice.call(document.querySelectorAll(".std"));
    var groups = Array.prototype.slice.call(document.querySelectorAll(".std-group"));
    var opened = []; // group lists the search opened, closed again when the search is cleared
    function apply() {
      var shown = 0;
      var finding = q.value.trim() !== "";
      entries.forEach(function (e) {
        var ok = wordMatches(e.getAttribute("data-search"), q.value);
        e.hidden = !ok;
        if (ok) shown++;
      });
      groups.forEach(function (g) {
        var empty = !g.querySelector(".std:not([hidden])");
        g.hidden = empty;
        var li = document.querySelector('.toc li[data-for="' + g.id + '"]');
        if (li) li.hidden = empty;
        var list = g.querySelector("details.std-fold");
        if (finding && list && !empty && !list.open) { list.open = true; opened.push(list); }
      });
      if (!finding) { opened.forEach(function (d) { d.open = false; }); opened = []; }
      count.textContent = standardCount(shown, entries.length);
      none.hidden = shown > 0;
    }
    q.addEventListener("input", apply);
    reset.addEventListener("click", function () { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); q.focus(); });
    tools.hidden = false;
    apply();
  }

  
  function initClear() {
    var SVG = "http://www.w3.org/2000/svg";
    Array.prototype.forEach.call(document.querySelectorAll('input[type="search"]'), function (input) {
      if (input.classList.contains("has-clear")) return;
      var box = document.createElement("span");
      box.className = "search-box";
      input.parentNode.insertBefore(box, input);
      box.appendChild(input);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "search-clear";
      b.setAttribute("aria-label", "Clear search");
      var svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.5");
      svg.setAttribute("stroke-linecap", "round");
      var path = document.createElementNS(SVG, "path");
      path.setAttribute("d", "M6 6l12 12M18 6L6 18");
      svg.appendChild(path);
      b.appendChild(svg);
      box.appendChild(b);
      input.classList.add("has-clear");
      function sync() { b.hidden = input.value === ""; }
      function clear() {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }
      b.addEventListener("click", clear);
      input.addEventListener("input", sync);
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && input.value !== "") { ev.preventDefault(); clear(); }
      });
      sync();
    });
  }

  function initTheme() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;
    var root = document.documentElement;
    var lang = (root.getAttribute("lang") || "en").slice(0, 2);
    var tip = button.querySelector(".theme-tip");
    var storage = storageOrNull();
    var theme = readTheme(storage);
    function show() {
      button.setAttribute("data-mode", theme);
      button.setAttribute("aria-label", themeLabel(theme, lang));
      if (tip) tip.textContent = (THEME_TEXT[lang] || THEME_TEXT.en).tip + (THEME_TEXT[lang] || THEME_TEXT.en)[theme];
    }
    button.addEventListener("click", function () {
      theme = nextTheme(theme);
      if (theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
      if (storage) writeTheme(storage, theme);
      show();
    });
    show();
    button.hidden = false;
  }

  function initBeta() {
    var close = document.getElementById("beta-close");
    if (!close) return;
    close.addEventListener("click", function () {
      var storage = sessionOrNull();
      if (storage) hideBeta(storage);
      document.documentElement.classList.add("beta-hidden");
      var main = document.getElementById("main");
      if (main) { main.setAttribute("tabindex", "-1"); main.focus(); }
    });
    close.hidden = false;
  }

  
  function reveal(el) {
    var opened = false;
    for (var d = el; d; d = d.parentElement) {
      if (d.tagName === "DETAILS" && !d.open) { d.open = true; opened = true; }
    }
    return opened;
  }

  
  function initFold() {
    var root = document.documentElement;
    try {
      var folds = Array.prototype.slice.call(document.querySelectorAll("details.fold"));
      if (!folds.length) return;
      var target = document.getElementById(hashId(window.location.hash));
      folds.forEach(function (d) { if (!(target && d.contains(target))) d.open = false; });
      if (target) reveal(target); // landTarget() scrolls there once every part of the page is shown
      document.addEventListener("click", function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
        var t = a && document.getElementById(hashId(a.getAttribute("href")));
        if (t) reveal(t); // before the browser follows the link, so it lands on the open part
      });
      window.addEventListener("hashchange", function () {
        var t = document.getElementById(hashId(window.location.hash));
        if (t && reveal(t)) t.scrollIntoView({ block: "start" });
      });
    } finally {
      root.classList.add("fold-ready");
    }
  }

  
  function landTarget() {
    var target = document.getElementById(hashId(window.location.hash));
    if (!target || !target.getClientRects().length) return;
    var top = target.getBoundingClientRect().top;
    var margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
    if (Math.abs(top - margin) > 4) target.scrollIntoView({ block: "start", behavior: "instant" });
  }

  
  function initPermalinks() {
    if (!document.querySelector("a.permalink")) return;
    var live = document.createElement("p");
    live.className = "vh";
    live.setAttribute("role", "status");
    document.body.appendChild(live);
    var timer = null;
    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a.permalink") : null;
      if (!a) return;
      var url = window.location.href.split("#")[0] + a.getAttribute("href");
      var say = function (text, copied) {
        live.textContent = "";
        window.setTimeout(function () { live.textContent = text; }, 50);
        Array.prototype.forEach.call(document.querySelectorAll("a.permalink.is-copied"), function (x) { x.classList.remove("is-copied"); });
        if (copied) {
          a.classList.add("is-copied");
          window.clearTimeout(timer);
          timer = window.setTimeout(function () { a.classList.remove("is-copied"); }, 1800);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { say("Link copied", true); }, function () { say("Link in the address bar", false); });
      } else {
        say("Link in the address bar", false);
      }
    });
  }

  
  function initCalc() {
    var box = document.getElementById("calc");
    if (!box) return;
    var m;
    try { m = JSON.parse(box.getAttribute("data-model")); } catch (e) { return; }
    var el = function (id) { return document.getElementById(id); };
    var form = el("calc-form"), lim = m.limits;
    var fields = {
      dur: el("calc-dur"), unit: el("calc-dur-unit"), video: el("calc-video"), audio: el("calc-audio"),
      links: el("calc-links"), loss: el("calc-loss"), rec: el("calc-rec"), recVideo: el("calc-rec-video")
    };
    var radios = Array.prototype.slice.call(form.querySelectorAll('input[name="calc-mode"]'));
    var mediaHow = el("calc-row-media").querySelector("span");
    var mediaHowText = mediaHow.textContent;
    var last = "";

    function mode() { var r = radios.filter(function (x) { return x.checked; })[0]; return r ? r.value : "bonded"; }

    
    function read() {
      var bad = [];
      var check = function (input, ok, msg) { var fine = ok; input.setAttribute("aria-invalid", fine ? "false" : "true"); if (!fine) bad.push(msg); };
      var dur = readNumber(fields.dur.value), video = readNumber(fields.video.value), audio = readNumber(fields.audio.value);
      var links = readNumber(fields.links.value), loss = readNumber(fields.loss.value);
      var hours = fields.unit.value === "min" ? dur / 60 : dur;
      check(fields.dur, hours > 0 && hours <= lim.hours_max, "Enter a stream length up to " + lim.hours_max + " hours.");
      check(fields.video, video > 0 && video <= lim.video_mbps_max, "Enter a video bitrate between 0 and " + lim.video_mbps_max + " Mbit/s.");
      check(fields.audio, audio >= 0 && audio <= lim.audio_kbps_max, "Enter an audio bitrate up to " + lim.audio_kbps_max + " kbit/s (0 for none).");
      var md = mode();
      if (md === "single") { fields.links.setAttribute("aria-invalid", "false"); links = 1; }
      else check(fields.links, links >= lim.links_min && links <= lim.links_max && Math.floor(links) === links, "Enter " + lim.links_min + " to " + lim.links_max + " links.");
      check(fields.loss, loss >= 0 && loss < lim.loss_pct_max, "Enter a loss below " + lim.loss_pct_max + " %.");
      var rec = null;
      if (fields.rec.checked) {
        var rv = fields.recVideo.value.trim() === "" ? video : readNumber(fields.recVideo.value);
        check(fields.recVideo, rv > 0 && rv <= lim.video_mbps_max, "Enter a recording bitrate between 0 and " + lim.video_mbps_max + " Mbit/s, or leave it empty.");
        rec = rv;
      } else {
        fields.recVideo.setAttribute("aria-invalid", "false");
      }
      return bad.length ? { error: bad[0] } : { hours: hours, video: video, audio: audio, mode: md, links: links, loss: loss, rec: rec };
    }

    function render(announce) {
      var md = mode();
      fields.links.disabled = md === "single";
      el("calc-rec-row").hidden = !fields.rec.checked;
      var v = read();
      var err = el("calc-error");
      if (v.error) {
        err.textContent = v.error;
        err.hidden = false;
        el("calc-out").classList.add("is-stale");
        if (announce) el("calc-status").textContent = v.error;
        return;
      }
      err.hidden = true;
      el("calc-out").classList.remove("is-stale");
      var r = dataUse(m, v.hours, v.video, v.audio, v.mode, v.links, v.loss, v.rec);
      var f = function (b) { return fmtSize(b, m); };
      el("calc-total").textContent = f(r.total);
      el("calc-total-what").textContent = "of mobile data, upload and download together";
      var per = el("calc-per-link");
      if (v.mode === "bonded") {
        per.textContent = "Split evenly over " + r.links + " links: about " + f(r.per_link) + " each. One link can end up carrying most of it, so size each plan for the whole stream.";
      } else if (v.mode === "redundant") {
        per.textContent = "Each of the " + r.links + " links: about " + f(r.per_link) + ". Every link carries the whole stream.";
      } else {
        per.textContent = "All of it on one connection.";
      }
      el("calc-dir").textContent = "Upload " + f(r.up) + ", download " + f(r.down) + ". Plans count both.";
      var recOut = el("calc-rec-out");
      recOut.hidden = r.recording === null;
      recOut.textContent = r.recording === null ? "" : "Recording: " + f(r.recording) + " of storage on the phone or box (MP4). It uses no mobile data.";
      mediaHow.textContent = v.mode === "redundant" ? mediaHowText + ", once for each link" : mediaHowText;
      Object.keys(r.parts).forEach(function (k) {
        el("calc-part-" + k).textContent = f(r.parts[k]);
        el("calc-row-" + k).hidden = k === "keepalives" && v.mode !== "bonded";
      });
      el("calc-part-total").textContent = f(r.total);
      var summary = "Data used: " + f(r.total) + ". " + per.textContent;
      if (announce && summary !== last) { el("calc-status").textContent = summary; last = summary; }
    }

    form.addEventListener("submit", function (ev) { ev.preventDefault(); render(true); });
    form.addEventListener("input", function () { render(false); });
    form.addEventListener("change", function () { render(true); });
    box.hidden = false;
    var nojs = el("calc-nojs");
    if (nojs) nojs.hidden = true;
    render(false);
  }

  function start() { initFold(); initTheme(); initBeta(); init(); initWords(); initStandards(); initClear(); initPermalinks(); initCalc(); landTarget(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();


(function () {
  "use strict";

  
  function norm(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  
  function rowMatches(search, q) {
    var hay = norm(search);
    return norm(q).split(/\s+/).filter(Boolean).every(function (piece) { return hay.indexOf(piece) !== -1; });
  }

  
  function oldHelpTarget(raw) {
    var m = /^ask-([a-z0-9-]+)$/.exec(raw);
    if (m) return "links.html#" + m[1];
    if (raw === "where-to-ask") return "links.html";
    if (raw.indexOf("=") === -1) return null;
    var part = /(?:^|&)part=([a-z]+)(?:&|$)/.exec(raw);
    if (part) return "#guides-" + part[1];
    var q = /(?:^|&)q=([^&]*)/.exec(raw);
    if (q) { try { return "#guides?q=" + decodeURIComponent(q[1].replace(/\+/g, " ")).slice(0, 80); } catch (e) { return "#guides"; } }
    return "#guides";
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { rowMatches: rowMatches, oldHelpTarget: oldHelpTarget };
    return;
  }

  try { window.localStorage.removeItem("osb.stack.v1"); } catch (e) {  }

  function initHelp() {
    var page = document.querySelector(".help-page");
    if (!page) return;
    var start = "";
    var old = oldHelpTarget(window.location.hash.replace(/^#/, ""));
    if (old && old.charAt(0) !== "#") { window.location.replace(old); return; }
    if (old) { // a same-page replace, so the new anchor becomes the :target (a filter) without a history entry
      var bits = old.split("?q=");
      start = bits[1] || "";
      window.location.replace(document.getElementById(bits[0].slice(1)) ? bits[0] : "#guides");
    }
    var search = document.getElementById("dir-search");
    if (!search) return;
    var q = document.getElementById("dir-q");
    var count = document.getElementById("dir-count");
    var none = document.getElementById("dir-none");
    var rows = Array.prototype.slice.call(page.querySelectorAll(".dir-row"));
    var picks = Array.prototype.slice.call(page.querySelectorAll(".dir-pick"));

    function shown(li) { return !li.hidden && window.getComputedStyle(li).display !== "none"; }
    function apply() {
      rows.forEach(function (li) { li.hidden = !rowMatches(li.getAttribute("data-search") || "", q.value.trim()); });
      var n = rows.filter(shown).length;
      none.hidden = n > 0;
      count.textContent = n && n < rows.length ? "Showing " + n + " of " + rows.length + " guides." : "";
    }
    function openTarget() {
      var id = window.location.hash.replace(/^#/, "");
      var row = /^[a-z0-9-]+$/.test(id) ? document.getElementById(id) : null;
      if (row && row.classList.contains("dir-row")) { var d = row.querySelector(".dir-more"); if (d) d.open = true; }
    }
    function reset() {
      q.value = "";
      if (/^#(guides-|for-|kind-)/.test(window.location.hash)) window.location.replace("#guides");
      apply();
    }

    q.addEventListener("input", apply);
    none.querySelector("button").addEventListener("click", function () { reset(); q.focus(); });
    picks.forEach(function (d) {
      d.addEventListener("click", function (ev) { if (ev.target.closest("ul a")) d.open = false; });
    });

    window.addEventListener("hashchange", function () { openTarget(); window.requestAnimationFrame(apply); });
    search.hidden = false;
    q.value = start;
    openTarget();
    apply();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHelp);
  else initHelp();
})();
