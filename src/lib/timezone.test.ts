import { describe, expect, it } from "vitest";

import {
  getSupportedTimezones,
  normalizeTimezone,
  searchTimezoneOptions,
} from "./timezone";

describe("timezone helpers", () => {
  it("normalizes legacy aliases to preferred timezone ids", () => {
    expect(normalizeTimezone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(normalizeTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(normalizeTimezone("US/Pacific")).toBe("America/Los_Angeles");
  });

  it("includes preferred canonical zones in the supported timezone list", () => {
    expect(getSupportedTimezones()).toContain("Asia/Kolkata");
    expect(getSupportedTimezones()).not.toContain("Asia/Calcutta");
  });

  it("ranks India matches ahead of Indiana substring matches", () => {
    const [firstResult] = searchTimezoneOptions("india").options;
    expect(firstResult?.value).toBe("Asia/Kolkata");
  });

  it("supports direct abbreviation searches", () => {
    expect(searchTimezoneOptions("pst").options[0]?.value).toBe(
      "America/Los_Angeles",
    );
    expect(searchTimezoneOptions("cest").options[0]?.value).toBe(
      "Europe/Berlin",
    );
  });

  it("surfaces ambiguity hints for ambiguous abbreviations", () => {
    const result = searchTimezoneOptions("ist");

    expect(result.ambiguityHint).toContain("India");
    expect(result.options.map((option) => option.value)).toContain(
      "Asia/Kolkata",
    );
    expect(result.options.map((option) => option.value)).toContain(
      "Europe/Dublin",
    );
    expect(result.options.map((option) => option.value)).toContain(
      "Asia/Jerusalem",
    );
  });
});
