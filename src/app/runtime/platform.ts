export function isMacOsRuntime() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  return platform.includes("mac") || userAgent.includes("mac os x");
}

export function isMobileRuntime() {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod/.test(userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth <= 900);
}
