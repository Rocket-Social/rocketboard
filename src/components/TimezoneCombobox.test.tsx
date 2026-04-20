/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TimezoneCombobox } from "./TimezoneCombobox";

function TestTimezoneCombobox() {
  const [value, setValue] = useState("America/Los_Angeles");

  return (
    <div>
      <label htmlFor="timezone">Timezone</label>
      <TimezoneCombobox inputId="timezone" onChange={setValue} value={value} />
      <button type="button">Elsewhere</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe("TimezoneCombobox", () => {
  it("reverts a typed query on blur without changing the committed timezone", async () => {
    const user = userEvent.setup();

    render(<TestTimezoneCombobox />);

    const input = screen.getByRole("combobox", { name: /Timezone/ });

    await user.click(input);
    await user.type(input, "india");
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toContain("Los Angeles");
    });
  });

  it("commits the highlighted result when Enter is pressed", async () => {
    const user = userEvent.setup();

    render(<TestTimezoneCombobox />);

    const input = screen.getByRole("combobox", { name: /Timezone/ });

    await user.click(input);
    await user.type(input, "ist");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toContain("Kolkata");
    });
  });
});
