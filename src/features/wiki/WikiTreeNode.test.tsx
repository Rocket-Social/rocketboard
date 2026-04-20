/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { WikiTreeNode } from "./WikiTreeNode";
import type { WikiPageTreeNode } from "./wiki.types";

const makeNode = (
  overrides: Partial<WikiPageTreeNode> = {},
): WikiPageTreeNode => ({
  children: [],
  createdAt: "2026-04-08T00:00:00Z",
  createdByUserId: "user-1",
  deletedAt: null,
  icon: null,
  id: overrides.id ?? "page-1",
  organizationId: "org-1",
  ownerUserId: "user-1",
  parentPageId: overrides.parentPageId ?? null,
  position: overrides.position ?? 0,
  projectId: null,
  slug: overrides.slug ?? "test-page",
  status: "draft",
  title: overrides.title ?? "Test Page",
  updatedAt: "2026-04-08T00:00:00Z",
  updatedByUserId: "user-1",
  verifiedAt: null,
  verifiedByUserId: null,
  version: 1,
  ...overrides,
});

const defaultProps = {
  activePageId: null,
  darkSidebar: false,
  depth: 0,
  expandedFolders: new Set<string>(),
  maxDepth: 6,
  onSelect: vi.fn(),
  onToggle: vi.fn(),
  sidebarButtonBase: "text-text-muted",
};

describe("WikiTreeNode", () => {
  describe("create sub-page button", () => {
    it("renders + button when onCreateSubPage is provided", () => {
      const onCreateSubPage = vi.fn();
      render(
        <WikiTreeNode
          {...defaultProps}
          node={makeNode({ title: "Engineering" })}
          onCreateSubPage={onCreateSubPage}
        />,
      );

      const addButton = screen.getByLabelText(
        "Create sub-page under Engineering",
      );
      expect(addButton).toBeDefined();
    });

    it("does NOT render + button when onCreateSubPage is omitted", () => {
      render(
        <WikiTreeNode
          {...defaultProps}
          node={makeNode({ title: "Engineering" })}
        />,
      );

      const addButton = screen.queryByLabelText(
        "Create sub-page under Engineering",
      );
      expect(addButton).toBeNull();
    });

    it("calls onCreateSubPage with node id when clicked", () => {
      const onCreateSubPage = vi.fn();
      render(
        <WikiTreeNode
          {...defaultProps}
          node={makeNode({ id: "eng-1", title: "Engineering" })}
          onCreateSubPage={onCreateSubPage}
        />,
      );

      fireEvent.click(
        screen.getByLabelText("Create sub-page under Engineering"),
      );
      expect(onCreateSubPage).toHaveBeenCalledWith("eng-1");
    });

    it("triggers on Enter key", () => {
      const onCreateSubPage = vi.fn();
      render(
        <WikiTreeNode
          {...defaultProps}
          node={makeNode({ id: "eng-1", title: "Engineering" })}
          onCreateSubPage={onCreateSubPage}
        />,
      );

      fireEvent.keyDown(
        screen.getByLabelText("Create sub-page under Engineering"),
        { key: "Enter" },
      );
      expect(onCreateSubPage).toHaveBeenCalledWith("eng-1");
    });

    it("triggers on Space key", () => {
      const onCreateSubPage = vi.fn();
      render(
        <WikiTreeNode
          {...defaultProps}
          node={makeNode({ id: "eng-1", title: "Engineering" })}
          onCreateSubPage={onCreateSubPage}
        />,
      );

      fireEvent.keyDown(
        screen.getByLabelText("Create sub-page under Engineering"),
        { key: " " },
      );
      expect(onCreateSubPage).toHaveBeenCalledWith("eng-1");
    });
  });

  describe("icons", () => {
    it("renders folder icon for nodes with children", () => {
      const parentNode = makeNode({
        title: "Parent",
        children: [makeNode({ id: "child", title: "Child" })],
      });

      const { container } = render(
        <WikiTreeNode {...defaultProps} node={parentNode} />,
      );

      // FolderClosed icon is rendered (lucide renders as svg)
      const svgs = container.querySelectorAll("svg");
      // Should have: chevron + folder icon (+ possibly the + button)
      expect(svgs.length).toBeGreaterThanOrEqual(2);
    });

    it("renders file icon for leaf nodes", () => {
      const leafNode = makeNode({ title: "Leaf", children: [] });

      const { container } = render(
        <WikiTreeNode {...defaultProps} node={leafNode} />,
      );

      // FileText icon is rendered, no chevron
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(1);
    });

    it("aligns folders and pages with the same left offset at the same depth", () => {
      const folderNode = makeNode({
        title: "Child Folder",
        children: [makeNode({ id: "child-1", title: "Nested" })],
      });
      const leafNode = makeNode({ id: "leaf-1", title: "Child Page" });

      const { rerender } = render(
        <WikiTreeNode {...defaultProps} depth={1} node={folderNode} />,
      );

      const folderButton = screen.getByRole("button", { name: "Child Folder" });
      const folderRow = screen.getByText("Child Folder").closest(".group");
      expect(folderButton.className).toContain(
        "grid-cols-[1rem,minmax(0,1fr)]",
      );
      expect((folderRow as HTMLElement).style.paddingLeft).toBe("16px");

      rerender(<WikiTreeNode {...defaultProps} depth={1} node={leafNode} />);

      const leafButton = screen.getByRole("button", { name: "Child Page" });
      const leafRow = screen.getByText("Child Page").closest(".group");
      expect(leafButton.className).toContain("grid-cols-[1rem,minmax(0,1fr)]");
      expect((leafRow as HTMLElement).style.paddingLeft).toBe("16px");
    });
  });

  describe("context menu", () => {
    it("calls onContextMenu with event and node on right-click", () => {
      const onContextMenu = vi.fn();
      render(
        <WikiTreeNode
          {...defaultProps}
          node={makeNode({ title: "Engineering" })}
          onContextMenu={onContextMenu}
        />,
      );

      const pageButton = screen.getByText("Engineering");
      fireEvent.contextMenu(pageButton.closest(".group")!);
      expect(onContextMenu).toHaveBeenCalledTimes(1);
      expect(onContextMenu.mock.calls[0][1].title).toBe("Engineering");
    });
  });

  describe("max depth", () => {
    it("renders 'View nested pages...' at max depth", () => {
      render(
        <WikiTreeNode
          {...defaultProps}
          depth={6}
          maxDepth={6}
          node={makeNode({ title: "Deep Page" })}
        />,
      );

      expect(screen.getByText("View nested pages...")).toBeDefined();
    });
  });
});
