export type ShellLayoutVariant = "scroll" | "fixed-viewport";
export type WorkspaceNavItemId = "ai-agents" | "inbox" | "notes";

export type AppShellNavigationIntent =
  | { type: "initiative"; initiativeId: string }
  | { type: "nav"; itemId: WorkspaceNavItemId }
  | { type: "plan"; planId: string }
  | { type: "project"; projectId: string }
  | { type: "wiki-all" }
  | { type: "wiki-page"; pageId: string | null; pagePath: string }
  | { type: "workspace"; orgSlug?: string; workspaceSlug: string };
