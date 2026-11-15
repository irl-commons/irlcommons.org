
(function () {
  "use strict";

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

  function shownTheme(theme, systemDark) {
    return theme === "dark" || theme === "light" ? theme : (systemDark ? "dark" : "light");
  }

  function nextTheme(theme, systemDark) {
    return shownTheme(theme, systemDark) === "dark" ? "light" : "dark";
  }

  var THEME_TEXT = {
    en: { dark: "dark", light: "light", to: "Switch to ", theme: " theme" },
    de: { dark: "dunkel", light: "hell", to: "Wechseln zu ", theme: "" }
  };

  function themeLabel(next, lang) {
    var t = THEME_TEXT[lang] || THEME_TEXT.en;
    return t.to + t[next] + t.theme;
  }

  function storageOrNull() {
    try { return window.localStorage; } catch (e) { return null; }
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

  }

  function norm(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function wordMatches(haystack, query) {
    var hay = norm(haystack);
    return norm(query).split(/\s+/).filter(Boolean).every(function (piece) { return hay.indexOf(piece) !== -1; });
  }

  // Glossary count: a short "12 / 31" on screen, "12 of 31 words" for screen readers.
  function wordCount(shown, total) {
    return { shown: shown + " / " + total, said: shown + " of " + total + " words" };
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

  var api = { hashId: hashId, movedUrl: movedUrl, MODES: MODES, dataUse: dataUse, fmtSize: fmtSize, readNumber: readNumber, THEME_KEY: THEME_KEY, readTheme: readTheme, writeTheme: writeTheme, shownTheme: shownTheme, nextTheme: nextTheme, themeLabel: themeLabel, norm: norm, wordMatches: wordMatches, wordCount: wordCount, standardCount: standardCount };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }

  function initWords() {
    var tools = document.getElementById("word-tools");
    if (!tools) return;
    var q = document.getElementById("word-q");
    var count = document.getElementById("word-count");
    var entries = Array.prototype.slice.call(document.querySelectorAll(".glossary .entry"));
    var toc = {};
    Array.prototype.forEach.call(document.querySelectorAll(".toc li[data-for]"), function (li) { toc[li.getAttribute("data-for")] = li; });
    var seen = document.createElement("span");
    seen.setAttribute("aria-hidden", "true");
    var said = document.createElement("span");
    said.className = "vh";
    count.appendChild(seen);
    count.appendChild(said);
    function apply() {
      var shown = 0;
      entries.forEach(function (e) {
        var ok = wordMatches(e.getAttribute("data-search"), q.value);
        e.hidden = !ok;
        if (toc[e.id]) toc[e.id].hidden = !ok;
        if (ok) shown++;
      });
      var c = wordCount(shown, entries.length);
      seen.textContent = c.shown;
      said.textContent = c.said;
    }
    // A deep link (#word, or #word-more for its further reading) always lands: a search that hides the word is
    // cleared, the word's "More" opens when the link points into it, and the word is highlighted for a moment.
    function show(id, scroll) {
      var t = id && document.getElementById(id);
      var entry = t && t.closest ? t.closest(".glossary .entry") : null;
      if (!entry) return;
      if (entry.hidden) { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); }
      if (t.tagName === "DETAILS") t.open = true;
      else reveal(t);
      entry.classList.remove("is-landed");
      void entry.offsetWidth; // restart the highlight when the same word is linked again
      entry.classList.add("is-landed");
      if (scroll) t.scrollIntoView({ block: "start" });
    }
    q.addEventListener("input", apply);
    tools.hidden = false;
    apply();
    show(hashId(window.location.hash), false); // landTarget() scrolls there once the page is set up
    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = hashId(a.getAttribute("href"));
      // The same address again fires no hashchange, so this covers it too.
      if (id && id === hashId(window.location.hash)) { ev.preventDefault(); show(id, true); }
      else show(id, false);
    });
    window.addEventListener("hashchange", function () { show(hashId(window.location.hash), true); });
    entries.forEach(function (e) { e.addEventListener("animationend", function () { e.classList.remove("is-landed"); }); });
  }

  function initStandards() {
    var tools = document.getElementById("std-tools");
    if (!tools) return;
    var q = document.getElementById("std-q");
    var count = document.getElementById("std-count");
    var none = document.getElementById("no-std");
    var reset = document.getElementById("std-reset");
    var entries = Array.prototype.slice.call(document.querySelectorAll(".std, .block"));
    var groups = Array.prototype.slice.call(document.querySelectorAll(".std-group, #building-blocks"));
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
        var empty = !g.querySelector(".std:not([hidden]), .block:not([hidden])");
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
    var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function systemDark() { return !!(media && media.matches); }
    function show() {
      var next = nextTheme(theme, systemDark());
      button.setAttribute("data-mode", next);
      button.setAttribute("aria-label", themeLabel(next, lang));
      if (tip) tip.textContent = themeLabel(next, lang);
    }
    button.addEventListener("click", function () {
      theme = nextTheme(theme, systemDark());
      root.setAttribute("data-theme", theme);
      if (storage) writeTheme(storage, theme);
      show();
    });
    if (media && media.addEventListener) media.addEventListener("change", show);
    show();
    button.hidden = false;
  }

  function initBeta() {
    var badge = document.querySelector(".beta-badge");
    var tip = document.getElementById("beta-tip");
    if (!badge || !tip || typeof tip.showPopover !== "function") return;
    var wrap = badge.parentNode;
    var pinned = false, timer = null;
    badge.removeAttribute("popovertarget"); // script handles clicks, so a click after hovering keeps the note open
    badge.setAttribute("aria-expanded", "false");
    function isOpen() { try { return tip.matches(":popover-open"); } catch (e) { return false; } }
    function place() {
      if (window.CSS && CSS.supports && CSS.supports("anchor-name: --beta")) return;
      var r = badge.getBoundingClientRect();
      tip.style.top = Math.round(r.bottom + 6) + "px";
      tip.style.left = Math.max(16, Math.min(Math.round(r.left), window.innerWidth - tip.offsetWidth - 16)) + "px";
    }
    function open(pin) {
      window.clearTimeout(timer);
      if (pin) pinned = true;
      if (!isOpen()) { try { tip.showPopover(); } catch (e) { return; } }
      place();
    }
    function close() { pinned = false; if (isOpen()) { try { tip.hidePopover(); } catch (e) {} } }
    function later() { window.clearTimeout(timer); timer = window.setTimeout(function () { if (!pinned && !wrap.matches(":hover") && !wrap.contains(document.activeElement)) close(); }, 200); }
    badge.addEventListener("click", function () { if (isOpen() && pinned) close(); else open(true); });
    wrap.addEventListener("mouseenter", function () { open(false); });
    wrap.addEventListener("mouseleave", later);
    badge.addEventListener("focus", function () { open(false); });
    wrap.addEventListener("focusout", later);
    tip.addEventListener("toggle", function (ev) {
      var on = ev.newState === "open";
      if (!on) pinned = false;
      badge.setAttribute("aria-expanded", on ? "true" : "false");
    });
    window.addEventListener("resize", function () { if (isOpen()) place(); });
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

  function start() { initFold(); initTheme(); initBeta(); initWords(); initStandards(); initClear(); initPermalinks(); initCalc(); landTarget(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

(function () {
  "use strict";

  // Help, the guide directory: filters by part of the chain, kind and product, plus search. Without script each
  // filter is a link to an empty anchor and help-filters.css hides the rest; with script they combine, the search
  // and the filters live in the address (reload and links keep them), and the count says what shows.
  var GROUPS = [["part", "guides-"], ["kind", "kind-"], ["for", "for-"]];

  function norm(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function rowMatches(search, q) {
    var hay = norm(search);
    return norm(q).split(/\s+/).filter(Boolean).every(function (piece) { return hay.indexOf(piece) !== -1; });
  }

  // "#guides-obs", "#kind-video", "#for-moblin", or several at once: "#guides?part=obs&kind=video&for=moblin&q=mob".
  // Older addresses still land: "#part=obs&problem=…", "#q=moblin", "#stack=moblin,irl-pro", "#ask-moblin".
  function parseState(hash) {
    var raw = String(hash || "").replace(/^#/, "");
    var st = { part: "", kind: "", for: "", q: "", row: "", away: "" };
    var ask = /^ask-([a-z0-9-]+)$/.exec(raw);
    if (ask) { st.away = "links.html#" + ask[1]; return st; }
    if (raw === "where-to-ask") { st.away = "links.html"; return st; }
    var single = /^(guides-|kind-|for-)([a-z0-9-]+)$/.exec(raw);
    if (single) { st[{ "guides-": "part", "kind-": "kind", "for-": "for" }[single[1]]] = single[2]; return st; }
    var query = raw.indexOf("?") !== -1 ? raw.slice(raw.indexOf("?") + 1) : (raw.indexOf("=") !== -1 ? raw : "");
    if (!query) { if (/^[a-z0-9-]+$/.test(raw) && raw !== "guides") st.row = raw; return st; }
    query.split("&").forEach(function (pair) {
      var i = pair.indexOf("="); if (i < 1) return;
      var k = pair.slice(0, i), v = pair.slice(i + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return; }
      if (k === "part" || k === "kind" || k === "for") { if (/^[a-z0-9-]+$/.test(v)) st[k] = v; }
      else if (k === "q") st.q = v.slice(0, 80);
      else if (k === "stack" && !st.for) st.for = (v.split(",")[0] || "").replace(/[^a-z0-9-]/g, "");
    });
    return st;
  }

  function stateHash(st) {
    var set = GROUPS.filter(function (g) { return st[g[0]]; });
    if (!st.q && set.length === 0) return "#guides";
    if (!st.q && set.length === 1) return "#" + set[0][1] + st[set[0][0]];
    var parts = set.map(function (g) { return g[0] + "=" + st[g[0]]; });
    if (st.q) parts.push("q=" + encodeURIComponent(st.q));
    return "#guides?" + parts.join("&");
  }

  function countText(shown, total, filtered) {
    if (!filtered) return "Showing all " + total + " guides.";
    if (shown === 0) return "No guide matches.";
    return "Showing " + shown + " of " + total + " guide" + (total === 1 ? "" : "s") + ".";
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { rowMatches: rowMatches, parseState: parseState, stateHash: stateHash, countText: countText };
    return;
  }

  try { window.localStorage.removeItem("osb.stack.v1"); } catch (e) {  }

  function initHelp() {
    var page = document.querySelector(".help-page");
    if (!page || !document.querySelector(".ix-rows")) return;
    var first = parseState(window.location.hash);
    if (first.away) { window.location.replace(first.away); return; }
    var search = document.getElementById("dir-search");
    var q = document.getElementById("dir-q");
    var count = document.getElementById("dir-count");
    var none = document.getElementById("dir-none");
    var prod = document.getElementById("by-product");
    var cur = prod ? prod.querySelector(".fcur") : null;
    var rows = Array.prototype.slice.call(page.querySelectorAll(".ix-row"));
    var links = Array.prototype.slice.call(page.querySelectorAll("a[data-f]"));
    var known = {};
    links.forEach(function (a) { known[a.getAttribute("data-f")] = a; });
    var st = { part: "", kind: "", for: "", q: "" };

    function take(next) {
      GROUPS.forEach(function (g) { st[g[0]] = next[g[0]] && known[g[1] + next[g[0]]] ? next[g[0]] : ""; });
      st.q = next.q || "";
      q.value = st.q;
    }
    function rowOk(li) {
      if (st.part && (" " + li.getAttribute("data-p") + " ").indexOf(" " + st.part + " ") === -1) return false;
      if (st.kind && li.getAttribute("data-k") !== st.kind) return false;
      if (st.for && (" " + li.getAttribute("data-c") + " ").indexOf(" " + st.for + " ") === -1) return false;
      return rowMatches(li.getAttribute("data-search") || "", st.q.trim());
    }
    function syncUrl() {
      var h = stateHash(st);
      if (h === window.location.hash || (h === "#guides" && !window.location.hash)) return;
      try { window.history.replaceState(window.history.state, "", h === "#guides" ? window.location.pathname + window.location.search : h); } catch (e) {  }
    }
    function apply(write) {
      var shown = 0;
      rows.forEach(function (li) { var ok = rowOk(li); li.hidden = !ok; if (ok) shown++; });
      links.forEach(function (a) {
        var f = a.getAttribute("data-f"), on = GROUPS.some(function (g) { return st[g[0]] && g[1] + st[g[0]] === f; });
        a.classList.toggle("is-on", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
      if (cur) cur.textContent = st.for && known["for-" + st.for] ? known["for-" + st.for].firstChild.textContent.trim() : "";
      var fsum = prod ? prod.querySelector(".fsum") : null;
      if (fsum) fsum.hidden = !!(st.for && known["for-" + st.for]);
      var filtered = !!(st.part || st.kind || st.for || st.q.trim());
      count.textContent = "";
      count.appendChild(document.createTextNode(countText(shown, rows.length, filtered)));
      if (filtered) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "btn"; b.textContent = "Clear filters";
        b.addEventListener("click", function () { reset(); q.focus(); });
        count.appendChild(b);
      }
      none.hidden = shown > 0;
      if (write) syncUrl();
    }
    function reset() { take({}); apply(true); }
    function openRow(id) {
      var row = id && /^[a-z0-9-]+$/.test(id) ? document.getElementById(id) : null;
      if (row && row.classList.contains("ix-row")) { var d = row.querySelector(".ix-more"); if (d) d.open = true; }
    }

    page.classList.add("ix-js");
    page.querySelector(".fnote-all").hidden = true;
    count.hidden = false;
    links.forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var f = a.getAttribute("data-f");
        GROUPS.forEach(function (g) { if (f.indexOf(g[1]) === 0) st[g[0]] = st[g[0]] === f.slice(g[1].length) ? "" : f.slice(g[1].length); });
        if (prod && prod.contains(a)) prod.open = false;
        apply(true);
      });
    });
    q.addEventListener("input", function () { st.q = q.value; apply(true); });
    none.querySelector("button").addEventListener("click", function () { reset(); q.focus(); });
    // A click anywhere on a row that isn't a link opens or closes its details, like the whole-row disclosure of Index B.
    rows.forEach(function (li) {
      li.addEventListener("click", function (ev) {
        if (ev.target.closest("a, summary, button, input, .ix-body")) return;
        var d = li.querySelector(".ix-more"); if (d) d.open = !d.open;
      });
    });
    window.addEventListener("hashchange", function () {
      var next = parseState(window.location.hash);
      if (next.away) { window.location.replace(next.away); return; }
      if (next.row) { openRow(next.row); return; }
      take(next); apply(/=/.test(window.location.hash));
    });
    search.hidden = false;
    take(first);
    openRow(first.row);
    apply(/=/.test(window.location.hash)); // an older address is rewritten to today's form; a row's own anchor stays
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHelp);
  else initHelp();
})();
