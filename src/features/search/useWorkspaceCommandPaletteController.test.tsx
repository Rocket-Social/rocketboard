/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceSearchTrigger } from "../shell/WorkspaceSearchTrigger";
import { useWorkspaceCommandPaletteController } from "./useWorkspaceCommandPaletteController";

function ControllerHarness({ disabled = false }: { disabled?: boolean }) {
  const { isOpen, openPalette } = useWorkspaceCommandPaletteController({
    disabled,
  });

  return (
    <div>
      <WorkspaceSearchTrigger
        collapsed={false}
        darkSidebar
        disabled={disabled}
        onOpen={openPalette}
        sidebarButtonBase=""
      />
      {isOpen ? <div>Palette open</div> : null}
    </div>
  );
}

describe("useWorkspaceCommandPaletteController", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the palette from the shared search trigger", async () => {
    const user = userEvent.setup();

    render(<ControllerHarness />);

    await user.click(screen.getByRole("button", { name: /Search/ }));

    expect(screen.getByText("Palette open")).toBeInTheDocument();
  });

  it("opens the palette from Cmd/Ctrl+K", () => {
    render(<ControllerHarness />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByText("Palette open")).toBeInTheDocument();
  });

  it("closes the palette when the controller becomes disabled", async () => {
    const user = userEvent.setup();
    const view = render(<ControllerHarness />);

    await user.click(screen.getByRole("button", { name: /Search/ }));
    expect(screen.getByText("Palette open")).toBeInTheDocument();

    view.rerender(<ControllerHarness disabled />);

    expect(screen.queryByText("Palette open")).not.toBeInTheDocument();
  });
});
