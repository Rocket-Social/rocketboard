/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HeaderSearchIconButton } from "./HeaderSearchIconButton";

describe("HeaderSearchIconButton", () => {
  it("renders with the canonical Search aria-label and title", () => {
    render(<HeaderSearchIconButton onOpen={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Search");
  });

  it("invokes onOpen when clicked", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();

    render(<HeaderSearchIconButton onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-reachable via Tab and activates with Enter", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Before</button>
        <HeaderSearchIconButton onOpen={onOpen} />
        <button type="button">After</button>
      </div>,
    );

    screen.getByRole("button", { name: "Before" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onOpen when disabled", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();

    render(<HeaderSearchIconButton disabled onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders the quiet variant with smaller icon and no border", () => {
    render(<HeaderSearchIconButton onOpen={vi.fn()} variant="quiet" />);

    const button = screen.getByRole("button", { name: "Search" });
    expect(button.className).toContain("h-7");
    expect(button.className).toContain("w-7");
    expect(button.className).not.toContain("border");
  });

  it("renders the default variant at icon-button size", () => {
    render(<HeaderSearchIconButton onOpen={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Search" });
    expect(button.className).toContain("h-9");
    expect(button.className).toContain("w-9");
  });
});
