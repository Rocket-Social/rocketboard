import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

// Fitness tests for the shell architecture. These are load-bearing
// invariants that the slot-publisher sidebar pattern relies on. If any
// of these start failing, the sidebar is drifting - any future PR could
// remount the shell scaffold from a feature file, sneak a new sidebar
// section into a route, or reintroduce a parallel context for shell
// state. Add new invariants here as the pattern evolves; don't loosen
// existing ones without a design decision.
//
// Scope: production .ts/.tsx files under src/. Test files are excluded
// because they routinely mention symbol names in describe/it strings
// and comments - the rules are about production code architecture, not
// how tests describe it.

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SRC_ROOT = join(REPO_ROOT, "src");

type SourceFile = {
  contents: string;
  relativePath: string;
};

function listProductionSourceFiles(
  dir: string,
  acc: SourceFile[] = [],
): SourceFile[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const name = entry.name;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      listProductionSourceFiles(full, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(name)) continue;
    if (name.endsWith(".d.ts")) continue;
    try {
      acc.push({
        contents: readFileSync(full, "utf8"),
        relativePath: relative(REPO_ROOT, full),
      });
    } catch {
      // Unreadable file - skip rather than crash the whole test worker.
    }
  }
  return acc;
}

// Value-import match: `import { X }` or `import { X as Y }`, excluding both
// outer type-only imports (`import type { X }`) AND inline type specifiers
// (`import { type X }`, `import { Other, type X }`). Downstream helpers can
// still Pick<ComponentProps<typeof X>> via type imports without tripping
// the invariant.
//
// Structure:
//   `\bimport`             - the import keyword
//   `(?!\s+type\b)`        - reject outer type-only imports
//   `[^'"]*?`              - skip default import, `as`, braces up to the target
//   `\{\s*`                - the named-import brace
//   `(?:[^}]*,\s*)?`       - optional "skip prior specifiers" up to a comma
//   `${name}\b`            - the name we're hunting for
//
// The comma-terminated skip is what excludes `{ type X }`: if `X` is
// preceded by `type ` with no comma in between, the skip group refuses to
// cross the gap and the match fails. `{ Other, X }` and `{ X, Other }`
// both match cleanly.
function valueImportPattern(name: string): RegExp {
  return new RegExp(
    String.raw`\bimport(?!\s+type\b)[^'"]*?\{\s*(?:[^}]*,\s*)?${name}\b`,
  );
}

// Path-segment match: `from '.../X'` where X is the final path segment.
// The mandatory / before the name prevents false positives on helper
// files whose names contain the banned word as a substring (e.g.
// AppShellContextAdapter).
function importFromFilePattern(name: string): RegExp {
  return new RegExp(String.raw`from\s+['"][^'"]*\/${name}['"]`);
}

let productionFiles: SourceFile[] = [];

