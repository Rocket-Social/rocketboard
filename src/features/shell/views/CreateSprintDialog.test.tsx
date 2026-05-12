// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateSprintDialog } from "./CreateSprintDialog";

afterEach(() => {
  cleanup();
});

function renderDialog(
  overrides: Partial<ComponentProps<typeof CreateSprintDialog>> = {},
) {
  const onClose = vi.fn();
  const onSubmitSprint = vi.fn();

  const view = render(
    <CreateSprintDialog
      defaultEndDate="2026-05-03"
      defaultStartDate="2026-04-19"
      existingSprintCount={2}
      initialSprint={null}
      onClose={onClose}
      onSubmitSprint={onSubmitSprint}
      open
      {...overrides}
    />,
  );

  return {
    ...view,
    onClose,
    onSubmitSprint,
  };
}

describe("CreateSprintDialog", () => {
  it("renders the supplied default date values", () => {
    renderDialog();

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-04-19");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-05-03");
  });

  it("resets edited values when the dialog is reopened", () => {
    const firstRender = renderDialog();

    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-04-20" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-05-04" },
    });

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-04-20");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-05-04");

    firstRender.unmount();

    renderDialog({
      defaultEndDate: "2026-05-17",
      defaultStartDate: "2026-05-03",
    });

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-05-03");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-05-17");
  });

  it("prefills the existing sprint when editing", () => {
    renderDialog({
      initialSprint: {
        endDate: "2026-05-05",
        goal: "Ship the release",
        id: "sprint-9",
        name: "Sprint 9",
        startDate: "2026-04-28",
      },
    });

    expect(
      screen.getByRole("heading", { name: "Edit Sprint" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Sprint 9");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-04-28");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-05-05");
    expect(screen.getByLabelText("Goal")).toHaveValue("Ship the release");
    expect(
      screen.getByRole("button", { name: "Save Changes" }),
    ).toBeInTheDocument();
  });

  it("submits edited sprint values", () => {
    const { onClose, onSubmitSprint } = renderDialog({
      initialSprint: {
        endDate: "2026-05-05",
        goal: "Ship the release",
        id: "sprint-9",
        name: "Sprint 9",
        startDate: "2026-04-28",
      },
    });

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Sprint 9B" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-04-29" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-05-06" },
    });
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Lock the beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSubmitSprint).toHaveBeenCalledWith({
      endDate: "2026-05-06",
      goal: "Lock the beta",
      name: "Sprint 9B",
      startDate: "2026-04-29",
    });
    expect(onClose).toHaveBeenCalled();
  });
});
