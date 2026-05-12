import { lazyWithRetry } from "../../app/lazyWithRetry";
import type { CreateCardInput } from "../cards/card.types";
import type { PlanViewType } from "../plans/plan.types";
import { resolveCompleteSprintMoveTarget } from "../sprints/complete-sprint-target";
import type { CompleteSprintAction } from "../sprints/sprint.types";
import type { ProjectSprintRecord } from "../sprints/sprint.types";
import { useProjectChrome } from "./project/ProjectChromeContext";
import { useProjectData } from "./project/ProjectDataContext";
import { LazySurfaceBoundary } from "./LazySurfaceBoundary";
import { CreateInitiativeDialog } from "../setup/CreateInitiativeDialog";
import { CreatePlanDialog } from "../setup/CreatePlanDialog";
import { CreateProjectDialog } from "../setup/CreateProjectDialog";
import { CreateWorkspaceDialog } from "../setup/CreateWorkspaceDialog";

const AccountSettingsDialog = lazyWithRetry(
  () =>
    import("../auth/AccountSettingsDialog").then((m) => ({
      default: m.AccountSettingsDialog,
    })),
  { recovery: "error-boundary" },
);
const AutomationManagerDialog = lazyWithRetry(
  () =>
    import("../automations/AutomationManagerDialog").then((m) => ({
      default: m.AutomationManagerDialog,
    })),
  { recovery: "error-boundary" },
);
const CardSheet = lazyWithRetry(
  () => import("../cards/CardSheet").then((m) => ({ default: m.CardSheet })),
  { recovery: "error-boundary" },
);
const FieldManagerDialog = lazyWithRetry(
  () =>
    import("../fields/FieldManagerDialog").then((m) => ({
      default: m.FieldManagerDialog,
    })),
  { recovery: "error-boundary" },
);
const CreateSprintDialog = lazyWithRetry(
  () =>
    import("./views/CreateSprintDialog").then((m) => ({
      default: m.CreateSprintDialog,
    })),
  { recovery: "error-boundary" },
);
const CompleteSprintDialog = lazyWithRetry(
  () =>
    import("./views/CompleteSprintPopover").then((m) => ({
      default: m.CompleteSprintDialog,
    })),
  { recovery: "error-boundary" },
);

type NavigateRoute = {
  orgSlug: string;
  projectSlug: string;
  viewId: string;
  viewType?: string;
  workspaceSlug: string;
};

export type ProjectShellDialogsProps = {
  isCardSheetOpen: boolean;
  selectedCardId: string | null;
  cardDefaults: Partial<CreateCardInput> | null;
  onCardCreated: (cardId: string) => void;
  onCardSheetClose: () => void;
  onCardDirtyStateChange: (dirty: boolean) => void;
  isFieldManagerOpen: boolean;
  onFieldManagerClose: () => void;
  isAutomationManagerOpen: boolean;
  onAutomationManagerClose: () => void;
  isAccountSettingsOpen: boolean;
  onAccountSettingsClose: () => void;
  createWorkspaceOpen: boolean;
  onCreateWorkspaceClose: () => void;
  onWorkspaceCreated: (route: NavigateRoute) => void;
  createPlanOpen: boolean;
  defaultPlanViewType?: PlanViewType;
  onCreatePlanClose: () => void;
  onPlanCreate: (input: {
    planName: string;
    viewTypes: PlanViewType[];
  }) => Promise<void>;
  createInitiativeOpen: boolean;
  onCreateInitiativeClose: () => void;
  onInitiativeCreate: (input: { initiativeName: string }) => Promise<void>;
  createProjectOpen: boolean;
  onCreateProjectClose: () => void;
  onProjectCreated: (route: NavigateRoute) => void;
  workspaceId: string;
  createSprintDialogOpen: boolean;
  editingSprint: Pick<
    ProjectSprintRecord,
    "endDate" | "goal" | "id" | "name" | "startDate"
  > | null;
  onCreateSprintClose: () => void;
  onSubmitSprint: (input: {
    endDate?: string | null;
    goal?: string | null;
    name: string;
    startDate?: string | null;
  }) => void;
  createSprintDateDefaults: {
    endDate: string | null;
    startDate: string | null;
  };
  completeSprintState: {
    incompleteCount: number;
    sprintId: string;
    sprintName: string;
  } | null;
  onCompleteSprintClose: () => void;
  onCompleteSprintAction: (action: CompleteSprintAction) => void;
};

