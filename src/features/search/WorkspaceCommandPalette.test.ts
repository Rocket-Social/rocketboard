import { describe, expect, it } from "vitest";

/**
 * Tests for the search-first command palette query parsing logic.
 *
 * The component uses two layers of mode detection:
 * - isCommandMode (from raw query): instant visual switch
 * - isCommandModeDeferred (from deferredQuery): gates section filtering and API
 *
 * These tests validate the parsing layer that both depend on.
 */

function parseQueryMode(query: string) {
  const trimmed = query.trimStart();
  const isCommandMode = trimmed.startsWith(">");
  const commandQuery = isCommandMode ? trimmed.slice(1).trim() : "";
  const searchQuery = isCommandMode ? "" : query.trim();
  const normalizedQuery = (
    isCommandMode ? commandQuery : searchQuery
  ).toLowerCase();

  return { isCommandMode, commandQuery, searchQuery, normalizedQuery };
}

describe("query mode parsing", () => {
  it("detects search mode for normal text", () => {
    const result = parseQueryMode("test");
    expect(result.isCommandMode).toBe(false);
    expect(result.searchQuery).toBe("test");
    expect(result.normalizedQuery).toBe("test");
    expect(result.commandQuery).toBe("");
  });

  it("detects command mode when query starts with >", () => {
    const result = parseQueryMode("> create");
    expect(result.isCommandMode).toBe(true);
    expect(result.commandQuery).toBe("create");
    expect(result.searchQuery).toBe("");
    expect(result.normalizedQuery).toBe("create");
  });

  it("handles just > with no command text", () => {
    const result = parseQueryMode(">");
    expect(result.isCommandMode).toBe(true);
    expect(result.commandQuery).toBe("");
    expect(result.normalizedQuery).toBe("");
  });

  it("handles > with leading whitespace", () => {
    const result = parseQueryMode("  > create");
    expect(result.isCommandMode).toBe(true);
    expect(result.commandQuery).toBe("create");
  });

  it("handles > with trailing whitespace in command", () => {
    const result = parseQueryMode(">  create task  ");
    expect(result.isCommandMode).toBe(true);
    expect(result.commandQuery).toBe("create task");
  });

  it("does not detect command mode when > is mid-string", () => {
    const result = parseQueryMode("test > stuff");
    expect(result.isCommandMode).toBe(false);
    expect(result.searchQuery).toBe("test > stuff");
  });

  it("normalizes query to lowercase in search mode", () => {
    const result = parseQueryMode("TEST Query");
    expect(result.normalizedQuery).toBe("test query");
  });

  it("normalizes query to lowercase in command mode", () => {
    const result = parseQueryMode("> CREATE");
    expect(result.normalizedQuery).toBe("create");
  });

  it("returns empty search query in command mode", () => {
    const result = parseQueryMode("> test");
    expect(result.searchQuery).toBe("");
  });

  it("returns empty command query in search mode", () => {
    const result = parseQueryMode("test");
    expect(result.commandQuery).toBe("");
  });

  it("handles empty query", () => {
    const result = parseQueryMode("");
    expect(result.isCommandMode).toBe(false);
    expect(result.searchQuery).toBe("");
    expect(result.normalizedQuery).toBe("");
  });
});

describe("section gating by mode", () => {
  // Simulates the indexedSections logic from the component
  function getSectionIds(
    isCommandMode: boolean,
    normalizedQueryLength: number,
    hasCurrentProject: boolean,
  ) {
    if (isCommandMode) {
      return ["actions"];
    }

    const sections: string[] = [];
    if (normalizedQueryLength >= 2) {
      sections.push("cards", "documents");
    }
    if (hasCurrentProject) {
      sections.push("views");
    }
    sections.push("projects", "workspaces");
    return sections;
  }

  it("shows only actions in command mode", () => {
    expect(getSectionIds(true, 0, true)).toEqual(["actions"]);
    expect(getSectionIds(true, 5, false)).toEqual(["actions"]);
  });

  it("shows current-project boards in project context with no query", () => {
    const ids = getSectionIds(false, 0, true);
    expect(ids).toEqual(["views", "projects", "workspaces"]);
  });

  it("omits current-project boards in workspace-only contexts", () => {
    const ids = getSectionIds(false, 0, false);
    expect(ids).toEqual(["projects", "workspaces"]);
  });

  it("shows search results and navigation in project context with 2+ chars", () => {
    const ids = getSectionIds(false, 2, true);
    expect(ids).toEqual([
      "cards",
      "documents",
      "views",
      "projects",
      "workspaces",
    ]);
  });

  it("does not show search results with 1 char query", () => {
    const ids = getSectionIds(false, 1, false);
    expect(ids).not.toContain("cards");
    expect(ids).not.toContain("documents");
  });
});

