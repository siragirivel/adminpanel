const DEFAULT_APP_URL = "https://wms.siragirivel.in";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getAppUrl() {
  const configuredUrl = trimTrailingSlash(String(process.env.NEXT_PUBLIC_APP_URL || "").trim());

  if (!configuredUrl) {
    return DEFAULT_APP_URL;
  }

  try {
    const parsedUrl = new URL(configuredUrl);
    if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1") {
      return DEFAULT_APP_URL;
    }
    return trimTrailingSlash(parsedUrl.toString());
  } catch {
    return DEFAULT_APP_URL;
  }
}

export function getAppUrlWithPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl()}${normalizedPath}`;
}