export function ProjectShellDialogs(props: ProjectShellDialogsProps) {
  const {
    canEditProject,
    currentOrgRole,
    currentUser,
    project,
    projectMembers,
    projectId,
    workspace,
  } = useProjectChrome();
  const {
    customFields,
    handleMoveCardToGroup,
    handleMoveCardToSprint,
    projectGroups,
    projectSprints,
  } = useProjectData();
  const completeSprintMoveTarget = props.completeSprintState
    ? resolveCompleteSprintMoveTarget(
        projectSprints,
        props.completeSprintState.sprintId,
      )
    : null;

  return (
    <>
      {props.isCardSheetOpen ? (
        <LazySurfaceBoundary
          label="Card"
          onDismiss={props.onCardSheetClose}
          variant="dialog"
        >
          <CardSheet
            builtinFieldLabels={project.builtinFieldLabels}
            canEditProject={canEditProject}
            priorityOptions={project.priorityOptions}
            cardId={props.selectedCardId}
            currentUser={currentUser}
            defaults={props.cardDefaults}
            detailLayout="default"
            isOpen={props.isCardSheetOpen}
            onCardCreated={props.onCardCreated}
            onClose={props.onCardSheetClose}
            onDirtyStateChange={props.onCardDirtyStateChange}
            onSetCardGroup={handleMoveCardToGroup}
            onSetCardSprint={handleMoveCardToSprint}
            projectGroups={projectGroups}
            projectMembers={projectMembers}
            projectId={projectId}
            projectName={project.name}
            projectSprints={projectSprints}
            statusOptions={project.statusOptions}
            workspaceId={workspace.id}
            customFields={customFields}
          />
        </LazySurfaceBoundary>
      ) : null}

      {props.isFieldManagerOpen ? (
        <LazySurfaceBoundary
          label="Fields"
          onDismiss={props.onFieldManagerClose}
          variant="dialog"
        >
          <FieldManagerDialog
            customFields={customFields}
            isOpen={props.isFieldManagerOpen}
            onClose={props.onFieldManagerClose}
            projectId={projectId}
          />
        </LazySurfaceBoundary>
      ) : null}

      {props.isAutomationManagerOpen ? (
        <LazySurfaceBoundary
          label="Automation"
          onDismiss={props.onAutomationManagerClose}
          variant="dialog"
        >
          <AutomationManagerDialog
            canEditProject={canEditProject}
            customFields={customFields}
            groups={projectGroups}
            isOpen={props.isAutomationManagerOpen}
            members={projectMembers}
            onClose={props.onAutomationManagerClose}
            priorityOptions={project.priorityOptions}
            projectId={projectId}
            projectName={project.name}
            statusOptions={project.statusOptions}
          />
        </LazySurfaceBoundary>
      ) : null}

      {props.createWorkspaceOpen ? (
        <CreateWorkspaceDialog
          canCreateWorkspace={currentOrgRole === 'admin'}
          isOpen={props.createWorkspaceOpen}
          onClose={props.onCreateWorkspaceClose}
          onCreated={props.onWorkspaceCreated}
          organizationId={workspace.organizationId}
        />
      ) : null}

      {props.createPlanOpen ? (
        <CreatePlanDialog
          defaultViewType={props.defaultPlanViewType}
          isOpen={props.createPlanOpen}
          onClose={props.onCreatePlanClose}
          onCreate={props.onPlanCreate}
        />
      ) : null}

      {props.createInitiativeOpen ? (
        <CreateInitiativeDialog
          isOpen={props.createInitiativeOpen}
          onClose={props.onCreateInitiativeClose}
          onCreate={props.onInitiativeCreate}
        />
      ) : null}

      {props.createProjectOpen ? (
        <CreateProjectDialog
          isOpen={props.createProjectOpen}
          onClose={props.onCreateProjectClose}
          onCreated={props.onProjectCreated}
          workspaceId={props.workspaceId}
        />
      ) : null}

      {props.isAccountSettingsOpen ? (
        <LazySurfaceBoundary
          label="Settings"
          onDismiss={props.onAccountSettingsClose}
          variant="dialog"
        >
          <AccountSettingsDialog
            currentUser={currentUser}
            isOpen={props.isAccountSettingsOpen}
            onClose={props.onAccountSettingsClose}
            organizationId={workspace.organizationId}
          />
        </LazySurfaceBoundary>
      ) : null}

      {props.createSprintDialogOpen ? (
        <LazySurfaceBoundary
          label={props.editingSprint ? "Edit sprint" : "Sprint"}
          onDismiss={props.onCreateSprintClose}
          variant="dialog"
        >
          <CreateSprintDialog
            defaultEndDate={props.createSprintDateDefaults.endDate ?? ""}
            defaultStartDate={props.createSprintDateDefaults.startDate ?? ""}
            existingSprintCount={projectSprints.length}
            initialSprint={props.editingSprint}
            onClose={props.onCreateSprintClose}
            onSubmitSprint={props.onSubmitSprint}
            open={props.createSprintDialogOpen}
          />
        </LazySurfaceBoundary>
      ) : null}

      {props.completeSprintState ? (
        <LazySurfaceBoundary
          label="Complete sprint"
          onDismiss={props.onCompleteSprintClose}
          variant="dialog"
        >
          <CompleteSprintDialog
            incompleteCount={props.completeSprintState.incompleteCount}
            moveTarget={completeSprintMoveTarget!}
            onClose={props.onCompleteSprintClose}
            onComplete={props.onCompleteSprintAction}
            sprintName={props.completeSprintState.sprintName}
          />
        </LazySurfaceBoundary>
      ) : null}
    </>
  );
}
