export function movedUrl(target: string | null, hash: string) {
  if (!target || !/^[a-z0-9-]+\.html$/.test(target)) return null;
  return target + (/^#[A-Za-z0-9_-]+$/.test(hash || "") ? hash : "");
}

export function hashId(hash: string | null) {
  let raw = String(hash || "").replace(/^#/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return "";
  }
  return /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(raw) ? raw : "";
}