describe("display query for empty state messages", () => {
  it("uses search query in search mode", () => {
    const { isCommandMode, commandQuery, searchQuery } = parseQueryMode("test");
    const displayQuery = isCommandMode ? commandQuery : searchQuery;
    expect(displayQuery).toBe("test");
  });

  it("uses command query (stripped) in command mode", () => {
    const { isCommandMode, commandQuery, searchQuery } =
      parseQueryMode("> foo");
    const displayQuery = isCommandMode ? commandQuery : searchQuery;
    expect(displayQuery).toBe("foo");
  });

  it("does not show > prefix in command mode display", () => {
    const { isCommandMode, commandQuery } = parseQueryMode("> test");
    const displayQuery = isCommandMode ? commandQuery : "";
    expect(displayQuery).not.toContain(">");
  });
});

describe("workspace search API gating", () => {
  function shouldEnableSearch(
    isOpen: boolean,
    isCommandMode: boolean,
    searchQueryLength: number,
  ) {
    return isOpen && !isCommandMode && searchQueryLength >= 2;
  }

  it("enables search in search mode with 2+ chars", () => {
    expect(shouldEnableSearch(true, false, 2)).toBe(true);
    expect(shouldEnableSearch(true, false, 5)).toBe(true);
  });

  it("disables search in command mode", () => {
    expect(shouldEnableSearch(true, true, 5)).toBe(false);
  });

  it("disables search with short query", () => {
    expect(shouldEnableSearch(true, false, 0)).toBe(false);
    expect(shouldEnableSearch(true, false, 1)).toBe(false);
  });

  it("disables search when palette is closed", () => {
    expect(shouldEnableSearch(false, false, 5)).toBe(false);
  });
});

describe("header and placeholder by mode", () => {
  function getHeaderText(isCommandMode: boolean) {
    return isCommandMode ? "Workspace Command" : "Workspace Search";
  }

  function getPlaceholder(isCommandMode: boolean) {
    return isCommandMode
      ? "Run a command\u2026"
      : "Search cards, projects, and documents\u2026";
  }

  function getAriaLabel(isCommandMode: boolean) {
    return isCommandMode ? "Commands" : "Search";
  }

  it("shows search header in search mode", () => {
    expect(getHeaderText(false)).toBe("Workspace Search");
    expect(getPlaceholder(false)).toBe(
      "Search cards, projects, and documents\u2026",
    );
    expect(getAriaLabel(false)).toBe("Search");
  });

  it("shows command header in command mode", () => {
    expect(getHeaderText(true)).toBe("Workspace Command");
    expect(getPlaceholder(true)).toBe("Run a command\u2026");
    expect(getAriaLabel(true)).toBe("Commands");
  });
});

describe("command helper visibility", () => {
  function shouldShowCommandHint(
    isCommandMode: boolean,
    normalizedQuery: string,
    commandCount: number,
  ) {
    return !isCommandMode && !normalizedQuery && commandCount > 0;
  }

  it("shows the > helper only when commands exist", () => {
    expect(shouldShowCommandHint(false, "", 3)).toBe(true);
    expect(shouldShowCommandHint(false, "", 0)).toBe(false);
  });

  it("hides the > helper once the user starts typing", () => {
    expect(shouldShowCommandHint(false, "te", 3)).toBe(false);
  });
});

describe("command-mode empty states", () => {
  function getCommandModeEmptyState(
    commandCount: number,
    normalizedQueryLength: number,
  ) {
    if (commandCount === 0) {
      return "No commands available in this context.";
    }

    if (normalizedQueryLength >= 1) {
      return "No commands matched.";
    }

    return null;
  }

  it("shows the no-commands message in workspace-only contexts", () => {
    expect(getCommandModeEmptyState(0, 0)).toBe(
      "No commands available in this context.",
    );
    expect(getCommandModeEmptyState(0, 2)).toBe(
      "No commands available in this context.",
    );
  });

  it("shows the no-match message when commands exist but filtering removes them", () => {
    expect(getCommandModeEmptyState(3, 2)).toBe("No commands matched.");
  });
});
