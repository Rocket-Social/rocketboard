import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { TimezoneCombobox } from "../../../components/TimezoneCombobox";
import { Button } from "../../../components/ui/button";
import { useToast } from "../../../components/ui/toast";
import { isSupportedTimezone, normalizeTimezone } from "../../../lib/timezone";
import {
  deriveSprintWindows,
  getDefaultAnalyticsSettings,
} from "../github.analytics";
import { buildGitHubBoardConfig } from "../github.board-config";
import type {
  GitHubAnalyticsSettings,
  GitHubBoardConfig,
  GitHubProjectSettings,
  GitHubRepository,
} from "../github.types";

type AnalyticsSettingsViewProps = {
  boardConfig: GitHubBoardConfig;
  canEditProject: boolean;
  onOpenProjectRepoManager?: () => void;
  projectSettings: GitHubProjectSettings | null;
  projectRepositories: GitHubRepository[];
  onSave: (settings: GitHubAnalyticsSettings) => Promise<void>;
  onSaveBoardConfig: (config: GitHubBoardConfig) => Promise<void>;
};

export function AnalyticsSettingsView({
  boardConfig,
  canEditProject,
  onOpenProjectRepoManager,
  projectRepositories,
  projectSettings,
  onSave,
  onSaveBoardConfig,
}: AnalyticsSettingsViewProps) {
  const { toast } = useToast();
  const defaults = getDefaultAnalyticsSettings();
  const [repoMode, setRepoMode] = useState<GitHubBoardConfig["repoMode"]>(
    boardConfig.repoMode,
  );
  const [selectedRepoId, setSelectedRepoId] = useState(
    boardConfig.selectedRepoId ?? "",
  );
  const [isSavingBoardConfig, setIsSavingBoardConfig] = useState(false);
  const [boardConfigSaved, setBoardConfigSaved] = useState(false);

  const [sprintLengthWeeks, setSprintLengthWeeks] = useState(
    projectSettings?.analyticsSprintLengthWeeks ?? defaults.sprintLengthWeeks,
  );
  const [lastSprintEndDate, setLastSprintEndDate] = useState(
    projectSettings?.analyticsLastSprintEndDate ?? defaults.lastSprintEndDate,
  );
  const [timezone, setTimezone] = useState(
    normalizeTimezone(
      projectSettings?.analyticsTimezone ?? defaults.timezone,
    ) ?? "UTC",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync form state when server settings arrive (e.g. after query resolves)
  useEffect(() => {
    setRepoMode(boardConfig.repoMode);
    setSelectedRepoId(boardConfig.selectedRepoId ?? "");
  }, [boardConfig.repoMode, boardConfig.selectedRepoId]);

  useEffect(() => {
    if (projectSettings?.analyticsSprintLengthWeeks != null) {
      setSprintLengthWeeks(projectSettings.analyticsSprintLengthWeeks);
    }
    if (projectSettings?.analyticsLastSprintEndDate != null) {
      setLastSprintEndDate(projectSettings.analyticsLastSprintEndDate);
    }
    if (projectSettings?.analyticsTimezone != null) {
      setTimezone(
        normalizeTimezone(projectSettings.analyticsTimezone) ?? "UTC",
      );
    }
  }, [
    projectSettings?.analyticsSprintLengthWeeks,
    projectSettings?.analyticsLastSprintEndDate,
    projectSettings?.analyticsTimezone,
  ]);

  const previewWindows = useMemo(() => {
    if (!lastSprintEndDate || sprintLengthWeeks < 1) return [];
    return deriveSprintWindows(
      { sprintLengthWeeks, lastSprintEndDate, timezone },
      3,
    );
  }, [sprintLengthWeeks, lastSprintEndDate, timezone]);

  const selectedRepo = useMemo(
    () =>
      projectRepositories.find(
        (repository) => repository.id === selectedRepoId,
      ) ?? null,
    [projectRepositories, selectedRepoId],
  );
  const isRepoSelectionMissing = repoMode === "selected" && !selectedRepo;
  const hasProjectRepositories = projectRepositories.length > 0;

  const handleSaveBoardScope = useCallback(async () => {
    if (repoMode === "unconfigured") {
      toast({
        title: "Choose a repo scope for this board before saving.",
        variant: "error",
      });
      return;
    }

    if (repoMode === "selected" && !selectedRepo) {
      toast({
        title: "Pick a repository for this board before saving.",
        variant: "error",
      });
      return;
    }

    setIsSavingBoardConfig(true);
    try {
      await onSaveBoardConfig(
        buildGitHubBoardConfig({
          repoMode: repoMode === "all" ? "all" : "selected",
          selectedRepoId: repoMode === "selected" ? selectedRepoId : null,
        }),
      );
      setBoardConfigSaved(true);
      setTimeout(() => setBoardConfigSaved(false), 2000);
    } catch {
      toast({
        title: "Failed to save repo scope. Try again.",
        variant: "error",
      });
    } finally {
      setIsSavingBoardConfig(false);
    }
  }, [onSaveBoardConfig, repoMode, selectedRepo, selectedRepoId, toast]);

  const handleSave = useCallback(async () => {
    if (sprintLengthWeeks < 1 || sprintLengthWeeks > 52) {
      toast({
        title: "Sprint length must be between 1 and 52 weeks.",
        variant: "error",
      });
      return;
    }
    if (!isSupportedTimezone(timezone)) {
      toast({ title: "Invalid timezone selected.", variant: "error" });
      return;
    }

    setIsSaving(true);
    try {
      await onSave({ sprintLengthWeeks, lastSprintEndDate, timezone });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      toast({ title: "Failed to save settings. Try again.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [sprintLengthWeeks, lastSprintEndDate, timezone, onSave, toast]);

  return (
    <div className="p-4">
      <div className="mx-auto max-w-2xl">
        <h3 className="text-lg font-semibold text-text-strong">
          GitHub Board Settings
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Choose which attached repositories this board should show, then tune
          how sprint analytics are grouped.
        </p>

        <div className="mt-6 space-y-5">
          <section className="rounded-2xl border border-border-subtle bg-surface-base p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-strong">
                  Repo scope for this board
                </h4>
                <p className="mt-1 text-xs text-text-muted">
                  Project GitHub sync stays shared, but each GitHub board can
                  now decide which repo set it displays.
                </p>
              </div>
              {onOpenProjectRepoManager ? (
                <Button
                  onClick={onOpenProjectRepoManager}
                  size="compact"
                  type="button"
                  variant="secondary"
                >
                  Manage project repos
                </Button>
              ) : null}
            </div>

            {!hasProjectRepositories ? (
              <div className="mt-4 rounded-xl border border-dashed border-border-subtle bg-canvas-accent px-4 py-3 text-sm text-text-muted">
                No repositories are attached to this project yet. Attach a
                project repo first, then come back here to scope this board.
              </div>
            ) : null}

            {boardConfig.repoMode === "unconfigured" ? (
              <div className="mt-4 rounded-xl border border-[#a86c0f]/20 bg-[#a86c0f]/5 px-4 py-3 text-sm text-[#8a5b10]">
                This board does not have a repo scope yet. Pick one explicitly
                so it does not inherit another board’s repository.
              </div>
            ) : null}

            {boardConfig.repoMode === "selected" &&
            boardConfig.selectedRepoId &&
            !projectRepositories.some(
              (repository) => repository.id === boardConfig.selectedRepoId,
            ) ? (
              <div className="mt-4 rounded-xl border border-[#a13d34]/20 bg-[#a13d34]/5 px-4 py-3 text-sm text-[#8f3a31]">
                The repo previously selected for this board is no longer
                attached to the project. Choose a new repo and save.
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                  repoMode === "all"
                    ? "border-[#335c8f]/40 bg-[#335c8f]/5"
                    : "border-border-subtle bg-surface-elevated hover:bg-canvas-accent"
                }`}
                disabled={!canEditProject || !hasProjectRepositories}
                onClick={() => setRepoMode("all")}
                type="button"
              >
                <div className="text-sm font-semibold text-text-strong">
                  All project repos
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  This board shows every repository currently attached to the
                  project.
                </div>
              </button>

              <button
                className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                  repoMode === "selected"
                    ? "border-[#335c8f]/40 bg-[#335c8f]/5"
                    : "border-border-subtle bg-surface-elevated hover:bg-canvas-accent"
                }`}
                disabled={!canEditProject || !hasProjectRepositories}
                onClick={() => setRepoMode("selected")}
                type="button"
              >
                <div className="text-sm font-semibold text-text-strong">
                  One repo for this board
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  Use this when you want separate GitHub boards for different
                  repositories.
                </div>
              </button>
            </div>

            {repoMode === "selected" ? (
              <div className="mt-4">
                <label
                  className="text-sm font-medium text-text-strong"
                  htmlFor="board-repo-select"
                >
                  Repository
                </label>
                <select
                  className="mt-1 block w-full rounded-sm border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-strong focus:outline-none focus:ring-2 focus:ring-[#bf6224]/30 disabled:opacity-50"
                  disabled={!canEditProject || !hasProjectRepositories}
                  id="board-repo-select"
                  onChange={(event) => setSelectedRepoId(event.target.value)}
                  value={selectedRepoId}
                >
                  <option value="">Choose a repo…</option>
                  {projectRepositories.map((repository) => (
                    <option key={repository.id} value={repository.id}>
                      {repository.fullName}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-text-muted">
                  {selectedRepo
                    ? `This board will focus on ${selectedRepo.fullName}.`
                    : "Pick one attached repo to scope this board."}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {canEditProject ? (
                <Button
                  disabled={
                    !hasProjectRepositories ||
                    repoMode === "unconfigured" ||
                    isRepoSelectionMissing ||
                    isSavingBoardConfig
                  }
                  onClick={() => void handleSaveBoardScope()}
                  type="button"
                  variant="primary"
                >
                  {isSavingBoardConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : boardConfigSaved ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {boardConfigSaved ? "Saved" : "Save repo scope"}
                </Button>
              ) : (
                <p className="text-xs text-text-muted">
                  Project write access is required to change the board repo scope.
                </p>
              )}

              {repoMode === "all" ? (
                <span className="text-xs text-text-muted">
                  Current draft: all {projectRepositories.length} attached
                  repos.
                </span>
              ) : repoMode === "selected" && selectedRepo ? (
                <span className="text-xs text-text-muted">
                  Current draft: {selectedRepo.fullName}.
                </span>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface-base p-4">
            <div>
              <h4 className="text-sm font-semibold text-text-strong">
                Sprint analytics
              </h4>
              <p className="mt-1 text-xs text-text-muted">
                These settings define how GitHub activity is grouped into sprint
                retros.
              </p>
            </div>

            <div className="mt-6 space-y-5">
              {/* Sprint length */}
              <div>
                <label
                  className="text-sm font-medium text-text-strong"
                  htmlFor="sprint-length"
                >
                  Sprint length (weeks)
                </label>
                <input
                  className="mt-1 block w-full rounded-sm border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-strong focus:outline-none focus:ring-2 focus:ring-[#bf6224]/30 disabled:opacity-50"
                  disabled={!canEditProject}
                  id="sprint-length"
                  max={52}
                  min={1}
                  onChange={(e) =>
                    setSprintLengthWeeks(
                      Math.max(1, Math.min(52, Number(e.target.value) || 1)),
                    )
                  }
                  type="number"
                  value={sprintLengthWeeks}
                />
              </div>

              {/* Last sprint end date */}
              <div>
                <label
                  className="text-sm font-medium text-text-strong"
                  htmlFor="sprint-end-date"
                >
                  Last sprint end date
                </label>
                <input
                  className="mt-1 block w-full rounded-sm border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-strong focus:outline-none focus:ring-2 focus:ring-[#bf6224]/30 disabled:opacity-50"
                  disabled={!canEditProject}
                  id="sprint-end-date"
                  onChange={(e) => setLastSprintEndDate(e.target.value)}
                  type="date"
                  value={lastSprintEndDate}
                />
              </div>

              {/* Timezone */}
              <div>
                <label
                  className="text-sm font-medium text-text-strong"
                  htmlFor="timezone"
                >
                  Timezone
                </label>
                <TimezoneCombobox
                  className="mt-1"
                  disabled={!canEditProject}
                  inputClassName="rounded-sm focus:ring-[#bf6224]/30"
                  inputId="timezone"
                  onChange={setTimezone}
                  value={timezone}
                />
              </div>

              {/* Sprint preview */}
              {previewWindows.length > 0 ? (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    Sprint preview
                  </div>
                  <div className="mt-2 space-y-1">
                    {previewWindows.map((w, i) => (
                      <div
                        key={w.startDate}
                        className="rounded-sm bg-canvas-accent px-3 py-2 font-mono text-sm text-text-medium"
                      >
                        Sprint {i + 1}: {w.startDate} — {w.endDate}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-text-muted">
                  Save settings to see sprint windows.
                </div>
              )}

              {/* Save button */}
              {canEditProject ? (
                <Button
                  disabled={isSaving}
                  onClick={handleSave}
                  type="button"
                  variant="primary"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {saveSuccess ? "Saved" : "Save settings"}
                </Button>
              ) : (
                <p className="text-xs text-text-muted">
                  Project write access is required to edit these settings.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
