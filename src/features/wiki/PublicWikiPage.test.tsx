/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import type { RichTextDocument } from "../rich-text/rich-text";
import { stripInternalLinks } from "./PublicWikiPage";

function makeDoc(content: unknown[]): RichTextDocument {
  return { type: "doc", content } as RichTextDocument;
}

describe("stripInternalLinks", () => {
  it("removes link marks pointing to internal wiki URLs", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "See the guide",
            marks: [{ type: "link", attrs: { href: "/org/abc/wiki/guide" } }],
          },
        ],
      },
    ]);

    const result = stripInternalLinks(doc);
    const textNode = (result.content as any[])[0].content[0];
    expect(textNode.marks).toBeUndefined();
    expect(textNode.text).toBe("See the guide");
  });

  it("removes link marks pointing to legacy wiki URLs", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Old link",
            marks: [{ type: "link", attrs: { href: "/wiki/old-page" } }],
          },
        ],
      },
    ]);

    const result = stripInternalLinks(doc);
    const textNode = (result.content as any[])[0].content[0];
    expect(textNode.marks).toBeUndefined();
  });

  it("preserves external links", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Google",
            marks: [
              { type: "link", attrs: { href: "https://google.com" } },
            ],
          },
        ],
      },
    ]);

    const result = stripInternalLinks(doc);
    const textNode = (result.content as any[])[0].content[0];
    expect(textNode.marks).toHaveLength(1);
    expect(textNode.marks[0].attrs.href).toBe("https://google.com");
  });

  it("preserves non-link marks (bold, italic)", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Bold wiki link",
            marks: [
              { type: "bold" },
              { type: "link", attrs: { href: "/org/x/wiki/page" } },
            ],
          },
        ],
      },
    ]);

    const result = stripInternalLinks(doc);
    const textNode = (result.content as any[])[0].content[0];
    expect(textNode.marks).toHaveLength(1);
    expect(textNode.marks[0].type).toBe("bold");
  });

  it("handles empty document", () => {
    const doc = makeDoc([]);
    const result = stripInternalLinks(doc);
    expect(result.content).toEqual([]);
  });

  it("handles null/undefined gracefully", () => {
    expect(stripInternalLinks(null as any)).toBeNull();
    expect(stripInternalLinks(undefined as any)).toBeUndefined();
  });

  it("processes nested content recursively", () => {
    const doc = makeDoc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Nested link",
                    marks: [
                      { type: "link", attrs: { href: "/org/a/wiki/nested" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const result = stripInternalLinks(doc);
    const textNode = (result.content as any[])[0].content[0].content[0]
      .content[0];
    expect(textNode.marks).toBeUndefined();
    expect(textNode.text).toBe("Nested link");
  });
});
