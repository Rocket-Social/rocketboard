/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { lazyWithRetrySpy } = vi.hoisted(() => ({
  lazyWithRetrySpy: vi.fn(
    () =>
      function MockLazySurface() {
        return <div data-testid="lazy-surface" />;
      },
  ),
}));

vi.mock("../../app/lazyWithRetry", () => ({
  lazyWithRetry: lazyWithRetrySpy,
}));

vi.mock("./project/ProjectChromeContext", () => ({
  useProjectChrome: () => ({
    canEditProject: true,
    currentUser: { id: "user-1", name: "Test User" },
    project: {
      builtinFieldLabels: {},
      name: "Product Team",
      priorityOptions: [],
      statusOptions: [],
    },
    projectId: "project-1",
    projectMembers: [],
    workspace: { id: "workspace-1" },
    workspaces: [],
  }),
}));

vi.mock("./project/ProjectDataContext", () => ({
  useProjectData: () => ({
    customFields: [],
    handleMoveCardToGroup: vi.fn(),
    handleMoveCardToSprint: vi.fn(),
    projectGroups: [],
    projectSprints: [],
  }),
}));

vi.mock("../setup/CreatePlanDialog", () => ({
  CreatePlanDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-plan-dialog" /> : null,
}));

vi.mock("../setup/CreateProjectDialog", () => ({
  CreateProjectDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-project-dialog" /> : null,
}));

vi.mock("../setup/CreateWorkspaceDialog", () => ({
  CreateWorkspaceDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-workspace-dialog" /> : null,
}));

vi.mock("./views/CompleteSprintPopover", () => ({
  CompleteSprintDialog: () => <div data-testid="complete-sprint-dialog" />,
}));

import { ProjectShellDialogs } from "./ProjectShellDialogs";

describe("ProjectShellDialogs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders quick-create dialogs eagerly and keeps lazyWithRetry scoped to interactive heavy surfaces", () => {
    render(
      <ProjectShellDialogs
        cardDefaults={null}
        completeSprintState={null}
        createPlanOpen
        createProjectOpen
        createSprintDateDefaults={{ endDate: null, startDate: null }}
        createSprintDialogOpen={false}
        createWorkspaceOpen
        editingSprint={null}
        isAccountSettingsOpen={false}
        isAutomationManagerOpen={false}
        isCardSheetOpen={false}
        isFieldManagerOpen={false}
        onAccountSettingsClose={vi.fn()}
        onAutomationManagerClose={vi.fn()}
        onCardCreated={vi.fn()}
        onCardDirtyStateChange={vi.fn()}
        onCardSheetClose={vi.fn()}
        onCompleteSprintAction={vi.fn()}
        onCompleteSprintClose={vi.fn()}
        onCreatePlanClose={vi.fn()}
        createInitiativeOpen={false}
        onCreateInitiativeClose={vi.fn()}
        onInitiativeCreate={vi.fn(async () => undefined)}
        onCreateProjectClose={vi.fn()}
        onCreateSprintClose={vi.fn()}
        onCreateWorkspaceClose={vi.fn()}
        onFieldManagerClose={vi.fn()}
        onPlanCreate={vi.fn(async () => undefined)}
        onProjectCreated={vi.fn()}
        onSubmitSprint={vi.fn()}
        onWorkspaceCreated={vi.fn()}
        selectedCardId={null}
        workspaceId="workspace-1"
      />,
    );

    expect(screen.getByTestId("create-project-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("create-plan-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("create-workspace-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-surface")).not.toBeInTheDocument();
    expect(lazyWithRetrySpy).toHaveBeenCalledTimes(6);
    const lazyCalls = lazyWithRetrySpy.mock.calls as unknown as Array<
      [unknown, { recovery?: string } | undefined]
    >;
    expect(
      lazyCalls.every(([, options]) => options?.recovery === "error-boundary"),
    ).toBe(true);
  });

  it("does not render the legacy project share dialog", () => {
    render(
      <ProjectShellDialogs
        cardDefaults={null}
        completeSprintState={null}
        createPlanOpen={false}
        createProjectOpen={false}
        createSprintDateDefaults={{ endDate: null, startDate: null }}
        createSprintDialogOpen={false}
        createWorkspaceOpen={false}
        editingSprint={null}
        isAccountSettingsOpen={false}
        isAutomationManagerOpen={false}
        isCardSheetOpen={false}
        isFieldManagerOpen={false}
        onAccountSettingsClose={vi.fn()}
        onAutomationManagerClose={vi.fn()}
        onCardCreated={vi.fn()}
        onCardDirtyStateChange={vi.fn()}
        onCardSheetClose={vi.fn()}
        onCompleteSprintAction={vi.fn()}
        onCompleteSprintClose={vi.fn()}
        onCreatePlanClose={vi.fn()}
        createInitiativeOpen={false}
        onCreateInitiativeClose={vi.fn()}
        onInitiativeCreate={vi.fn(async () => undefined)}
        onCreateProjectClose={vi.fn()}
        onCreateSprintClose={vi.fn()}
        onCreateWorkspaceClose={vi.fn()}
        onFieldManagerClose={vi.fn()}
        onPlanCreate={vi.fn(async () => undefined)}
        onProjectCreated={vi.fn()}
        onSubmitSprint={vi.fn()}
        onWorkspaceCreated={vi.fn()}
        selectedCardId={null}
        workspaceId="workspace-1"
      />,
    );

    expect(screen.queryByTestId("project-share-dialog")).not.toBeInTheDocument();
  });
});
