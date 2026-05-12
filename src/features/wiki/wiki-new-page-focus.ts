const WIKI_NEW_PAGE_FOCUS_KEY = "rocketboard:wiki:new-page-focus";

function getStorageKey(organizationId: string) {
  return `${WIKI_NEW_PAGE_FOCUS_KEY}:${organizationId}`;
}

export function markWikiNewPageForTitleFocus(
  organizationId: string,
  pageId: string,
) {
  if (typeof window === "undefined" || !organizationId || !pageId) return;

  window.sessionStorage.setItem(getStorageKey(organizationId), pageId);
}

export function consumeWikiNewPageTitleFocus(
  organizationId: string,
  pageId: string,
) {
  if (typeof window === "undefined" || !organizationId || !pageId) {
    return false;
  }

  const storageKey = getStorageKey(organizationId);
  const pendingPageId = window.sessionStorage.getItem(storageKey);

  if (pendingPageId !== pageId) return false;

  window.sessionStorage.removeItem(storageKey);
  return true;
}
