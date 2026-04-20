import type { WorkspaceNavItemId } from "./app-shell.types";
import { aiAgentsRoutePath } from "./signed-in-navigation";
import { myNotesRoutePath } from "../notes/notes.routes";

export function resolveActiveNavItem(
  pathname: string,
): WorkspaceNavItemId | undefined {
  if (pathname === myNotesRoutePath) return "notes";
  if (pathname === aiAgentsRoutePath) return "ai-agents";
  return undefined;
}
