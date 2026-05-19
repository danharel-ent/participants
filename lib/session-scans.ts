const STORAGE_KEY = "participants-local-scans-v1";

export function loadLocalScans(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveLocalScans(keys: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
}

export function clearLocalScans() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
