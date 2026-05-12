import { resolveWikiPageIdFromPath } from "../wiki/wiki.preload";
import type { WikiPageListItem } from "../wiki/wiki.types";

export function resolveActiveWikiPageId(
  pathname: string,
  wikiPages: WikiPageListItem[],
  wikiPagePath: string | undefined,
): string | null {
  if (!pathname.includes("/wiki")) return null;
  return resolveWikiPageIdFromPath(wikiPages, wikiPagePath);
}
