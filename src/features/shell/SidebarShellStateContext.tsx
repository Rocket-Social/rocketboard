import { createContext, useContext, type ReactNode } from "react";

import { useSharedShellState } from "./useSharedShellState";

export type SidebarShellState = ReturnType<typeof useSharedShellState>;

const SidebarShellStateContext = createContext<SidebarShellState | null>(null);

export function SidebarShellStateProvider({ children }: { children: ReactNode }) {
  const value = useSharedShellState();
  return (
    <SidebarShellStateContext.Provider value={value}>
      {children}
    </SidebarShellStateContext.Provider>
  );
}

export function useSidebarShellState(): SidebarShellState {
  const value = useContext(SidebarShellStateContext);
  if (!value) {
    throw new Error(
      "useSidebarShellState must be used inside SidebarShellStateProvider",
    );
  }
  return value;
}
