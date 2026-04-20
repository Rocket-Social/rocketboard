import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { usePromptDialog } from "../../hooks/usePromptDialog";
import { useToast } from "../../components/ui/toast";
import { useMode } from "../../app/mode";
import { getErrorMessage, rpcAdapter } from "../../platform/data/rpc-adapter";
import { loginRoutePath } from "../auth/data";
import {
  useSignOutMutation,
  useUpdateAccountPreferencesMutation,
} from "../auth/session.queries";
import {
  useArchiveInitiativeMutation,
  useCreateInitiativeMutation,
  useDeleteInitiativeMutation,
  useRenameInitiativeMutation,
} from "../initiatives/initiative.queries";
import type { InitiativeRecord } from "../initiatives/initiative.types";
import {
  useCreatePlanMutation,
  useDeletePlanMutation,
  useRenamePlanMutation,
} from "../plans/plan.queries";
import type { PlanRecord, PlanViewType } from "../plans/plan.types";
import {
  useDeleteProjectMutation,
  useRenameProjectMutation,
} from "../projects/project-metadata.queries";
import { workspaceSummariesQueryOptions } from "../projects/project-shell.queries";
import {
  getProjectRoute,
  getWorkspaceRoute,
} from "../projects/project-shell.routes";
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "../projects/project-shell.types";
import {
  buildProjectRouteHref,
  createWorkspacePaletteNavigator,
} from "../search/workspace-palette-navigation";
import type { WorkspacePaletteCommand } from "../search/WorkspaceCommandPalette";
import {
  buildOrgApiKeysHref,
  buildWorkspaceInitiativeHref,
  buildWorkspaceInitiativesHref,
  buildWorkspacePlanHref,
} from "./route-helpers";
import { useSignedInAppFrame } from "./SignedInAppFrame";
import {
  buildAiAgentsLocation,
  buildMyNotesLocation,
  buildWikiLocation,
  navigateWhenWarm,
  warmSignedInNavigationLocation,
} from "./signed-in-navigation";
import type {
  AppShellNavigationIntent,
  WorkspaceNavItemId,
} from "./app-shell.types";
import { myNotesRoutePath } from "../notes/notes.routes";
import type { SidebarItem } from "./sidebar-ordering";
import { useCreateDialogs } from "./CreateDialogsContext";
import { useNavigationGuards } from "./NavigationGuardContext";
import { useCreateWikiPageMutation } from "../wiki/wiki.queries";
import type { WeekStartsOn } from "../../lib/week-preferences";
import { SidebarProjectMenu } from "./SidebarProjectMenu";
import { isDarkSidebar } from "./theme";

export type SidebarActions = {
  confirm: ReturnType<typeof useConfirmDialog>;
  promptDialog: ReturnType<typeof usePromptDialog>;

  selectNavItem: (itemId: WorkspaceNavItemId) => void;
  prefetchNavItem: (itemId: WorkspaceNavItemId) => void;

  selectWikiPage: (pageId: string, fullPath: string) => void;
  prefetchWikiPage: (pageId: string, fullPath: string) => void;
  navigateToAllWikiPages: () => void;
  prefetchAllWikiPages: () => void;
  createWikiPage: () => void;

  selectWorkspace: (workspace: WorkspaceSummary) => void;
  prefetchWorkspace: (workspace: WorkspaceSummary) => void;
  renameWorkspace: (workspace: { id: string; name: string }) => Promise<void>;
  deleteWorkspace: (workspace: {
    id: string;
    name: string;
    slug: string;
    organizationSlug: string;
  }) => Promise<void>;

  selectProject: (project: WorkspaceProjectSummary) => void;
  prefetchProject: (project: WorkspaceProjectSummary) => void;
  renameProject: (projectId: string, newName: string) => void;
  deleteProject: (projectId: string) => void;

  selectPlan: (plan: PlanRecord) => void;
  prefetchPlan: (plan: PlanRecord) => void;

  selectInitiative: (initiative: InitiativeRecord) => void;
  prefetchInitiative: (initiative: InitiativeRecord) => void;

  renderItemMenu: (item: SidebarItem) => React.ReactNode;

  handleCreatePlan: (input: { planName: string; viewTypes: PlanViewType[] }) => Promise<void>;
  handleCreateInitiative: (input: { initiativeName: string }) => Promise<void>;

  signOut: () => void;
  selectMode: ReturnType<typeof useMode>["setMode"];
  saveWeekStartsOn: (value: WeekStartsOn) => Promise<void>;

  openApiKeys: () => Promise<boolean>;
  paletteNavigator: ReturnType<typeof createWorkspacePaletteNavigator> | null;
  paletteCommands: WorkspacePaletteCommand[];
};

