import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";

import {
  ConfirmDialog,
  PromptDialog,
} from "../../components/ui/confirm-dialog";
import { lazyWithRetry } from "../../app/lazyWithRetry";
import { useToast } from "../../components/ui/toast";
import { useSignedInAppFrame } from "./SignedInAppFrame";
import { useCreateDialogs } from "./CreateDialogsContext";
import { useResolvedWorkspace } from "./useResolvedWorkspace";
import type { SidebarActions } from "./useSidebarActions";
import {
  workspaceSummariesQueryOptions,
} from "../projects/project-shell.queries";
import type { WorkspaceSummary } from "../projects/project-shell.types";
import {
  getProjectRoute,
} from "../projects/project-shell.routes";
import {
  buildProjectRouteHref,
} from "../search/workspace-palette-navigation";
import {
  navigateWhenWarm,
} from "./signed-in-navigation";
import { useWorkspaceCommandPaletteController } from "../search/useWorkspaceCommandPaletteController";
import { useBlockingUi } from "./BlockingUiContext";
import { LazySurfaceBoundary } from "./LazySurfaceBoundary";
import { CreateProjectDialog } from "../setup/CreateProjectDialog";
import { CreatePlanDialog } from "../setup/CreatePlanDialog";
import { CreateInitiativeDialog } from "../setup/CreateInitiativeDialog";
import type { ProjectRouteTarget } from "../setup/setup.types";

const AccountSettingsDialog = lazyWithRetry(
  () =>
    import("../auth/AccountSettingsDialog").then((m) => ({
      default: m.AccountSettingsDialog,
    })),
  { recovery: "error-boundary" },
);

type CreateDialogsHostProps = {
  actions: SidebarActions;
};

export function CreateDialogsHost({ actions }: CreateDialogsHostProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentUser, workspaces } = useSignedInAppFrame();
  const workspace = useResolvedWorkspace();
  const dialogs = useCreateDialogs();
  const { isAnyBlockingUiOpen } = useBlockingUi();

  useWorkspaceCommandPaletteController({
    disabled: isAnyBlockingUiOpen || dialogs.accountSettingsOpen,
  });

  if (!workspace) return null;

  return (
    <>
      {dialogs.accountSettingsOpen ? (
        <LazySurfaceBoundary
          label="Settings"
          onDismiss={() => dialogs.setAccountSettingsOpen(false)}
          variant="dialog"
        >
          <AccountSettingsDialog
            currentUser={currentUser}
            isOpen={dialogs.accountSettingsOpen}
            onClose={() => dialogs.setAccountSettingsOpen(false)}
            organizationId={workspace.organizationId}
          />
        </LazySurfaceBoundary>
      ) : null}

      {dialogs.createProjectOpen ? (
        <CreateProjectDialog
          isOpen={dialogs.createProjectOpen}
          onClose={() => dialogs.setCreateProjectOpen(false)}
          onCreated={(route: ProjectRouteTarget) => {
            dialogs.setCreateProjectOpen(false);
            // The mutation's onSuccess has already awaited a fresh workspaces
            // fetch into the React Query cache. React hasn't rendered yet in
            // this microtask chain, so the closed-over `workspaces` is still
            // the pre-mutation array and won't contain the new project. Read
            // from the cache directly so we navigate to the project we just
            // created.
            const freshWorkspaces =
              queryClient.getQueryData<WorkspaceSummary[]>(
                workspaceSummariesQueryOptions().queryKey,
              ) ?? workspaces;
            const resolved = getProjectRoute(
              freshWorkspaces,
              route.orgSlug,
              route.workspaceSlug,
              route.projectSlug,
            );
            if (resolved) {
              void navigateWhenWarm({
                location: { href: buildProjectRouteHref(resolved) },
                navigate,
                router,
              });
            } else {
              toast({
                title: "Project created",
                description:
                  "We couldn't open the new project automatically. Refresh to find it in the sidebar.",
              });
            }
          }}
          workspaceId={workspace.id}
        />
      ) : null}

      {dialogs.createPlanOpen ? (
        <CreatePlanDialog
          defaultViewType={dialogs.createPlanDefaultViewType}
          isOpen={dialogs.createPlanOpen}
          onClose={() => dialogs.setCreatePlanOpen(false)}
          onCreate={actions.handleCreatePlan}
        />
      ) : null}

      {dialogs.createInitiativeOpen ? (
        <CreateInitiativeDialog
          isOpen={dialogs.createInitiativeOpen}
          onClose={() => dialogs.setCreateInitiativeOpen(false)}
          onCreate={actions.handleCreateInitiative}
        />
      ) : null}

      {actions.confirm.confirmDialogProps ? (
        <ConfirmDialog {...actions.confirm.confirmDialogProps} />
      ) : null}
      {actions.promptDialog.promptDialogProps ? (
        <PromptDialog {...actions.promptDialog.promptDialogProps} />
      ) : null}
    </>
  );
}
