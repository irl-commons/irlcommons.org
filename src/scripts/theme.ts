export const THEME_KEY = "osb.theme";
type Theme = "auto" | "dark" | "light";
type ExplicitTheme = Exclude<Theme, "auto">;
type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readTheme(storage: ThemeStorage | null): Theme {
  try {
    const v = storage && storage.getItem(THEME_KEY);
    return v === "dark" || v === "light" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeTheme(storage: ThemeStorage, theme: Theme) {
  try {
    if (theme === "dark" || theme === "light") storage.setItem(THEME_KEY, theme);
    else storage.removeItem(THEME_KEY);
    return true;
  } catch {
    return false;
  }
}

export function shownTheme(theme: Theme, systemDark: boolean): ExplicitTheme {
  return theme === "dark" || theme === "light" ? theme : systemDark ? "dark" : "light";
}

export function nextTheme(theme: Theme, systemDark: boolean): ExplicitTheme {
  return shownTheme(theme, systemDark) === "dark" ? "light" : "dark";
}

const THEME_TEXT = {
  en: { dark: "dark", light: "light", to: "Switch to ", theme: " theme" },
  de: { dark: "dunkel", light: "hell", to: "Wechseln zu ", theme: "" },
};

export function themeLabel(next: ExplicitTheme, lang: string) {
  const t = lang === "de" ? THEME_TEXT.de : THEME_TEXT.en;
  return t.to + t[next] + t.theme;
}

export function storageOrNull() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function initTheme() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;
  const root = document.documentElement;
  const lang = (root.getAttribute("lang") || "en").slice(0, 2);
  const tip = button.querySelector(".theme-tip");
  const storage = storageOrNull();
  let theme = readTheme(storage);
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function systemDark() {
    return !!(media && media.matches);
  }
  const show = () => {
    const next = nextTheme(theme, systemDark());
    button.setAttribute("data-mode", next);
    button.setAttribute("aria-label", themeLabel(next, lang));
    if (tip) tip.textContent = themeLabel(next, lang);
  };
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
