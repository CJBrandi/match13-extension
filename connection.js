import { Match13ApiError } from "./api.js";

export const API_ACCESS = { origins: ["https://actions.match13.com/*"] };

export async function requireApiAccess(browserApi) {
  if (!browserApi?.permissions || !browserApi?.storage?.local) {
    throw new Match13ApiError({ title: "Open the Firefox extension", detail: "Load manifest.json through Firefox about:debugging, then open the extension. A regular web page cannot access this API." });
  }
  if (!await browserApi.permissions.contains(API_ACCESS)) {
    throw new Match13ApiError({ title: "API access required", detail: "Firefox has not allowed API access. Open Connection, click Allow API access, and approve access to actions.match13.com." });
  }
}

export function extensionFetch(browserApi, fetchImpl = globalThis.fetch) {
  return async (url, options) => {
    await requireApiAccess(browserApi);
    return fetchImpl(url, options);
  };
}
