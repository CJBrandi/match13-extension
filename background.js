import { Match13Client, Match13ApiError } from "./api.js";

const browserApi = globalThis.browser ?? globalThis.chrome;
const KEY_STORAGE_NAME = "match13ApiKey";
const client = new Match13Client();

async function storedApiKey() {
  const stored = await browserApi.storage.local.get(KEY_STORAGE_NAME);
  return typeof stored[KEY_STORAGE_NAME] === "string" ? stored[KEY_STORAGE_NAME].trim() : "";
}

function serialiseError(error) {
  if (error instanceof Match13ApiError) {
    return {
      status: error.status,
      title: error.title,
      detail: error.detail,
      retryAfter: error.retryAfter,
    };
  }
  return {
    status: 0,
    title: "Network error",
    detail: "Could not reach actions.match13.com. Check your connection and try again.",
    retryAfter: null,
  };
}

async function handleRequest(message) {
  try {
    client.setApiKey(await storedApiKey());
    return { ok: true, data: await client.request(message.path) };
  } catch (error) {
    return { ok: false, error: serialiseError(error) };
  }
}

browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "match13-api-request" || typeof message.path !== "string") return false;
  handleRequest(message).then(sendResponse);
  return true;
});
