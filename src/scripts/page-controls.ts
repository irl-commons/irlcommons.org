import { hashId } from "./addresses.ts";

// The phone nav scrolls sideways. Browsers leave a half-visible focused link where it is, so
// bring it fully in, clear of the fade (the row's scroll-padding sets that room).
export function initNav() {
  const row = document.querySelector(".site-nav ul");
  if (!row) return;
  row.addEventListener("focusin", function (ev) {
    if (row.scrollWidth > row.clientWidth && ev.target instanceof Element)
      ev.target.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

export function initBeta() {
  const badge = document.querySelector(".beta-badge");
  const tip = document.getElementById("beta-tip");
  if (!badge || !tip || typeof tip.showPopover !== "function") return;
  const wrap = badge.parentElement;
  if (!wrap) return;
  let pinned = false,
    timer: number | undefined;
  badge.removeAttribute("popovertarget"); // script handles clicks, so a click after hovering keeps the note open
  badge.setAttribute("aria-expanded", "false");
  const isOpen = () => tip.matches(":popover-open");
  const place = () => {
    if (window.CSS && CSS.supports && CSS.supports("anchor-name: --beta")) return;
    const r = badge.getBoundingClientRect();
    tip.style.top = Math.round(r.bottom + 6) + "px";
    tip.style.left =
      Math.max(16, Math.min(Math.round(r.left), window.innerWidth - tip.offsetWidth - 16)) + "px";
  };
  const open = (pin: boolean) => {
    window.clearTimeout(timer);
    if (pin) pinned = true;
    if (!isOpen()) {
      try {
        tip.showPopover();
      } catch {
        return;
      }
    }
    place();
  };
  const close = () => {
    pinned = false;
    if (isOpen()) {
      try {
        tip.hidePopover();
      } catch {}
    }
  };
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      if (!pinned && !wrap.matches(":hover") && !wrap.contains(document.activeElement)) close();
    }, 200);
  };
  badge.addEventListener("click", function () {
    if (isOpen() && pinned) close();
    else open(true);
  });
  wrap.addEventListener("mouseenter", function () {
    open(false);
  });
  wrap.addEventListener("mouseleave", later);
  badge.addEventListener("focus", function () {
    open(false);
  });
  wrap.addEventListener("focusout", later);
  tip.addEventListener("toggle", function (ev) {
    const on = ev.newState === "open";
    if (!on) pinned = false;
    badge.setAttribute("aria-expanded", on ? "true" : "false");
  });
  window.addEventListener("resize", function () {
    if (isOpen()) place();
  });
}

export function reveal(el: HTMLElement) {
  let opened = false;
  for (let d: HTMLElement | null = el; d; d = d.parentElement) {
    if (d instanceof HTMLDetailsElement && !d.open) {
      d.open = true;
      opened = true;
    }
  }
  return opened;
}

export function initFold() {
  const root = document.documentElement;
  try {
    const folds = Array.from(document.querySelectorAll<HTMLDetailsElement>("details.fold"));
    if (!folds.length) return;
    const target = document.getElementById(hashId(window.location.hash));
    folds.forEach(function (d) {
      if (!(target && d.contains(target))) d.open = false;
    });
    if (target) reveal(target); // landTarget() scrolls there once every part of the page is shown
    document.addEventListener("click", function (ev) {
      const a = ev.target instanceof Element ? ev.target.closest('a[href^="#"]') : null;
      const t = a && document.getElementById(hashId(a.getAttribute("href")));
      if (t) reveal(t); // before the browser follows the link, so it lands on the open part
    });
    window.addEventListener("hashchange", function () {
      const t = document.getElementById(hashId(window.location.hash));
      if (t && reveal(t)) t.scrollIntoView({ block: "start" });
    });
  } finally {
    root.classList.add("fold-ready");
  }
}

export function landTarget() {
  const target = document.getElementById(hashId(window.location.hash));
  if (!target || !target.getClientRects().length) return;
  const top = target.getBoundingClientRect().top;
  const margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
  if (Math.abs(top - margin) > 4) target.scrollIntoView({ block: "start", behavior: "instant" });
}

export function initPermalinks() {
  if (!document.querySelector("a.permalink")) return;
  const live = document.createElement("p");
  live.className = "vh";
  live.setAttribute("role", "status");
  document.body.appendChild(live);
  let timer: number | undefined;
  document.addEventListener("click", function (ev) {
    const a = ev.target instanceof Element ? ev.target.closest("a.permalink") : null;
    if (!a) return;
    const url = window.location.href.split("#")[0] + a.getAttribute("href");
    const say = function (text: string, copied: boolean) {
      live.textContent = "";
      window.setTimeout(function () {
        live.textContent = text;
      }, 50);
      Array.from(document.querySelectorAll<HTMLElement>("a.permalink.is-copied")).forEach(function (x) {
        x.classList.remove("is-copied");
      });
      if (copied) {
        a.classList.add("is-copied");
        window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          a.classList.remove("is-copied");
        }, 1800);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () {
          say("Link copied", true);
        },
        function () {
          say("Link in the address bar", false);
        },
      );
    } else {
      say("Link in the address bar", false);
    }
  });
}
