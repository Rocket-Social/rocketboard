/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateInitiativeDialog } from "./CreateInitiativeDialog";

afterEach(cleanup);

describe("CreateInitiativeDialog", () => {
  it("renders name input and create button; create disabled when name empty", () => {
    render(
      <CreateInitiativeDialog
        isOpen
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("e.g., Q3 Goals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create initiative" })).toBeDisabled();
  });

  it("submit calls onCreate with trimmed name", async () => {
    const user = userEvent.setup();
    const onCreateMock = vi.fn(async () => undefined);

    render(
      <CreateInitiativeDialog
        isOpen
        onClose={vi.fn()}
        onCreate={onCreateMock}
      />,
    );

    await user.type(screen.getByPlaceholderText("e.g., Q3 Goals"), "  Design Goals  ");
    await user.click(screen.getByRole("button", { name: "Create initiative" }));

    await waitFor(() => {
      expect(onCreateMock).toHaveBeenCalledWith({
        initiativeName: "Design Goals",
      });
    });
  });

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup();
    const onCloseMock = vi.fn();

    render(
      <CreateInitiativeDialog
        isOpen
        onClose={onCloseMock}
        onCreate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCloseMock).toHaveBeenCalled();
  });

  it("Close X button calls onClose", async () => {
    const user = userEvent.setup();
    const onCloseMock = vi.fn();

    render(
      <CreateInitiativeDialog
        isOpen
        onClose={onCloseMock}
        onCreate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onCloseMock).toHaveBeenCalled();
  });
});
