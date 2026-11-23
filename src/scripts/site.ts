import { movedUrl } from "./addresses.ts";
import { initTheme, readTheme, storageOrNull } from "./theme.ts";
import { initBeta, initFold, initNav, initPermalinks, landTarget } from "./page-controls.ts";
import { initClear, initStandards } from "./search.ts";

const root = document.documentElement;
const movedTo = movedUrl(root.getAttribute("data-moved"), window.location.hash);
if (movedTo) {
  window.location.replace(movedTo);
} else {
  root.classList.add("fold-js");
  const theme = readTheme(storageOrNull());
  if (theme !== "auto") root.setAttribute("data-theme", theme);
  try {
    storageOrNull()?.removeItem("osb.stack.v1");
  } catch {}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}

function start() {
  initFold();
  initTheme();
  initNav();
  initBeta();
  initStandards();
  initClear();
  initPermalinks();
  landTarget();
}
