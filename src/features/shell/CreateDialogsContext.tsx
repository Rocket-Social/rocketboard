import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

import type { PlanViewType } from "../plans/plan.types";
import { useBlockingUi } from "./BlockingUiContext";

type CreateDialogsState = {
  createInitiativeOpen: boolean;
  createPlanOpen: boolean;
  createPlanDefaultViewType: PlanViewType | undefined;
  createProjectOpen: boolean;
  createWorkspaceOpen: boolean;
  accountSettingsOpen: boolean;
  commandPaletteOpen: boolean;
  openCreateInitiative: () => void;
  openCreatePlan: (defaultViewType?: PlanViewType) => void;
  openCreateProject: () => void;
  openCreateWorkspace: () => void;
  openAccountSettings: () => boolean;
  openCommandPalette: () => boolean | void;
  closeAll: () => void;
  setCreateInitiativeOpen: (open: boolean) => void;
  setCreatePlanOpen: (open: boolean) => void;
  setCreateProjectOpen: (open: boolean) => void;
  setCreateWorkspaceOpen: (open: boolean) => void;
  setAccountSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  isAnyDialogOpen: boolean;
};

const CreateDialogsCtx = createContext<CreateDialogsState | null>(null);

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
  const [createInitiativeOpen, setCreateInitiativeOpen] = useState(false);
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createPlanDefaultViewType, setCreatePlanDefaultViewType] = useState<
    PlanViewType | undefined
  >(undefined);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const isAnyDialogOpen =
    createInitiativeOpen ||
    createPlanOpen ||
    createProjectOpen ||
    createWorkspaceOpen ||
    accountSettingsOpen;

  const { isAnyBlockingUiOpen, registerBlocker } = useBlockingUi();
  useLayoutEffect(() => {
    registerBlocker("shell-dialog", isAnyDialogOpen);
    return () => registerBlocker("shell-dialog", false);
  }, [isAnyDialogOpen, registerBlocker]);

  const closeAll = useCallback(() => {
    setCreateInitiativeOpen(false);
    setCreatePlanOpen(false);
    setCreateProjectOpen(false);
    setCreateWorkspaceOpen(false);
    setAccountSettingsOpen(false);
    setCommandPaletteOpen(false);
  }, []);

  const openCreateInitiative = useCallback(() => {
    closeAll();
    setCreateInitiativeOpen(true);
  }, [closeAll]);

  const openCreatePlan = useCallback(
    (defaultViewType?: PlanViewType) => {
      closeAll();
      setCreatePlanDefaultViewType(defaultViewType);
      setCreatePlanOpen(true);
    },
    [closeAll],
  );

  const openCreateProject = useCallback(() => {
    closeAll();
    setCreateProjectOpen(true);
  }, [closeAll]);

  const openCreateWorkspace = useCallback(() => {
    closeAll();
    setCreateWorkspaceOpen(true);
  }, [closeAll]);

  const openAccountSettings = useCallback(() => {
    closeAll();
    setAccountSettingsOpen(true);
    return true;
  }, [closeAll]);

  const openCommandPalette = useCallback(() => {
    if (accountSettingsOpen) return false;
    if (isAnyBlockingUiOpen) return false;
    setCommandPaletteOpen(true);
    return true;
  }, [accountSettingsOpen, isAnyBlockingUiOpen]);

  const value: CreateDialogsState = {
    createInitiativeOpen,
    createPlanOpen,
    createPlanDefaultViewType,
    createProjectOpen,
    createWorkspaceOpen,
    accountSettingsOpen,
    commandPaletteOpen,
    openCreateInitiative,
    openCreatePlan,
    openCreateProject,
    openCreateWorkspace,
    openAccountSettings,
    openCommandPalette,
    closeAll,
    setCreateInitiativeOpen,
    setCreatePlanOpen,
    setCreateProjectOpen,
    setCreateWorkspaceOpen,
    setAccountSettingsOpen,
    setCommandPaletteOpen,
    isAnyDialogOpen,
  };

  return (
    <CreateDialogsCtx.Provider value={value}>
      {children}
    </CreateDialogsCtx.Provider>
  );
}

export function useCreateDialogs(): CreateDialogsState {
  const ctx = useContext(CreateDialogsCtx);
  if (!ctx) {
    throw new Error("useCreateDialogs must be used within CreateDialogsProvider");
  }
  return ctx;
}