const EMPTY_PALETTE_COMMANDS: WorkspacePaletteCommand[] = [];

export function useSidebarActions(
  workspace: WorkspaceSummary | undefined,
  wikiOrgId: string,
  activeSidebarItemId: string | null,
): SidebarActions {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialogProps } = useConfirmDialog();
  const { prompt: promptDialog, promptDialogProps } = usePromptDialog();
  const { workspaces } = useSignedInAppFrame();
  const { mode, setMode } = useMode();
  const { runRegisteredGuards } = useNavigationGuards();
  const createDialogs = useCreateDialogs();
  const signOutMutation = useSignOutMutation();
  const updatePreferencesMutation = useUpdateAccountPreferencesMutation();

  const darkSidebar = isDarkSidebar(mode);

  const createPlanMutation = useCreatePlanMutation();
  const createInitiativeMutation = useCreateInitiativeMutation();
  const deleteProjectMutation = useDeleteProjectMutation();
  const renameProjectMutation = useRenameProjectMutation();
  const deletePlanMutation = useDeletePlanMutation(workspace?.id ?? "");
  const renamePlanMutation = useRenamePlanMutation(workspace?.id ?? "");
  const archiveInitiativeMutation = useArchiveInitiativeMutation();
  const deleteInitiativeMutation = useDeleteInitiativeMutation();
  const renameInitiativeMutation = useRenameInitiativeMutation();
  const wikiCreateMutation = useCreateWikiPageMutation(wikiOrgId);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const searchSnapshot = useRouterState({
    select: (state) =>
      new URL(state.location.href, "https://rocketboard.local").searchParams,
  });

  const currentWorkspaceSlug = workspace?.slug ?? "";
  const currentOrganizationSlug =
    workspace?.organizationSlug ?? workspaces[0]?.organizationSlug ?? "";
  const notesWorkspaceSlug =
    searchSnapshot.get("workspaceSlug") ?? currentWorkspaceSlug;

  const preloadRoute = useCallback(
    (location: {
      href?: string;
      params?: Record<string, string>;
      search?: Record<string, string | undefined>;
      to?: string;
    }) => {
      void warmSignedInNavigationLocation(router, location).catch(() => {});
    },
    [router],
  );

  const navigateToRoute = useCallback(
    (route: import("../projects/project-shell.types").ProjectShellRouteParams | null) => {
      if (!route) return;
      void navigateWhenWarm({
        location: { href: buildProjectRouteHref(route) },
        navigate,
        router,
      });
    },
    [navigate, router],
  );

  const runGuardedNavigation = useCallback(
    async (
      _intent: AppShellNavigationIntent,
      doNavigate: () => void | Promise<void>,
    ) => {
      const allowed = await runRegisteredGuards();
      if (!allowed) return;
      await doNavigate();
    },
    [runRegisteredGuards],
  );

  const selectNavItem = useCallback(
    (itemId: WorkspaceNavItemId) => {
      void runGuardedNavigation({ itemId, type: "nav" }, () => {
        if (itemId === "notes") {
          if (pathname === myNotesRoutePath) return;
          void navigateWhenWarm({
            location: buildMyNotesLocation(notesWorkspaceSlug),
            navigate,
            router,
          });
          return;
        }
        void navigateWhenWarm({
          location: buildAiAgentsLocation(),
          navigate,
          router,
        });
      });
    },
    [navigate, notesWorkspaceSlug, pathname, router, runGuardedNavigation],
  );

  const prefetchNavItem = useCallback(
    (itemId: WorkspaceNavItemId) => {
      if (itemId === "notes") {
        preloadRoute(buildMyNotesLocation(notesWorkspaceSlug));
        return;
      }
      preloadRoute(buildAiAgentsLocation());
    },
    [notesWorkspaceSlug, preloadRoute],
  );

  const selectWikiPage = useCallback(
    (pageId: string, fullPath: string) => {
      void runGuardedNavigation(
        { pageId, pagePath: fullPath, type: "wiki-page" },
        () => {
          if (!currentOrganizationSlug) return;
          void navigateWhenWarm({
            location: buildWikiLocation(currentOrganizationSlug, fullPath),
            navigate,
            router,
          });
        },
      );
    },
    [currentOrganizationSlug, navigate, router, runGuardedNavigation],
  );

  const prefetchWikiPage = useCallback(
    (_pageId: string, fullPath: string) => {
      if (!currentOrganizationSlug) return;
      preloadRoute(buildWikiLocation(currentOrganizationSlug, fullPath));
    },
    [currentOrganizationSlug, preloadRoute],
  );

  const navigateToAllWikiPages = useCallback(() => {
    void runGuardedNavigation({ type: "wiki-all" }, () => {
      if (!currentOrganizationSlug) return;
      void navigateWhenWarm({
        location: buildWikiLocation(currentOrganizationSlug),
        navigate,
        router,
      });
    });
  }, [currentOrganizationSlug, navigate, router, runGuardedNavigation]);

  const prefetchAllWikiPages = useCallback(() => {
    if (!currentOrganizationSlug) return;
    preloadRoute(buildWikiLocation(currentOrganizationSlug));
  }, [currentOrganizationSlug, preloadRoute]);

  const createWikiPage = useCallback(() => {
    if (wikiCreateMutation.isPending || !wikiOrgId) return;
    wikiCreateMutation.mutate(
      { organizationId: wikiOrgId },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, "Rocketboard could not create the page."),
            title: "Couldn't create page",
            variant: "error",
          });
        },
        onSuccess: (newPage) => {
          void navigateWhenWarm({
            location: buildWikiLocation(currentOrganizationSlug, newPage.slug),
            navigate,
            router,
          });
        },
      },
    );
  }, [currentOrganizationSlug, navigate, router, toast, wikiCreateMutation, wikiOrgId]);

  const doSelectWorkspace = useCallback(
    (targetWorkspaceSlug: string, nextOrgSlug?: string) => {
      const targetWorkspace = workspaces.find(
        (c) =>
          c.slug === targetWorkspaceSlug &&
          (!nextOrgSlug || c.organizationSlug === nextOrgSlug),
      );
      if (!targetWorkspace) return;

      if (pathname === myNotesRoutePath) {
        void navigateWhenWarm({
          location: buildMyNotesLocation(targetWorkspace.slug),
          navigate,
          router,
        });
        return;
      }

      navigateToRoute(
        getWorkspaceRoute(
          workspaces,
          targetWorkspace.organizationSlug,
          targetWorkspace.slug,
        ),
      );
    },
    [navigate, navigateToRoute, pathname, router, workspaces],
  );

  const selectWorkspace = useCallback(
    (ws: WorkspaceSummary) => {
      void runGuardedNavigation(
        { orgSlug: ws.organizationSlug, type: "workspace", workspaceSlug: ws.slug },
        () => doSelectWorkspace(ws.slug, ws.organizationSlug),
      );
    },
    [doSelectWorkspace, runGuardedNavigation],
  );

  const prefetchWorkspace = useCallback(
    (ws: WorkspaceSummary) => {
      if (pathname === myNotesRoutePath) {
        preloadRoute(buildMyNotesLocation(ws.slug));
        return;
      }
      const route = getWorkspaceRoute(workspaces, ws.organizationSlug, ws.slug);
      if (route) preloadRoute({ href: buildProjectRouteHref(route) });
    },
    [pathname, preloadRoute, workspaces],
  );

  const renameWorkspace = useCallback(
    async (targetWorkspace: { id: string; name: string }) => {
      const newName = await promptDialog({
        confirmLabel: "Rename",
        defaultValue: targetWorkspace.name,
        title: "Rename workspace",
      });
      if (!newName || !newName.trim() || newName.trim() === targetWorkspace.name) return;
      try {
        await rpcAdapter.call("rename_workspace", {
          target_name: newName.trim(),
          target_workspace_id: targetWorkspace.id,
        });
        await queryClient.invalidateQueries({
          queryKey: workspaceSummariesQueryOptions().queryKey,
        });
        toast({ title: `Workspace renamed to "${newName.trim()}"` });
      } catch (error) {
        console.error("[rename-workspace]", error);
        toast({ title: "Could not rename workspace", variant: "error" });
      }
    },
    [promptDialog, queryClient, toast],
  );

  const deleteWorkspace = useCallback(
    async (targetWorkspace: {
      id: string;
      name: string;
      slug: string;
      organizationSlug: string;
    }) => {
      if (workspaces.length <= 1) {
        toast({ title: "Cannot delete your only workspace", variant: "error" });
        return;
      }
      if (
        !(await confirm({
          confirmLabel: "Delete",
          description:
            "This will permanently delete all projects, tasks, and documents in this workspace.",
          title: `Delete "${targetWorkspace.name}"?`,
          variant: "destructive",
        }))
      ) {
        return;
      }
      try {
        await rpcAdapter.call("delete_workspace", {
          target_workspace_id: targetWorkspace.id,
        });
        await queryClient.invalidateQueries({
          queryKey: workspaceSummariesQueryOptions().queryKey,
        });
        if (targetWorkspace.slug === currentWorkspaceSlug) {
          const remaining = workspaces.find((c) => c.slug !== targetWorkspace.slug);
          if (remaining) {
            doSelectWorkspace(remaining.slug, remaining.organizationSlug);
          }
        }
        toast({ title: `Workspace "${targetWorkspace.name}" deleted` });
      } catch (error) {
        console.error("[delete-workspace]", error);
        toast({ title: "Could not delete workspace", variant: "error" });
      }
    },
    [confirm, currentWorkspaceSlug, doSelectWorkspace, queryClient, toast, workspaces],
  );

  const selectProject = useCallback(
    (project: WorkspaceProjectSummary) => {
      void runGuardedNavigation(
        { projectId: project.id, type: "project" },
        () => {
          const nextRoute = getProjectRoute(
            workspaces,
            currentOrganizationSlug,
            currentWorkspaceSlug,
            project.slug,
          );
          if (nextRoute) navigateToRoute(nextRoute);
        },
      );
    },
    [
      currentOrganizationSlug,
      currentWorkspaceSlug,
      navigateToRoute,
      runGuardedNavigation,
      workspaces,
    ],
  );

  const prefetchProject = useCallback(
    (project: WorkspaceProjectSummary) => {
      if (!workspace) return;
      const route = getProjectRoute(
        workspaces,
        workspace.organizationSlug,
        currentWorkspaceSlug,
        project.slug,
      );
      if (route) preloadRoute({ href: buildProjectRouteHref(route) });
    },
    [currentWorkspaceSlug, preloadRoute, workspace, workspaces],
  );

  const renameProject = useCallback(
    (projectId: string, newName: string) => {
      renameProjectMutation.mutate({ name: newName, projectId });
    },
    [renameProjectMutation],
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      if (!workspace) return;
      deleteProjectMutation.mutate(projectId, {
        onSuccess: () => {
          const remaining = workspace.projects.filter((p) => p.id !== projectId);
          if (remaining.length > 0) {
            const nextRoute = getProjectRoute(
              workspaces,
              currentOrganizationSlug,
              currentWorkspaceSlug,
              remaining[0].slug,
            );
            if (nextRoute) navigateToRoute(nextRoute);
          }
        },
      });
    },
    [
      currentOrganizationSlug,
      currentWorkspaceSlug,
      deleteProjectMutation,
      navigateToRoute,
      workspace,
      workspaces,
    ],
  );

  const selectPlan = useCallback(
    (plan: PlanRecord) => {
      void runGuardedNavigation({ planId: plan.id, type: "plan" }, () => {
        if (!workspace) return;
        void navigate({
          href: buildWorkspacePlanHref(
            workspace.organizationSlug,
            currentWorkspaceSlug,
            plan.id,
          ),
        });
      });
    },
    [currentWorkspaceSlug, navigate, runGuardedNavigation, workspace],
  );

  const prefetchPlan = useCallback(
    (plan: PlanRecord) => {
      if (!workspace) return;
      preloadRoute({
        href: buildWorkspacePlanHref(
          workspace.organizationSlug,
          currentWorkspaceSlug,
          plan.id,
        ),
      });
    },
    [currentWorkspaceSlug, preloadRoute, workspace],
  );

  const selectInitiative = useCallback(
    (initiative: InitiativeRecord) => {
      void runGuardedNavigation(
        { initiativeId: initiative.id, type: "initiative" },
        () => {
          if (!workspace) return;
          void navigate({
            href: buildWorkspaceInitiativeHref(
              workspace.organizationSlug,
              currentWorkspaceSlug,
              initiative.id,
            ),
          });
        },
      );
    },
    [currentWorkspaceSlug, navigate, runGuardedNavigation, workspace],
  );

  const prefetchInitiative = useCallback(
    (initiative: InitiativeRecord) => {
      if (!workspace) return;
      preloadRoute({
        href: buildWorkspaceInitiativeHref(
          workspace.organizationSlug,
          currentWorkspaceSlug,
          initiative.id,
        ),
      });
    },
    [currentWorkspaceSlug, preloadRoute, workspace],
  );

  const renderItemMenu = useCallback(
    (item: SidebarItem) => {
      if (!workspace) return null;

      if (item.type === "project") {
        const projectView =
          item.data.projectViews.find(
            (view) => view.id === item.data.defaultProjectViewId,
          ) ?? item.data.projectViews[0];
        const projectUrl = projectView
          ? `${window.location.origin}${buildProjectRouteHref({
              orgSlug: workspace.organizationSlug,
              projectSlug: item.data.slug,
              viewId: projectView.id,
              viewType: projectView.viewType,
              workspaceSlug: currentWorkspaceSlug,
            })}`
          : window.location.origin;

        return (
          <SidebarProjectMenu
            darkSidebar={darkSidebar}
            onCopyLink={() => void navigator.clipboard.writeText(projectUrl)}
            onDelete={async () => {
              if (
                !(await confirm({
                  confirmLabel: "Delete",
                  description:
                    "This will permanently remove all tasks, views, and data in this project.",
                  title: `Delete "${item.name}"?`,
                  variant: "destructive",
                }))
              ) {
                return;
              }
              deleteProject(item.data.id);
            }}
            onDuplicate={() => undefined}
            onOpenInNewTab={() => window.open(projectUrl, "_blank")}
            onRename={async () => {
              const newName = await promptDialog({
                confirmLabel: "Rename",
                defaultValue: item.name,
                title: "Rename project",
              });
              if (newName && newName.trim() && newName.trim() !== item.name) {
                renameProject(item.data.id, newName.trim());
              }
            }}
            onToggleFavorite={() => undefined}
          />
        );
      }

      if (item.type === "plan") {
        const planUrl = `${window.location.origin}${buildWorkspacePlanHref(
          workspace.organizationSlug,
          currentWorkspaceSlug,
          item.data.id,
        )}`;

        return (
          <SidebarProjectMenu
            darkSidebar={darkSidebar}
            onCopyLink={() => void navigator.clipboard.writeText(planUrl)}
            onDelete={async () => {
              if (
                !(await confirm({
                  confirmLabel: "Delete",
                  description:
                    "This will permanently remove all boards and data in this plan.",
                  title: `Delete "${item.name}"?`,
                  variant: "destructive",
                }))
              ) {
                return;
              }
              deletePlanMutation.mutate(item.data.id, {
                onSuccess: () => {
                  if (activeSidebarItemId === `plan:${item.data.id}`) {
                    doSelectWorkspace(currentWorkspaceSlug, workspace.organizationSlug);
                  }
                },
              });
            }}
            onDuplicate={() => undefined}
            onOpenInNewTab={() => window.open(planUrl, "_blank")}
            onRename={async () => {
              const newName = await promptDialog({
                confirmLabel: "Rename",
                defaultValue: item.name,
                title: "Rename plan",
              });
              if (newName && newName.trim() && newName.trim() !== item.name) {
                renamePlanMutation.mutate({
                  name: newName.trim(),
                  planId: item.data.id,
                });
              }
            }}
            onToggleFavorite={() => undefined}
          />
        );
      }

      const initiativeUrl = `${window.location.origin}${buildWorkspaceInitiativeHref(
        workspace.organizationSlug,
        currentWorkspaceSlug,
        item.data.id,
      )}`;
      return (
        <SidebarProjectMenu
          darkSidebar={darkSidebar}
          onArchive={async () => {
            if (
              !(await confirm({
                confirmLabel: "Archive",
                description:
                  "This will archive the initiative. Linked cards are not affected.",
                title: `Archive "${item.name}"?`,
                variant: "destructive",
              }))
            ) {
              return;
            }
            archiveInitiativeMutation.mutate(item.data.id, {
              onSuccess: () => {
                if (activeSidebarItemId === `initiative:${item.data.id}`) {
                  void navigateWhenWarm({
                    location: {
                      href: buildWorkspaceInitiativesHref(
                        workspace.organizationSlug,
                        currentWorkspaceSlug,
                      ),
                    },
                    navigate,
                    router,
                  });
                }
              },
            });
          }}
          onCopyLink={() => void navigator.clipboard.writeText(initiativeUrl)}
          onDelete={async () => {
            if (
              !(await confirm({
                confirmLabel: "Delete",
                description:
                  "This will permanently remove the initiative. Linked cards are not deleted but will be unassigned.",
                title: `Delete "${item.name}"?`,
                variant: "destructive",
              }))
            ) {
              return;
            }
            deleteInitiativeMutation.mutate(item.data.id, {
              onSuccess: () => {
                if (activeSidebarItemId === `initiative:${item.data.id}`) {
                  void navigateWhenWarm({
                    location: {
                      href: buildWorkspaceInitiativesHref(
                        workspace.organizationSlug,
                        currentWorkspaceSlug,
                      ),
                    },
                    navigate,
                    router,
                  });
                }
              },
            });
          }}
          onDuplicate={() => undefined}
          onOpenInNewTab={() => window.open(initiativeUrl, "_blank")}
          onRename={async () => {
            const newName = await promptDialog({
              confirmLabel: "Rename",
              defaultValue: item.name,
              title: "Rename initiative",
            });
            if (newName && newName.trim() && newName.trim() !== item.name) {
              renameInitiativeMutation.mutate({
                initiativeId: item.data.id,
                name: newName.trim(),
              });
            }
          }}
          onToggleFavorite={() => undefined}
        />
      );
    },
    [
      activeSidebarItemId,
      archiveInitiativeMutation,
      confirm,
      currentWorkspaceSlug,
      darkSidebar,
      deleteInitiativeMutation,
      deleteProject,
      deletePlanMutation,
      doSelectWorkspace,
      navigate,
      promptDialog,
      renamePlanMutation,
      renameInitiativeMutation,
      renameProject,
      router,
      workspace,
    ],
  );

  const handleCreatePlan = useCallback(
    async (input: { planName: string; viewTypes: PlanViewType[] }) => {
      if (!workspace) return;
      try {
        const plan = await createPlanMutation.mutateAsync({
          name: input.planName,
          viewTypes: input.viewTypes,
          workspaceId: workspace.id,
        });
        createDialogs.setCreatePlanOpen(false);
        void navigate({
          href: buildWorkspacePlanHref(
            workspace.organizationSlug,
            currentWorkspaceSlug,
            plan.id,
          ),
        });
      } catch {
        toast({ title: "Could not create plan", variant: "error" });
      }
    },
    [createDialogs, createPlanMutation, currentWorkspaceSlug, navigate, toast, workspace],
  );

  const handleCreateInitiative = useCallback(
    async (input: { initiativeName: string }) => {
      if (!workspace) return;
      try {
        await createInitiativeMutation.mutateAsync({
          name: input.initiativeName,
          workspaceId: workspace.id,
        });
        createDialogs.setCreateInitiativeOpen(false);
        void navigate({
          href: buildWorkspaceInitiativesHref(
            workspace.organizationSlug,
            currentWorkspaceSlug,
          ),
        });
      } catch {
        toast({ title: "Could not create initiative", variant: "error" });
      }
    },
    [createDialogs, createInitiativeMutation, currentWorkspaceSlug, navigate, toast, workspace],
  );

  const signOut = useCallback(() => {
    signOutMutation.mutate(undefined, {
      onSuccess: () => void navigate({ to: loginRoutePath }),
    });
  }, [navigate, signOutMutation]);

  const saveWeekStartsOn = useCallback(
    async (value: WeekStartsOn) => {
      await updatePreferencesMutation.mutateAsync({ weekStartsOn: value });
    },
    [updatePreferencesMutation],
  );

  const openApiKeys = useCallback(async () => {
    if (!currentOrganizationSlug) return false;
    const allowed = await runRegisteredGuards();
    if (!allowed) return false;
    void navigate({ href: buildOrgApiKeysHref(currentOrganizationSlug) });
    return true;
  }, [currentOrganizationSlug, navigate, runRegisteredGuards]);

  const paletteNavigator = useMemo(
    () =>
      workspace
        ? createWorkspacePaletteNavigator({
            currentOrgSlug: workspace.organizationSlug,
            currentWorkspaceSlug: workspace.slug,
            navigateToRoute: (route) => navigateToRoute(route),
            workspaces,
          })
        : null,
    [navigateToRoute, workspace, workspaces],
  );

  return {
    confirm: { confirm, confirmDialogProps },
    promptDialog: { prompt: promptDialog, promptDialogProps },
    selectNavItem,
    prefetchNavItem,
    selectWikiPage,
    prefetchWikiPage,
    navigateToAllWikiPages,
    prefetchAllWikiPages,
    createWikiPage,
    selectWorkspace,
    prefetchWorkspace,
    renameWorkspace,
    deleteWorkspace,
    selectProject,
    prefetchProject,
    renameProject,
    deleteProject,
    selectPlan,
    prefetchPlan,
    selectInitiative,
    prefetchInitiative,
    renderItemMenu,
    handleCreatePlan,
    handleCreateInitiative,
    signOut,
    selectMode: setMode,
    saveWeekStartsOn,
    openApiKeys,
    paletteNavigator,
    paletteCommands: EMPTY_PALETTE_COMMANDS,
  };
}

