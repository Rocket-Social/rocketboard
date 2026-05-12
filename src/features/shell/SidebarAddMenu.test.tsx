/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarAddMenu } from "./SidebarAddMenu";

afterEach(cleanup);

function renderMenu(overrides = {}) {
  const props = {
    onCreateInitiative: vi.fn(),
    onCreatePlan: vi.fn(),
    onCreateProject: vi.fn(),
    sidebarButtonBase: "text-gray-500",
    ...overrides,
  };

  render(<SidebarAddMenu {...props} />);
  return props;
}

describe("SidebarAddMenu", () => {
  it("renders a trigger button", () => {
    renderMenu();
    expect(screen.getByLabelText("Add new item")).toBeInTheDocument();
  });

  it("shows 5 menu items when opened", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByLabelText("Add new item"));

    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Initiatives")).toBeInTheDocument();
    expect(screen.getByText("Releases")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(screen.getByText("Scorecard")).toBeInTheDocument();
  });

  it("clicking Project calls onCreateProject", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByLabelText("Add new item"));
    await user.click(screen.getByText("Project"));

    await waitFor(() => expect(props.onCreateProject).toHaveBeenCalled());
  });

  it("clicking Initiatives calls onCreateInitiative", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByLabelText("Add new item"));
    await user.click(screen.getByText("Initiatives"));

    await waitFor(() => expect(props.onCreateInitiative).toHaveBeenCalled());
  });

  it("clicking Releases calls onCreatePlan with releases", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByLabelText("Add new item"));
    await user.click(screen.getByText("Releases"));

    await waitFor(() =>
      expect(props.onCreatePlan).toHaveBeenCalledWith("releases"),
    );
  });

  it("opens a project composer after the menu selection settles", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [createProjectOpen, setCreateProjectOpen] = useState(false);

      return (
        <>
          <SidebarAddMenu
            onCreateInitiative={vi.fn()}
            onCreatePlan={vi.fn()}
            onCreateProject={() => setCreateProjectOpen(true)}
            sidebarButtonBase="text-gray-500"
          />
          {createProjectOpen ? (
            <div data-testid="create-project-dialog">Create Project</div>
          ) : null}
        </>
      );
    }

    render(<Harness />);

    await user.click(screen.getByLabelText("Add new item"));
    await user.click(screen.getByText("Project"));

    expect(await screen.findByTestId("create-project-dialog")).toBeInTheDocument();
  });
});
