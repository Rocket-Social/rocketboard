import type { CSSProperties } from "react";
import type { ShellLayoutVariant } from "./app-shell.types";
import { myNotesRoutePath } from "../notes/notes.routes";

const projectRoutePattern = /\/workspaces\/[^/]+\/projects\//;

export function isProjectRoute(pathname: string): boolean {
  return projectRoutePattern.test(pathname);
}

export function resolveLayoutVariant(pathname: string): ShellLayoutVariant {
  if (pathname === myNotesRoutePath) return "fixed-viewport";
  if (isProjectRoute(pathname)) return "fixed-viewport";
  return "scroll";
}

export function resolveMainColumnClass(
  layoutVariant: ShellLayoutVariant,
  isDesktop: boolean,
  desktopSidebarWidth: number,
): { desktopMainClass: string; contentClass: string; mainStyle: CSSProperties } {
  const desktopMainClass =
    layoutVariant === "fixed-viewport"
      ? "flex h-screen flex-1 flex-col overflow-hidden"
      : "flex min-h-screen flex-1 flex-col";
  const contentClass =
    layoutVariant === "fixed-viewport"
      ? "flex min-h-0 flex-1 overflow-hidden"
      : "flex-1";
  const mainStyle: CSSProperties = {
    marginLeft: isDesktop ? desktopSidebarWidth : undefined,
  };
  return { desktopMainClass, contentClass, mainStyle };
}
