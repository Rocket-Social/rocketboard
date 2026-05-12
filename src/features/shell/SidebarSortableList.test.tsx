/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarSortableList } from "./SidebarSortableList";

describe("SidebarSortableList", () => {
  it("keeps each sortable wrapper stretched to the full list width", () => {
    render(
      <div style={{ width: "320px" }}>
        <SidebarSortableList
          getId={(item) => item}
          items={["first", "second"]}
          renderItem={(item) => <div data-testid={`row-${item}`}>{item}</div>}
        />
      </div>,
    );

    const firstRow = screen.getByTestId("row-first");
    expect(firstRow.parentElement).toHaveClass("w-full");
    expect(firstRow.parentElement?.parentElement).toHaveClass("w-full");
  });
});
