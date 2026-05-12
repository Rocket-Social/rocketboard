/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { WikiPageContextMenu } from "./WikiPageContextMenu";

const defaultProps = {
  isOpen: true,
  isPinned: false,
  onClose: vi.fn(),
  onCopyLink: vi.fn(),
  onCreateSubPage: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  position: { x: 100, y: 100 },
};

describe("WikiPageContextMenu", () => {
  it("renders all menu items when open", () => {
    render(<WikiPageContextMenu {...defaultProps} />);

    expect(screen.getByText("Add sub-page")).toBeDefined();
    expect(screen.getByText("Pin to sidebar")).toBeDefined();
    expect(screen.getByText("Copy link")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <WikiPageContextMenu {...defaultProps} isOpen={false} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("calls onCreateSubPage and onClose when 'Add sub-page' clicked", () => {
    const onCreateSubPage = vi.fn();
    const onClose = vi.fn();
    render(
      <WikiPageContextMenu
        {...defaultProps}
        onClose={onClose}
        onCreateSubPage={onCreateSubPage}
      />,
    );

    fireEvent.click(screen.getByText("Add sub-page"));
    expect(onCreateSubPage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onTogglePin and onClose when pin clicked", () => {
    const onTogglePin = vi.fn();
    const onClose = vi.fn();
    render(
      <WikiPageContextMenu
        {...defaultProps}
        onClose={onClose}
        onTogglePin={onTogglePin}
      />,
    );

    fireEvent.click(screen.getByText("Pin to sidebar"));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows 'Unpin' when isPinned is true", () => {
    render(<WikiPageContextMenu {...defaultProps} isPinned={true} />);

    expect(screen.getByText("Unpin")).toBeDefined();
    expect(screen.queryByText("Pin to sidebar")).toBeNull();
  });

  it("shows 'Pin to sidebar' when isPinned is false", () => {
    render(<WikiPageContextMenu {...defaultProps} isPinned={false} />);

    expect(screen.getByText("Pin to sidebar")).toBeDefined();
    expect(screen.queryByText("Unpin")).toBeNull();
  });

  it("calls onDelete and onClose when Delete clicked", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <WikiPageContextMenu
        {...defaultProps}
        onClose={onClose}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onCopyLink and onClose when Copy link clicked", () => {
    const onCopyLink = vi.fn();
    const onClose = vi.fn();
    render(
      <WikiPageContextMenu
        {...defaultProps}
        onClose={onClose}
        onCopyLink={onCopyLink}
      />,
    );

    fireEvent.click(screen.getByText("Copy link"));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key", async () => {
    const onClose = vi.fn();
    render(<WikiPageContextMenu {...defaultProps} onClose={onClose} />);

    // The escape handler is added with a setTimeout(0), so we need to flush
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
