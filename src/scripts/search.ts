export function norm(text: string | null) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function wordMatches(haystack: string | null, query: string) {
  const hay = norm(haystack);
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(function (piece) {
      return hay.indexOf(piece) !== -1;
    });
}

export function standardCount(shown: number, total: number) {
  if (shown === total) return "Showing all " + total + ".";
  if (shown === 0) return "Nothing matches.";
  return "Showing " + shown + " of " + total + ".";
}

export function initStandards() {
  const tools = document.getElementById("std-tools");
  if (!tools) return;
  const q = document.querySelector<HTMLInputElement>("#std-q");
  const count = document.getElementById("std-count");
  const entries = Array.from(document.querySelectorAll<HTMLElement>(".std, .block"));
  const groups = Array.from(document.querySelectorAll<HTMLElement>(".std-group, #building-blocks"));
  if (!q || !count) return;
  let opened: HTMLDetailsElement[] = []; // group lists the search opened, closed again when the search is cleared
  const apply = () => {
    let shown = 0;
    const finding = q.value.trim() !== "";
    entries.forEach(function (e) {
      const ok = wordMatches(e.getAttribute("data-search"), q.value);
      e.hidden = !ok;
      if (ok) shown++;
    });
    groups.forEach(function (g) {
      const empty = !g.querySelector(".std:not([hidden]), .block:not([hidden])");
      g.hidden = empty;
      const li = document.querySelector<HTMLElement>('.toc li[data-for="' + g.id + '"]');
      if (li) li.hidden = empty;
      const list = g.querySelector<HTMLDetailsElement>("details.std-fold");
      if (finding && list && !empty && !list.open) {
        list.open = true;
        opened.push(list);
      }
    });
    if (!finding) {
      opened.forEach(function (d) {
        d.open = false;
      });
      opened = [];
    }
    count.textContent = shown ? standardCount(shown, entries.length) : "Nothing matches that.";
    if (finding) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "filter-reset";
      reset.textContent = "Clear filters";
      reset.addEventListener("click", function () {
        q.value = "";
        apply();
        q.focus();
      });
      count.appendChild(reset);
    }
  };
  q.addEventListener("input", apply);
  tools.hidden = false;
  apply();
}

export function initClear() {
  const SVG = "http://www.w3.org/2000/svg";
  document.querySelectorAll<HTMLInputElement>('input[type="search"]').forEach(function (input) {
    if (input.classList.contains("has-clear") || input.id === "dir-q" || input.id === "std-q") return;
    const box = document.createElement("span");
    box.className = "search-box";
    input.before(box);
    box.appendChild(input);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "search-clear";
    b.setAttribute("aria-label", "Clear search");
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", "M6 6l12 12M18 6L6 18");
    svg.appendChild(path);
    b.appendChild(svg);
    box.appendChild(b);
    input.classList.add("has-clear");
    function sync() {
      b.hidden = input.value === "";
    }
    function clear() {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    b.addEventListener("click", clear);
    input.addEventListener("input", sync);
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && input.value !== "") {
        ev.preventDefault();
        clear();
      }
    });
    sync();
  });
}
