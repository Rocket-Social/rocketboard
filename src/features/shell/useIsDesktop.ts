import { useSyncExternalStore } from "react";

// Narrow, context-free "am I on a desktop viewport?" hook. Consumers that only
// care about the breakpoint should use this instead of subscribing to the
// broader SidebarShellStateContext, which re-renders on every sidebar drag
// mousemove because it also tracks sidebarWidth/isResizingSidebar. Each
// consumer adds its own resize listener, but React bails out of re-rendering
// via Object.is on the snapshot boolean, so only the breakpoint flip
// (windowWidth crossing 1024px) actually triggers a render. No provider
// required, works outside SignedInShellLayout, and degrades safely when
// window is undefined (SSR, workers, node-env tests that transitively
// import the hook).

const DESKTOP_BREAKPOINT_PX = 1024;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function subscribe(onChange: () => void): () => void {
  if (!hasWindow()) {
    return () => undefined;
  }
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getSnapshot(): boolean {
  if (!hasWindow()) {
    return true;
  }
  return window.innerWidth >= DESKTOP_BREAKPOINT_PX;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
