/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div>Root child</div>,
}));

import { RootLayout } from "./RootLayout";

describe("RootLayout", () => {
  it("renders the outlet without the removed full-screen loading card", () => {
    render(<RootLayout />);

    expect(screen.getByText("Root child")).toBeInTheDocument();
    expect(screen.queryByText("Opening Rocketboard")).not.toBeInTheDocument();
  });
});
