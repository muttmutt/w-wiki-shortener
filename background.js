// background.js for w.wiki Shortener (Brave/Chrome MV3-safe)

const ALLOWED_HOST_SUFFIXES = [
  ".wikipedia.org",
  ".wikimedia.org",
  ".wikidata.org",
  ".wiktionary.org",
  ".wikisource.org",
  ".wikinews.org",
  ".wikiversity.org",
  ".wikivoyage.org",
  ".wikiquote.org"
];

const API_ENDPOINT = "https://meta.wikimedia.org/w/api.php";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "wwiki-shorten",
    title: "Shorten with w.wiki",
    contexts: ["page", "selection", "link", "action"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "wwiki-shorten") {
    const targetUrl = info.linkUrl || info.pageUrl || (tab && tab.url) || null;
    if (!targetUrl) return notify("No URL found to shorten.");
    handleShorten(targetUrl);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const targetUrl = tab && tab.url;
  if (!targetUrl) return notify("No URL found to shorten.");
  handleShorten(targetUrl);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "shorten-current-tab") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetUrl = tab && tab.url;
    if (!targetUrl) return notify("No URL found to shorten.");
    handleShorten(targetUrl);
  }
});

function isAllowedWikimediaUrl(u) {
  try {
    const h = new URL(u).hostname;
    return ALLOWED_HOST_SUFFIXES.some(sfx => h === sfx.slice(1) || h.endsWith(sfx));
  } catch {
    return false;
  }
}

async function handleShorten(longUrl) {
  if (!isAllowedWikimediaUrl(longUrl)) {
    return notify("This URL isn’t on a Wikimedia site. w.wiki only accepts WMF domains.");
  }

  try {
    const params = new URLSearchParams();
    params.set("action", "shortenurl");
    params.set("format", "json");
    params.set("url", longUrl);
    params.set("origin", "*"); // CORS for extensions

    const resp = await fetch(API_ENDPOINT + "?" + params.toString(), {
      method: "POST",
      mode: "cors"
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (data.error) throw new Error(`${data.error.code}: ${data.error.info}`);

    const shortUrl = data?.shortenurl?.shorturl;
    if (!shortUrl) throw new Error("Unexpected API response.");

    await copyToClipboard(shortUrl);
    notify(`Copied: ${shortUrl}`);
  } catch (err) {
    console.error("Shorten failed:", err);
    notify(`Shortening failed: ${err.message}`);
  }
}

async function copyToClipboard(text) {
  // Primary: navigator.clipboard
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (_) {
    // Fall through to injection
  }

  // Fallback: inject into the active tab using chrome.scripting
  if (!chrome.scripting) {
    // Last-ditch: show the URL so the user can copy manually
    notify(`Short URL: ${text}`);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab for clipboard fallback.");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (t) => navigator.clipboard.writeText(t),
    args: [text]
  });
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon48.png",
    title: "w.wiki Shortener",
    message
  }, () => {});
}
