// SCN-10: "kaunsa device" – a short label plus a random id kept on this phone.
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : "Other";
  const browser = /Edg/.test(ua) ? "Edge" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  let id = "";
  try {
    id = localStorage.getItem("ticklo-device-id") ?? "";
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem("ticklo-device-id", id);
    }
  } catch {
    id = "nostore";
  }
  return `${os} ${browser} #${id}`;
}
