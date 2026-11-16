
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

  // The phone platform an answer's iPhone/Android switch starts on; iPhone when the visitor's isn't offered or known.
  function pickPlatform(ua, offered) {
    var mine = /Android/i.test(ua || "") ? "android" : "ios";
    return offered.indexOf(mine) >= 0 ? mine : offered[0];
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

  var api = { hashId: hashId, pickPlatform: pickPlatform, movedUrl: movedUrl, MODES: MODES, dataUse: dataUse, fmtSize: fmtSize, readNumber: readNumber, THEME_KEY: THEME_KEY, readTheme: readTheme, writeTheme: writeTheme, shownTheme: shownTheme, nextTheme: nextTheme, themeLabel: themeLabel, norm: norm, wordMatches: wordMatches, wordCount: wordCount, standardCount: standardCount };
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
      count.textContent = shown ? standardCount(shown, entries.length) : "Nothing matches that.";
      if (finding) {
        var reset = document.createElement("button");
        reset.type = "button"; reset.className = "filter-reset"; reset.textContent = "Clear filters";
        reset.addEventListener("click", function () { q.value = ""; apply(); q.focus(); });
        count.appendChild(reset);
      }
    }
    q.addEventListener("input", apply);
    tools.hidden = false;
    apply();
  }

  function initClear() {
    var SVG = "http://www.w3.org/2000/svg";
    Array.prototype.forEach.call(document.querySelectorAll('input[type="search"]'), function (input) {
      if (input.classList.contains("has-clear") || input.id === "dir-q" || input.id === "std-q") return;
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

  // An answer's iPhone/Android lists become a two-button switch that starts on the visitor's own platform.
  // Without script both lists show, each under its name. Apps for both platforms are in both lists.
  function initPlatforms() {
    Array.prototype.forEach.call(document.querySelectorAll(".plats"), function (box) {
      var seg = box.querySelector(".seg");
      var lists = Array.prototype.slice.call(box.querySelectorAll(".plat"));
      var buttons = Array.prototype.slice.call(seg.querySelectorAll("button"));
      var offered = buttons.map(function (b) { return b.getAttribute("data-platform"); });
      function pick(p) {
        buttons.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-platform") === p ? "true" : "false"); });
        lists.forEach(function (l) { l.hidden = l.getAttribute("data-platform") !== p; });
      }
      buttons.forEach(function (b) { b.addEventListener("click", function () { pick(b.getAttribute("data-platform")); }); });
      box.classList.add("is-switch");
      seg.hidden = false;
      pick(pickPlatform(navigator.userAgent, offered));
    });
  }

  // A "Back" link with data-back="history" returns to the step the visitor came from on this page. The site sends
  // no referrer, so arriving from anywhere else (or without script) the link follows its href to the cards.
  function initBack() {
    if (!document.querySelector('a[data-back="history"]')) return;
    // Count the steps taken inside this page in the history entries themselves, so Back and Forward keep it right.
    var depth = function () { var s = window.history.state; return s && typeof s.backDepth === "number" ? s.backDepth : null; };
    var mark = function (n) {
      var s = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      var next = {}; for (var k in s) next[k] = s[k];
      next.backDepth = n;
      try { window.history.replaceState(next, ""); } catch (e) {  }
    };
    var last = depth();
    if (last === null) { last = 0; mark(0); }
    window.addEventListener("hashchange", function () {
      var d = depth();
      if (d === null) { d = last + 1; mark(d); }
      last = d;
    });
    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[data-back="history"]') : null;
      if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (!(depth() > 0)) return;
      ev.preventDefault();
      window.history.back();
    });
  }

  function start() { initFold(); initBack(); initPlatforms(); initTheme(); initBeta(); initWords(); initStandards(); initClear(); initPermalinks(); initCalc(); landTarget(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

(function () {
  "use strict";

  // Help, "My apps": the page lists every app (four part boxes, A-Z) and every guide in its HTML. With script this adds
  // the "Find your app" search, saving apps on this device (localStorage, nothing leaves the browser), the full app card
  // (a bottom sheet on a phone, a dialog on a computer), "Share link" (a #stack= link), the Help and Guides tabs
  // and the guide filters. Older addresses still land: #for-<app>, #guides-<part>, #kind-<kind>, #guides?part=…&q=…,
  // #ask-<app> (opens its card), #where-to-ask and a guide's own id.
  var KEY = "howtoirl.myapps";
  var STEPS = [["sender", "Camera and sender"], ["connections", "Connections"], ["receiver", "Receiver or cloud"], ["tools", "OBS and tools"]];
  var OLD_PART = { camera: "sender", sender: "sender", connections: "connections", receiver: "receiver", platform: "receiver", obs: "tools", tools: "tools" };
  var KINDS = [["article", "Articles"], ["video", "Videos"], ["docs", "Docs"]];
  var SRC = [["own", "How to IRL"], ["other", "Apps and community"]];
  var HELP_IDS = { "start-here": 1, "where-to-ask": 1, "my-stack": 1, listed: 1 };

  // Typo-tolerant matching, word by word: skipped letters, one wrong, missing, extra or swapped letter, and names
  // typed without their spaces or dots ("irlpro", "streamerbot").
  function inOrder(q, w) {
    var j = 0, gaps = 0, last = -1;
    for (var i = 0; i < q.length; i++) {
      var p = w.indexOf(q[i], j);
      if (p < 0) return 0;
      if (last >= 0) gaps += p - last - 1;
      last = p; j = p + 1;
    }
    return gaps <= q.length ? 100 - gaps * 4 : 0;
  }
  function oneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; }
      else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  function fuzzy(q, s) {
    q = String(q || "").toLowerCase().trim(); s = String(s || "").toLowerCase();
    if (!q) return 1;
    var k = s.indexOf(q);
    if (k >= 0) return 200 - k;
    var sq = q.replace(/[^a-z0-9]/g, ""), ss = s.replace(/[^a-z0-9]/g, "");
    if (sq && ss.indexOf(sq) !== -1) return 150;
    // Several words: each one has to match on its own ("obs studo").
    var words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      return words.reduce(function (low, w) { return Math.min(low, fuzzy(w, s)); }, Infinity);
    }
    var best = 0;
    s.split(/[^a-z0-9+]+/).forEach(function (w) {
      if (!w) return;
      var sc = Math.max(inOrder(q, w), (q.length > 3 && oneEdit(q, w.slice(0, q.length + 1))) || oneEdit(q, w) ? 90 : 0);
      if (sc > best) best = sc;
    });
    return best;
  }

  // What an address asks for. tab: "help" or "guides"; stack: the apps of a shared link; f: guide filters;
  // open: an app card to open; row: an element to scroll to.
  function parseHash(hash) {
    var raw = String(hash || "").replace(/^#/, "");
    var out = { tab: "", stack: null, f: null, open: "", row: "" };
    if (!raw) return out;
    var stack = /(?:^|[?&])stack=([a-z0-9,-]*)/.exec(raw);
    if (stack) { out.tab = "help"; out.stack = stack[1].split(",").filter(Boolean); return out; }
    var ask = /^ask-([a-z0-9-]+)$/.exec(raw);
    if (ask) { out.tab = "help"; out.open = ask[1]; return out; }
    var app = /^app-([a-z0-9-]+)$/.exec(raw);
    if (app) { out.tab = "help"; out.row = raw; return out; }
    if (HELP_IDS[raw]) { out.tab = "help"; out.row = raw === "start-here" || raw === "my-stack" ? "" : raw; return out; }
    var f = { src: "", st: "", k: "", app: "", q: "" };
    var one = /^(guides-|kind-|for-)([a-z0-9-]+)$/.exec(raw);
    if (one) {
      if (one[1] === "guides-") f.st = OLD_PART[one[2]] || "";
      else if (one[1] === "kind-") f.k = one[2];
      else f.app = one[2];
      out.tab = "guides"; out.f = f; return out;
    }
    if (raw === "guides") { out.tab = "guides"; out.f = f; return out; }
    var query = raw.indexOf("?") !== -1 ? raw.slice(raw.indexOf("?") + 1) : (raw.indexOf("=") !== -1 ? raw : "");
    if (query) {
      query.split("&").forEach(function (pair) {
        var i = pair.indexOf("="); if (i < 1) return;
        var key = pair.slice(0, i), v = pair.slice(i + 1);
        try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return; }
        if (key === "part") f.st = OLD_PART[v] || "";
        else if ((key === "kind" || key === "for") && /^[a-z0-9-]+$/.test(v)) f[key === "kind" ? "k" : "app"] = v;
        else if (key === "from" && (v === "own" || v === "other")) f.src = v;
        else if (key === "q") f.q = v.slice(0, 80);
      });
      out.tab = "guides"; out.f = f; return out;
    }
    if (/^[a-z0-9-]+$/.test(raw)) out.row = raw;
    return out;
  }

  // The address for a set of guide filters: "#guides", one filter as its own anchor, or "#guides?…".
  function guidesHash(f) {
    var set = [];
    if (f.src) set.push(["from", f.src, ""]);
    if (f.st) set.push(["part", f.st, "guides-"]);
    if (f.k) set.push(["kind", f.k, "kind-"]);
    if (f.app) set.push(["for", f.app, "for-"]);
    if (!f.q && set.length === 0) return "#guides";
    if (!f.q && set.length === 1 && set[0][2]) return "#" + set[0][2] + set[0][1];
    var parts = set.map(function (x) { return x[0] + "=" + x[1]; });
    if (f.q) parts.push("q=" + encodeURIComponent(f.q));
    return "#guides?" + parts.join("&");
  }

  function countText(shown, total) {
    return shown === total ? "All " + total + " guides" : shown + " of " + total + " guides";
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { fuzzy: fuzzy, parseHash: parseHash, guidesHash: guidesHash, countText: countText };
    return;
  }

  try { window.localStorage.removeItem("osb.stack.v1"); } catch (e) {  }

  function toTop() { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }

  function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function init() {
    var page = document.querySelector(".myapps");
    if (!page) return;
    var $ = function (id) { return document.getElementById(id); };
    var apps = {}, order = [];
    Array.prototype.forEach.call(page.querySelectorAll(".row[data-id]"), function (li) {
      var links = [], guides = 0;
      Array.prototype.forEach.call(li.querySelectorAll(".row-x a"), function (a) {
        if (a.hasAttribute("data-g")) guides = parseInt(a.textContent, 10) || 0;
        else links.push({ t: a.getAttribute("data-ct"), u: a.getAttribute("href") });
      });
      var id = li.getAttribute("data-id");
      apps[id] = { id: id, st: li.getAttribute("data-st"), n: li.querySelector(".rn-n").textContent, pl: li.getAttribute("data-pl"),
        ini: li.querySelector(".tile").textContent, chans: links.filter(function (l) { return l.t !== "Website"; }),
        web: (links.filter(function (l) { return l.t === "Website"; })[0] || {}).u || "", guides: guides, row: li };
      order.push(id);
      // The name opens the full card; the extra links move into it.
      var rn = li.querySelector(".rn"), b = document.createElement("button");
      b.type = "button"; b.className = "rn"; b.setAttribute("data-open", id);
      b.innerHTML = '<span class="rn-n">' + esc(apps[id].n) + "</span>" + rn.querySelector("small").outerHTML;
      rn.parentNode.replaceChild(b, rn);
    });
    var known = function (ids) { return (ids || []).filter(function (id, i, all) { return apps[id] && all.indexOf(id) === i; }); };

    var storage = null;
    try { storage = window.localStorage; } catch (e) {  }
    var mine = [];
    try { mine = known(JSON.parse((storage && storage.getItem(KEY)) || "[]")); } catch (e) { mine = []; }
    function save() { try { if (mine.length) storage.setItem(KEY, JSON.stringify(mine)); else storage.removeItem(KEY); } catch (e) {  } }
    var shared = null, showing = "mine";
    var cur = function () { return showing === "shared" ? shared : mine; };
    var has = function (id) { return cur().indexOf(id) !== -1; };

    page.classList.add("ma-js");
    Array.prototype.forEach.call(page.querySelectorAll(".search, .filters, .tog"), function (el) { el.hidden = false; });

    // Tabs
    var nav = page.querySelector(".tabs"), tabs = [$("t-help"), $("t-guides")], panels = [$("start-here"), $("guides")];
    nav.setAttribute("role", "tablist"); nav.removeAttribute("aria-label");
    tabs.forEach(function (t, i) {
      t.setAttribute("role", "tab"); t.setAttribute("aria-controls", panels[i].id);
      panels[i].setAttribute("role", "tabpanel");
    });
    var active = "help";
    function tab(name, focus) {
      active = name;
      tabs.forEach(function (t, i) {
        var on = (i === 0) === (name === "help");
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tabs[name === "help" ? 0 : 1].focus();
    }
    function address(h) {
      var want = h || window.location.pathname + window.location.search;
      try { window.history.replaceState(window.history.state, "", want); } catch (e) {  }
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function (ev) {
        ev.preventDefault();
        tab(i === 0 ? "help" : "guides");
        address(i === 0 ? "" : guidesHash(gfHash()));
        toTop();
      });
      t.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Home" && ev.key !== "End") return;
        ev.preventDefault();
        var next = ev.key === "Home" ? 0 : ev.key === "End" ? 1 : 1 - i;
        tabs[next].click(); tabs[next].focus();
      });
    });

    // Cards
    function togHtml(a, small) {
      var on = has(a.id);
      return '<button type="button" class="tog' + (small ? " sm" : "") + '" data-t="' + a.id + '" aria-pressed="' + on + '" aria-label="Add ' + esc(a.n) + ' to my apps">' + (on ? "✓" : "+") + "</button>";
    }
    function card(a, full, nameId) {
      var chans = full ? a.chans : a.chans.slice(0, 1);
      var acts = chans.map(function (c, k) { return '<a' + (k === 0 ? ' class="p"' : "") + ' href="' + esc(c.u) + '">' + esc(c.t) + "</a>"; });
      if (a.guides) acts.push('<button type="button" data-g="' + a.id + '">' + a.guides + " guide" + (a.guides > 1 ? "s" : "") + "</button>");
      if (a.web) acts.push('<a' + (chans.length ? "" : ' class="p"') + ' href="' + esc(a.web) + '">Website</a>');
      return '<div class="card' + (full ? " full" : "") + '" data-id="' + a.id + '"><div class="head"><span class="tile s-' + a.st + '" aria-hidden="true">' + esc(a.ini) + "</span>" +
        '<div class="ct"><b' + (nameId ? ' id="' + nameId + '"' : "") + ">" + esc(a.n) + "</b><small>" + esc(a.pl) + "</small></div>" + togHtml(a) + "</div>" +
        '<div class="acts">' + acts.join("") + "</div></div>";
    }

    var q = $("q"), results = $("results"), boxes = $("where-to-ask"), nomatch = $("nomatch");
    function renderMine() {
      var list = cur(), searching = !!q.value.trim();
      var differs = shared && shared.join() !== mine.join();
      $("shared").hidden = !differs;
      $("keep").hidden = showing !== "shared";
      $("flip").textContent = showing === "shared" ? "Show mine" : "Show shared";
      $("my-stack").hidden = !list.length || searching;
      $("mine-h").textContent = showing === "shared" ? "Shared apps" : "My apps";
      $("mine-grid").innerHTML = list.map(function (id) { return card(apps[id], true); }).join("");
      $("saved").hidden = $("clear").hidden = showing === "shared";
      if (!list.length && !popEl.hidden) pop(false);
    }
    function renderSearch() {
      var text = q.value.trim();
      boxes.hidden = !!text; results.hidden = !text;
      if (!text) { results.innerHTML = ""; nomatch.hidden = true; return; }
      var html = "", hits = 0;
      STEPS.forEach(function (s) {
        var its = order.filter(function (id) { return apps[id].st === s[0]; })
          .map(function (id) { return [fuzzy(text, apps[id].n + " " + id), apps[id]]; })
          .filter(function (x) { return x[0] > 0; }).sort(function (x, y) { return y[0] - x[0]; });
        if (!its.length) return;
        hits += its.length;
        html += '<h2 class="rh"><span class="dot s-' + s[0] + '" aria-hidden="true"></span>' + s[1] + '</h2><div class="grid">' + its.map(function (x) { return card(x[1], false); }).join("") + "</div>";
      });
      results.innerHTML = html;
      nomatch.hidden = hits > 0;
    }
    function syncToggles() {
      Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (b) {
        var on = has(b.getAttribute("data-t"));
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.textContent = on ? "✓" : "+";
        var row = b.closest(".row"); if (row) row.classList.toggle("on", on);
      });
    }
    function render() { renderMine(); renderSearch(); syncToggles(); renderGuides(); fades(); }

    var tt;
    function toast(t) {
      var e = $("toast"); e.textContent = t; e.classList.add("on");
      clearTimeout(tt); tt = setTimeout(function () { e.classList.remove("on"); }, 1600);
    }

    // The full card: a bottom sheet on a phone, a dialog on a computer. Esc, × and a tap outside close it.
    var sheet = $("sheet"), opener = null;
    function openCard(id, from) {
      if (!apps[id]) return;
      opener = from || null;
      $("sheet-body").innerHTML = card(apps[id], true, "sheet-name");
      if (typeof sheet.showModal === "function") { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute("open", "");
      $("sheet-x").focus();
    }
    function closeCard() { if (sheet.open) { if (typeof sheet.close === "function") sheet.close(); else { sheet.removeAttribute("open"); afterClose(); } } }
    function afterClose() { if (opener && document.body.contains(opener)) opener.focus(); opener = null; }
    sheet.addEventListener("close", afterClose);

    // Share link: copies the #stack= link and shows it in a popover at the button. "Share" beside it opens the
    // phone's own share sheet, only where the browser has one.
    var shareBtn = $("share"), popEl = $("share-pop"), shareUrlEl = $("share-url");
    function shareUrl() { return window.location.origin + window.location.pathname + "#stack=" + cur().join(","); }
    function pop(on, copied) {
      popEl.hidden = !on; shareBtn.setAttribute("aria-expanded", on ? "true" : "false");
      if (!on) return;
      var msg = $("share-msg");
      msg.textContent = "";
      setTimeout(function () { msg.innerHTML = "<b>" + (copied ? "Link copied." : "Copy this link.") + "</b> Anyone with it sees these apps and where to get help."; }, 30);
      shareUrlEl.scrollLeft = 0;
      if (!copied) shareUrlEl.focus();
    }
    function copyLink() {
      var url = shareUrl();
      shareUrlEl.value = url;
      var fallback = function () {
        popEl.hidden = false;
        shareUrlEl.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        pop(true, ok);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { pop(true, true); }, fallback);
      else fallback();
    }
    shareBtn.addEventListener("click", function () { if (popEl.hidden) copyLink(); else pop(false); });
    shareUrlEl.addEventListener("focus", function () { shareUrlEl.select(); });
    shareUrlEl.addEventListener("mouseup", function (e) { e.preventDefault(); });
    $("nshare").hidden = typeof navigator.share !== "function";
    $("nshare").addEventListener("click", function () {
      try { navigator.share({ title: "IRL apps", url: shareUrl() }).catch(function () {  }); } catch (e) {  }
    });
    document.addEventListener("click", function (e) { if (!popEl.hidden && !e.target.closest(".share-wrap")) pop(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !popEl.hidden) { pop(false); shareBtn.focus(); } });

    $("clear").addEventListener("click", function () { mine = []; save(); render(); toast("Cleared"); q.focus(); });
    $("keep").addEventListener("click", function () {
      mine = mine.concat(shared.filter(function (id) { return mine.indexOf(id) === -1; }));
      save(); showing = "mine"; shared = null; address(""); render(); toast("Saved as my apps"); $("mine-h").focus();
    });
    $("flip").addEventListener("click", function () { showing = showing === "shared" ? "mine" : "shared"; render(); });
    q.addEventListener("input", function () { renderMine(); renderSearch(); syncToggles(); fades(); });

    page.addEventListener("click", function (e) {
      var t = e.target.closest("[data-t]");
      if (t) {
        var id = t.getAttribute("data-t");
        var inResults = !!t.closest("#results"), inGrid = t.closest("#mine-grid"), cards = inGrid ? Array.prototype.slice.call(inGrid.children) : [], at = inGrid ? cards.indexOf(t.closest(".card")) : -1;
        if (showing === "shared") showing = "mine";
        mine = mine.indexOf(id) !== -1 ? mine.filter(function (x) { return x !== id; }) : mine.concat([id]);
        save(); render();
        toast(mine.indexOf(id) !== -1 ? "Added" : "Removed");
        if (inGrid) {
          // The card is gone or redrawn: keep the focus on the same place in My apps.
          var left = $("mine-grid").querySelectorAll(".card .tog");
          if (!$("my-stack").hidden && left.length) left[Math.min(at, left.length - 1)].focus();
          else q.focus();
        } else if (inResults) {
          var again = results.querySelector('[data-t="' + id + '"]'); if (again) again.focus();
        }
        return;
      }
      var g = e.target.closest("[data-g]");
      if (g) {
        e.preventDefault();
        closeCard();
        gf = { src: "", st: "", k: "", app: g.getAttribute("data-g"), mine: false };
        $("gq").value = "";
        tab("guides", true); renderGuides(); address(guidesHash(gfHash())); toTop();
        return;
      }
      var o = e.target.closest("[data-open]");
      if (o) { openCard(o.getAttribute("data-open"), o); return; }
      if (e.target.closest("#sheet-x")) { closeCard(); return; }
      if (e.target === sheet) {
        var box = sheet.getBoundingClientRect();
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) closeCard();
      }
    });

    // Guides
    var guides = Array.prototype.map.call(page.querySelectorAll(".gi"), function (li) {
      return { el: li, own: li.hasAttribute("data-own"), st: li.getAttribute("data-st").split(" ").filter(Boolean), k: li.getAttribute("data-k"),
        c: li.getAttribute("data-c").split(" ").filter(Boolean), q: li.getAttribute("data-q") };
    });
    var gq = $("gq"), sel = $("f-prod");
    var gf = { src: "", st: "", k: "", app: "", mine: true };
    var gfHash = function () { return { src: gf.src, st: gf.st, k: gf.k, app: gf.app, q: gq.value.trim() }; };
    var covered = Array.prototype.map.call(sel.options, function (o) { return o.value; }).filter(Boolean);
    function chip(attr, key, label, pre) {
      return '<button type="button" class="chip" ' + attr + '="' + key + '" aria-pressed="false">' + (pre || "") + label + ' <span class="sn"></span></button>';
    }
    var BOOK = '<svg class="hi" aria-hidden="true"><use href="#hi-ours"/></svg>';
    $("f-src").innerHTML = SRC.map(function (s) { return chip("data-fsrc", s[0], s[1], s[0] === "own" ? BOOK : ""); }).join("");
    $("f-st").innerHTML = STEPS.map(function (s) { return chip("data-fs", s[0], s[1], '<span class="dot s-' + s[0] + '" aria-hidden="true"></span>'); }).join("");
    $("f-k").innerHTML = KINDS.map(function (k) { return chip("data-fk", k[0], k[1], '<svg class="hi" aria-hidden="true"><use href="#hi-' + (k[0] === "video" ? "video" : "article") + '"/></svg>'); }).join("");
    $("f-app").insertAdjacentHTML("afterbegin", '<button type="button" class="chip" data-fm="1" aria-pressed="false"><span class="fm-l">My apps</span> <span class="sn"></span></button>');

    function gmatch(g, skip) {
      var ids = cur(), text = gq.value.trim();
      if (skip !== "st" && gf.st && g.st.indexOf(gf.st) === -1) return false;
      if (skip !== "src" && gf.src && (gf.src === "own") !== g.own) return false;
      if (skip !== "k" && gf.k && g.k !== gf.k) return false;
      if (skip !== "app" && gf.app && g.c.indexOf(gf.app) === -1) return false;
      if (skip !== "mine" && gf.mine && ids.length && !g.own && !g.c.some(function (c) { return ids.indexOf(c) !== -1; })) return false;
      if (text && !fuzzy(text, g.q)) return false;
      return true;
    }
    function cnt(test, skip) { return guides.filter(function (g) { return gmatch(g, skip) && test(g); }).length; }
    function setChip(b, n, on, show) {
      b.querySelector(".sn").textContent = n;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.hidden = !show;
    }
    function renderGuides() {
      var list = cur();
      Array.prototype.forEach.call(page.querySelectorAll("[data-fsrc]"), function (b) {
        var k = b.getAttribute("data-fsrc");
        setChip(b, cnt(function (g) { return (k === "own") === g.own; }, "src"), gf.src === k, true);
      });
      Array.prototype.forEach.call(page.querySelectorAll("[data-fs]"), function (b) {
        var k = b.getAttribute("data-fs"), n = cnt(function (g) { return g.st.indexOf(k) !== -1; }, "st");
        setChip(b, n, gf.st === k, n > 0 || gf.st === k);
      });
      Array.prototype.forEach.call(page.querySelectorAll("[data-fk]"), function (b) {
        var k = b.getAttribute("data-fk"), n = cnt(function (g) { return g.k === k; }, "k");
        setChip(b, n, gf.k === k, n > 0 || gf.k === k);
      });
      var fm = page.querySelector("[data-fm]");
      fm.querySelector(".fm-l").textContent = showing === "shared" ? "Shared apps" : "My apps";
      setChip(fm, cnt(function (g) { return g.c.some(function (c) { return list.indexOf(c) !== -1; }); }, "mine"), gf.mine && list.length > 0, list.length > 0);
      var opts = '<option value="">Any app</option>';
      covered.forEach(function (c) {
        var n = cnt(function (g) { return g.c.indexOf(c) !== -1; }, "app");
        if (n || gf.app === c) opts += '<option value="' + c + '"' + (gf.app === c ? " selected" : "") + ">" + esc(apps[c] ? apps[c].n : c) + " (" + n + ")</option>";
      });
      sel.innerHTML = opts; sel.value = gf.app; sel.classList.toggle("on", !!gf.app);
      var shown = 0;
      guides.forEach(function (g) { var ok = gmatch(g); g.el.hidden = !ok; if (ok) shown++; });
      ["g-own", "g-other"].forEach(function (id) {
        var h = $(id), ul = h.nextElementSibling;
        h.hidden = ul.hidden = !ul.querySelector(".gi:not([hidden])");
      });
      var any = !!(gf.src || gf.st || gf.k || gf.app || gq.value.trim() || (gf.mine && list.length));
      $("gcount").textContent = countText(shown, guides.length);
      $("greset").hidden = !any;
      $("gnone").hidden = shown > 0;
    }
    function guidesChanged() { renderGuides(); if (active === "guides") address(guidesHash(gfHash())); }
    page.querySelector(".filters").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var pairs = [["data-fsrc", "src"], ["data-fs", "st"], ["data-fk", "k"]];
      for (var i = 0; i < pairs.length; i++) {
        if (b.hasAttribute(pairs[i][0])) { var v = b.getAttribute(pairs[i][0]); gf[pairs[i][1]] = gf[pairs[i][1]] === v ? "" : v; guidesChanged(); return; }
      }
      if (b.hasAttribute("data-fm")) { gf.mine = !gf.mine; guidesChanged(); }
    });
    sel.addEventListener("change", function () { gf.app = sel.value; guidesChanged(); });
    gq.addEventListener("input", guidesChanged);
    $("greset").addEventListener("click", function () { gf = { src: "", st: "", k: "", app: "", mine: false }; gq.value = ""; guidesChanged(); gq.focus(); });

    // A part box fades at the bottom while more rows follow.
    function fades() {
      Array.prototype.forEach.call(page.querySelectorAll(".part-box .rows"), function (r) {
        r.classList.toggle("more", r.scrollTop + r.clientHeight < r.scrollHeight - 4);
      });
    }
    page.addEventListener("scroll", function (e) { if (e.target.classList && e.target.classList.contains("rows")) fades(); }, true);
    window.addEventListener("resize", fades);

    function land(hash, first) {
      var h = parseHash(hash);
      if (h.stack) {
        shared = known(h.stack);
        showing = shared.length && shared.join() !== mine.join() ? "shared" : "mine";
        if (!shared.length) shared = null;
      }
      if (h.f) {
        gf = { src: h.f.src, st: h.f.st, k: KINDS.some(function (k) { return k[0] === h.f.k; }) ? h.f.k : "", app: covered.indexOf(h.f.app) !== -1 ? h.f.app : "", mine: !h.f.app };
        gq.value = h.f.q;
      }
      var target = h.row ? document.getElementById(h.row) : null;
      var tabName = h.tab || (target && panels[1].contains(target) ? "guides" : "help");
      if (h.open && !apps[h.open]) { window.location.replace("links.html#" + h.open); return; }
      tab(tabName);
      render();
      if (target && target !== panels[0]) {
        if (target.classList.contains("row")) {
          var box = target.parentNode; box.scrollTop = target.offsetTop - box.offsetTop - 8; fades();
          target.classList.add("hit"); setTimeout(function () { target.classList.remove("hit"); }, 2400);
        }
        target.scrollIntoView({ block: "start", behavior: "instant" });
      } else if (!first || h.tab) {
        toTop();
        // The browser jumps to the old anchor once the page has loaded; the tabs stay in view instead.
        if (first && document.readyState !== "complete") window.addEventListener("load", function () { window.requestAnimationFrame(function () { toTop(); }); }, { once: true });
      }
      if (h.open) openCard(h.open, null);
    }
    window.addEventListener("hashchange", function () { land(window.location.hash, false); });
    land(window.location.hash, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
