// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../test/queryClient";
import { AccountSettingsDialog } from "./AccountSettingsDialog";

const confirmMock = vi.fn();

vi.mock("../../hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    confirmDialogProps: {
      confirmLabel: "Confirm",
      isOpen: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      title: "Confirm",
      variant: "destructive" as const,
    },
  }),
}));

afterEach(() => {
  cleanup();
  confirmMock.mockReset();
});

const currentUser = {
  email: "user@example.com",
  githubLogin: "octocat",
  id: "user-1",
  initials: "TU",
  isInternalAdmin: false,
  name: "Test User",
  weekStartsOn: "sunday",
} satisfies ComponentProps<typeof AccountSettingsDialog>["currentUser"];

function renderDialog(
  overrides: Partial<ComponentProps<typeof AccountSettingsDialog>> = {},
) {
  const onClose = vi.fn();
  const queryClient = createTestQueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AccountSettingsDialog
        currentUser={currentUser}
        isOpen
        onClose={onClose}
        {...overrides}
      />
    </QueryClientProvider>,
  );

  return {
    ...view,
    onClose,
    queryClient,
  };
}

describe("AccountSettingsDialog", () => {
  it("renders the profile form when opened", () => {
    renderDialog();

    expect(screen.getByText("Manage your profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Test User");
    expect(screen.getByLabelText("GitHub login")).toHaveValue("octocat");
  });

  it("resets edited values after closing and reopening", () => {
    const view = renderDialog();

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Changed Name" },
    });
    expect(screen.getByLabelText("Full name")).toHaveValue("Changed Name");

    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <AccountSettingsDialog
          currentUser={currentUser}
          isOpen={false}
          onClose={view.onClose}
        />
      </QueryClientProvider>,
    );

    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <AccountSettingsDialog
          currentUser={currentUser}
          isOpen
          onClose={view.onClose}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Full name")).toHaveValue("Test User");
  });
});