describe("shell architecture fitness", () => {
  beforeAll(() => {
    productionFiles = listProductionSourceFiles(SRC_ROOT);
    // Sanity: if the walker produces zero files something is very wrong
    // with the environment, fail loudly instead of silently passing.
    if (productionFiles.length === 0) {
      throw new Error(
        `shell-architecture.test.ts could not enumerate any .ts/.tsx files under ${SRC_ROOT}`,
      );
    }
  });

  describe("invariants", () => {
    it("CanonicalSidebar may only be imported by SignedInShellLayout", () => {
      const ALLOWED = new Set<string>([
        "src/features/shell/SignedInShellLayout.tsx",
        "src/features/shell/CanonicalSidebar.tsx",
      ]);
      const pattern = valueImportPattern("CanonicalSidebar");

      const violations: string[] = [];
      for (const file of productionFiles) {
        if (ALLOWED.has(file.relativePath)) continue;
        if (pattern.test(file.contents)) {
          violations.push(file.relativePath);
        }
      }

      expect(
        violations,
        `CanonicalSidebar must only be imported by SignedInShellLayout. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });

    it("CreateDialogsHost may only be imported by SignedInShellLayout", () => {
      const ALLOWED = new Set<string>([
        "src/features/shell/SignedInShellLayout.tsx",
        "src/features/shell/CreateDialogsHost.tsx",
      ]);
      const pattern = valueImportPattern("CreateDialogsHost");

      const violations: string[] = [];
      for (const file of productionFiles) {
        if (ALLOWED.has(file.relativePath)) continue;
        if (pattern.test(file.contents)) {
          violations.push(file.relativePath);
        }
      }

      expect(
        violations,
        `CreateDialogsHost must only be imported by SignedInShellLayout. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });

    it("ShellSlotsContext is not reintroduced", () => {
      const bannedPatterns = [
        { label: "import from ShellSlotsContext", pattern: importFromFilePattern("ShellSlotsContext") },
        { label: "usePublishShellSlots() call", pattern: /\busePublishShellSlots\s*\(/ },
        { label: "useShellSlots() call", pattern: /\buseShellSlots\s*\(/ },
      ];

      const violations: string[] = [];
      for (const file of productionFiles) {
        for (const { label, pattern } of bannedPatterns) {
          if (pattern.test(file.contents)) {
            violations.push(`${file.relativePath} (${label})`);
          }
        }
      }

      expect(
        violations,
        `ShellSlotsContext was deleted. The slot-publisher pattern is replaced by CanonicalSidebar. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });

    it("AppShellScaffold is not reintroduced", () => {
      const pattern = importFromFilePattern("AppShellScaffold");

      const violations: string[] = [];
      for (const file of productionFiles) {
        if (pattern.test(file.contents)) {
          violations.push(file.relativePath);
        }
      }

      expect(
        violations,
        `AppShellScaffold was deleted. Conditional section rendering was the flash source. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });

    it("only the canonical SidebarShellStateContext exposes shell state", () => {
      // AppShellContext (which was a separate, narrow context exposing
      // { isDesktop }) was deleted. Shell state now lives in
      // SidebarShellStateContext, and consumers that only need the
      // breakpoint use the context-free useIsDesktop hook. This test
      // prevents anyone from reintroducing AppShellContext under a
      // similar name or re-creating the parallel hooks.
      //
      // Each pattern is constrained to a real usage form (call, JSX tag,
      // or filename-segment import) so it doesn't match mentions in
      // comments or string literals.
      const bannedPatterns = [
        { label: "useAppShell() call", pattern: /\buseAppShell\s*\(/ },
        {
          label: "useAppShellOptional() call",
          pattern: /\buseAppShellOptional\s*\(/,
        },
        { label: "AppShellProvider JSX tag", pattern: /<AppShellProvider\b/ },
        {
          label: "import from AppShellContext",
          pattern: importFromFilePattern("AppShellContext"),
        },
      ];

      const violations: string[] = [];
      for (const file of productionFiles) {
        for (const { label, pattern } of bannedPatterns) {
          if (pattern.test(file.contents)) {
            violations.push(`${file.relativePath} (${label})`);
          }
        }
      }

      expect(
        violations,
        `AppShellContext was deleted in favor of SidebarShellStateContext + useIsDesktop. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });

    it("ProjectShellLayout has no local useState (state lives in extracted hooks)", () => {
      // Phase C extracted all project shell state into useProjectController,
      // useProjectCardSheet, useProjectDialogState, useProjectViewActions,
      // useProjectSprintHandlers. The layout itself is a thin composer that
      // wires hooks into the three focused contexts - it must not regrow
      // local state or we're back to the omnibus context problem.
      const TARGET = "src/features/shell/ProjectShellLayout.tsx";
      const target = productionFiles.find((f) => f.relativePath === TARGET);
      if (!target) {
        throw new Error(`Expected to find ${TARGET} in production sources`);
      }

      // Strip // line comments and /* block */ comments so the pattern
      // doesn't trip on commentary that happens to mention useState.
      const stripped = target.contents
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      const pattern = /\buseState\s*[(<]/;
      expect(
        pattern.test(stripped),
        `${TARGET} must not call useState directly. Move new state into one of the project/* hooks.`,
      ).toBe(false);
    });

    it("ProjectLayoutContext is not reintroduced", () => {
      const bannedPatterns = [
        {
          label: "import from ProjectLayoutContext",
          pattern: importFromFilePattern("ProjectLayoutContext"),
        },
        { label: "useProjectLayout() call", pattern: /\buseProjectLayout\s*\(/ },
        {
          label: "ProjectLayoutProvider JSX tag",
          pattern: /<ProjectLayoutProvider\b/,
        },
      ];

      const violations: string[] = [];
      for (const file of productionFiles) {
        for (const { label, pattern } of bannedPatterns) {
          if (pattern.test(file.contents)) {
            violations.push(`${file.relativePath} (${label})`);
          }
        }
      }

      expect(
        violations,
        `ProjectLayoutContext was split into ProjectChromeContext, ProjectDataContext, and ProjectDialogContext. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });
  });

  // Self-tests that verify the regex helpers actually fire on the
  // patterns they claim to catch. Without these, a typo in a regex
  // (escaped backslash, missing word-boundary) could silently disable
  // the invariant and leave the tree green.
  describe("regex self-tests", () => {
    it("valueImportPattern matches named imports but not type imports", () => {
      const pattern = valueImportPattern("AppShellScaffold");

      // Value imports the fitness test should catch:
      expect(
        pattern.test(`import { AppShellScaffold } from "./AppShellScaffold"`),
      ).toBe(true);
      expect(
        pattern.test(
          `import { AppShellScaffold as Scaffold } from "./AppShellScaffold"`,
        ),
      ).toBe(true);
      expect(
        pattern.test(
          `import {\n  AppShellScaffold,\n} from "./AppShellScaffold"`,
        ),
      ).toBe(true);
      expect(
        pattern.test(
          `import { Other, AppShellScaffold } from "./AppShellScaffold"`,
        ),
      ).toBe(true);
      expect(
        pattern.test(
          `import { AppShellScaffold, Other } from "./AppShellScaffold"`,
        ),
      ).toBe(true);
      expect(
        pattern.test(
          `import Default, { AppShellScaffold } from "./AppShellScaffold"`,
        ),
      ).toBe(true);

      // Type-only imports the fitness test must NOT catch:
      expect(
        pattern.test(
          `import type { AppShellScaffold } from "./AppShellScaffold"`,
        ),
      ).toBe(false);
      expect(
        pattern.test(
          `import { type AppShellScaffold } from "./AppShellScaffold"`,
        ),
      ).toBe(false);
      expect(
        pattern.test(
          `import { Other, type AppShellScaffold } from "./AppShellScaffold"`,
        ),
      ).toBe(false);
      expect(
        pattern.test(
          `import { type AppShellScaffold, type Other } from "./AppShellScaffold"`,
        ),
      ).toBe(false);

      // Plain mentions in comments or strings must not trip the pattern:
      expect(
        pattern.test(`// historical reference to AppShellScaffold in a comment`),
      ).toBe(false);
    });

    it("importFromFilePattern matches full path segments, not substrings", () => {
      const pattern = importFromFilePattern("AppShellContext");
      expect(
        pattern.test(`import { foo } from "./AppShellContext"`),
      ).toBe(true);
      expect(
        pattern.test(`import { foo } from "../../shell/AppShellContext"`),
      ).toBe(true);
      expect(
        pattern.test(`import { foo } from "./AppShellContextAdapter"`),
      ).toBe(false);
      expect(
        pattern.test(`import { foo } from "./helpers/AppShellContextBridge"`),
      ).toBe(false);
      expect(pattern.test(`// mentions AppShellContext in a comment`)).toBe(
        false,
      );
    });

    it("usePublishShellSlots call pattern requires an open paren", () => {
      const pattern = /\busePublishShellSlots\s*\(/;
      expect(pattern.test(`usePublishShellSlots(slots);`)).toBe(true);
      expect(pattern.test(`usePublishShellSlots (slots);`)).toBe(true);
      expect(
        pattern.test(`// usePublishShellSlots is the publish channel`),
      ).toBe(false);
      expect(pattern.test(`const name = "usePublishShellSlots";`)).toBe(false);
    });

    it("AppShellProvider JSX tag pattern matches tags, not mentions", () => {
      const pattern = /<AppShellProvider\b/;
      expect(pattern.test(`<AppShellProvider isDesktop={true}>`)).toBe(true);
      expect(pattern.test(`<AppShellProvider />`)).toBe(true);
      expect(pattern.test(`// formerly used AppShellProvider for isDesktop`)).toBe(
        false,
      );
      expect(pattern.test(`"AppShellProvider"`)).toBe(false);
    });
  });

  // New dialogs must use the Radix-backed `<Dialog>` primitive instead of
  // rolling their own `fixed inset-0` backdrop. A hand-rolled overlay
  // ships without a proper focus trap, Escape-to-close, or ARIA dialog
  // semantics - three a11y bugs in one copy-paste. The allowlist below
  // names the handful of non-dialog overlays that legitimately span the
  // viewport (mobile nav backdrops, click-outside dismissers on dropdowns
  // and context menus, the command palette spotlight). Any other
  // `fixed inset-0` match is a regression.
  describe("dialog primitive", () => {
    it("features only use `fixed inset-0` overlays in allowlisted non-dialog surfaces", () => {
      const ALLOWED = new Set<string>([
        // Mobile navigation backdrop under the main sidebar.
        "src/features/shell/WorkspaceSidebarChrome.tsx",
        // Loading fallback rendered INSIDE a Radix <Dialog> portal, so
        // its backdrop is the shell for lazy-loaded dialog content.
        "src/features/shell/LazySurfaceBoundary.tsx",
        // Click-outside dismissers on the table group context menu.
        "src/features/shell/views/TableView.tsx",
        // Sprint picker nudge arrow/toast overlay; pointer-events disabled and not modal.
        "src/features/shell/routes/TableViewRoute.tsx",
        // Click-outside dismisser on the roadmap settings dropdown.
        "src/features/plans/components/RoadmapToolbar.tsx",
        // Spotlight command palette - its own well-tested overlay pattern.
        "src/features/search/WorkspaceCommandPalette.tsx",
      ]);
      const pattern = /fixed\s+inset-0/;

      const violations: string[] = [];
      for (const file of productionFiles) {
        if (!file.relativePath.startsWith("src/features/")) continue;
        if (ALLOWED.has(file.relativePath)) continue;
        if (pattern.test(file.contents)) {
          violations.push(file.relativePath);
        }
      }

      expect(
        violations,
        `Use the <Dialog> primitive from src/components/ui/dialog.tsx instead of a hand-rolled \`fixed inset-0\` overlay. If this genuinely is not a dialog, add the file to the allowlist in this test. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });
  });

  // Edge functions are called through `callEdgeFunction` /
  // `streamEdgeFunction` from `src/platform/edge/edge-client.ts`. The
  // client handles auth token refresh, 401 retry, error-message
  // extraction, and optional Zod response validation in one place. Manual
  // `fetch(...functions/v1/...)` calls bypass all of that and historically
  // shipped with subtly different auth + error behaviors.
  describe("edge function client", () => {
    it("features must not hit Supabase edge functions through raw fetch", () => {
      const ALLOWED = new Set<string>([
        // The single implementation of the pattern.
        "src/platform/edge/edge-client.ts",
      ]);
      const pattern = /\/functions\/v1\//;

      const violations: string[] = [];
      for (const file of productionFiles) {
        if (ALLOWED.has(file.relativePath)) continue;
        if (pattern.test(file.contents)) {
          violations.push(file.relativePath);
        }
      }

      expect(
        violations,
        `Edge functions must be called through callEdgeFunction/streamEdgeFunction from src/platform/edge/edge-client.ts. Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });

    it("features must not call supabase.functions.invoke() directly", () => {
      const ALLOWED = new Set<string>([
        "src/platform/edge/edge-client.ts",
      ]);
      const pattern = /\.functions\.invoke\s*\(/;

      const violations: string[] = [];
      for (const file of productionFiles) {
        if (ALLOWED.has(file.relativePath)) continue;
        if (pattern.test(file.contents)) {
          violations.push(file.relativePath);
        }
      }

      expect(
        violations,
        `Use callEdgeFunction from src/platform/edge/edge-client.ts instead of supabase.functions.invoke(). Violations:\n${violations.join("\n")}`,
      ).toEqual([]);
    });
  });
});
