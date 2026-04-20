import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useResizableWidth } from "./useResizableWidth";

const DESKTOP_BREAKPOINT_PX = 1024;
const DEFAULT_SIDEBAR_COLLAPSED = false;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "rocketboard.sidebar-collapsed";

function readInitialSidebarCollapsed() {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_COLLAPSED;
  }

  const storedValue = window.localStorage.getItem(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
  );

  if (storedValue === "true") {
    return true;
  }

  if (storedValue === "false") {
    return false;
  }

  return DEFAULT_SIDEBAR_COLLAPSED;
}

function readInitialWindowWidth() {
  if (typeof window === "undefined") {
    return DESKTOP_BREAKPOINT_PX;
  }

  return window.innerWidth;
}

export function useSharedShellState() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readInitialSidebarCollapsed(),
  );
  const [windowWidth, setWindowWidth] = useState(() => readInitialWindowWidth());

  const {
    width: sidebarWidth,
    isResizing: isResizingSidebar,
    handleResizeStart: rawHandleResizeStart,
  } = useResizableWidth({
    defaultWidth: 256,
    minWidth: 220,
    maxWidth: 420,
    storageKey: "rocketboard.sidebar-width",
  });

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const handleResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (windowWidth < DESKTOP_BREAKPOINT_PX) {
        return;
      }
      rawHandleResizeStart(event);
    },
    [rawHandleResizeStart, windowWidth],
  );

  const openMobileSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    setMobileSidebarOpen(true);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);

  return {
    closeMobileSidebar,
    handleResizeStart,
    isDesktop: windowWidth >= DESKTOP_BREAKPOINT_PX,
    isResizingSidebar,
    mobileSidebarOpen,
    openMobileSidebar,
    setMobileSidebarOpen,
    setSidebarCollapsed,
    sidebarCollapsed,
    sidebarWidth,
    toggleSidebarCollapsed,
  };
}
