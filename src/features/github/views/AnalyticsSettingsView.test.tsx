/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsSettingsView } from "./AnalyticsSettingsView";

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock("../../../components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

afterEach(() => {
  cleanup();
});

function renderView(
  overrides: Partial<ComponentProps<typeof AnalyticsSettingsView>> = {},
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSaveBoardConfig = vi.fn().mockResolvedValue(undefined);

  render(
    <AnalyticsSettingsView
      boardConfig={{ repoMode: "unconfigured", selectedRepoId: null }}
      canEditProject
      onSave={onSave}
      onSaveBoardConfig={onSaveBoardConfig}
      projectRepositories={[
        {
          colorIndex: 0,
          connectionSourceId: "source-1",
          createdAt: "2026-04-02T00:00:00Z",
          defaultBranch: "main",
          fullName: "acme/repo-one",
          githubRepoId: 101,
          historyBackfilledAt: "2026-04-02T00:00:00Z",
          id: "repo-1",
          isPrivate: true,
          lastSyncedAt: "2026-04-02T00:00:00Z",
          name: "repo-one",
          projectId: "project-1",
        },
        {
          colorIndex: 1,
          connectionSourceId: "source-1",
          createdAt: "2026-04-02T00:00:00Z",
          defaultBranch: "main",
          fullName: "acme/repo-two",
          githubRepoId: 102,
          historyBackfilledAt: "2026-04-02T00:00:00Z",
          id: "repo-2",
          isPrivate: true,
          lastSyncedAt: "2026-04-02T00:00:00Z",
          name: "repo-two",
          projectId: "project-1",
        },
      ]}
      projectSettings={null}
      {...overrides}
    />,
  );

  return {
    onSave,
    onSaveBoardConfig,
  };
}

describe("AnalyticsSettingsView", () => {
  it("lets writers scope a board to one selected repo", async () => {
    const user = userEvent.setup();
    const { onSaveBoardConfig } = renderView();

    await user.click(
      screen.getByRole("button", { name: /One repo for this board/i }),
    );
    await user.selectOptions(screen.getByLabelText("Repository"), "repo-2");
    await user.click(screen.getByRole("button", { name: "Save repo scope" }));

    expect(onSaveBoardConfig).toHaveBeenCalledWith({
      repoMode: "selected",
      selectedRepoId: "repo-2",
    });
  });

  it("lets writers search timezones by abbreviation and saves the canonical value", async () => {
    const user = userEvent.setup();
    const { onSave } = renderView();

    const timezoneInput = screen.getByRole("combobox", { name: /Timezone/ });

    await user.click(timezoneInput);
    await user.type(timezoneInput, "ist");
    await user.click(screen.getByRole("option", { name: /Kolkata, India/i }));
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Kolkata" }),
    );
  });
});
