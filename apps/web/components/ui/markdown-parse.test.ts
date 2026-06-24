import { describe, it, expect } from "vitest";
import { parseBlocks, stripInline } from "./markdown-parse";

describe("stripInline", () => {
  it("removes bold, code, and italic markers", () => {
    expect(stripInline("**bold** and `code` and *em*")).toBe("bold and code and em");
  });

  it("leaves plain text untouched", () => {
    expect(stripInline("just words, no markers")).toBe("just words, no markers");
  });
});

describe("parseBlocks", () => {
  it("returns no blocks for empty or whitespace input", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("   \n\n  ")).toEqual([]);
  });

  it("parses ## as h2 and deeper headings as h3", () => {
    const blocks = parseBlocks("## Top\n### Sub\n#### Deeper");
    expect(blocks).toEqual([
      { kind: "h2", text: "Top" },
      { kind: "h3", text: "Sub" },
      { kind: "h3", text: "Deeper" },
    ]);
  });

  it("treats a single # as h2 (level <= 2)", () => {
    expect(parseBlocks("# Title")).toEqual([{ kind: "h2", text: "Title" }]);
  });

  it("parses unordered and ordered lists", () => {
    expect(parseBlocks("- a\n- b\n- c")).toEqual([{ kind: "ul", items: ["a", "b", "c"] }]);
    expect(parseBlocks("1. first\n2. second")).toEqual([{ kind: "ol", items: ["first", "second"] }]);
  });

  it("parses a table with header and rows", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
    expect(parseBlocks(md)).toEqual([
      { kind: "table", header: ["A", "B"], rows: [["1", "2"], ["3", "4"]] },
    ]);
  });

  it("parses a fenced code block and keeps its body verbatim", () => {
    const md = "```ts\nconst x = 1;\nconst y = 2;\n```";
    expect(parseBlocks(md)).toEqual([{ kind: "code", lang: "ts", text: "const x = 1;\nconst y = 2;" }]);
  });

  it("joins consecutive lines into one paragraph", () => {
    expect(parseBlocks("line one\nline two")).toEqual([{ kind: "p", text: "line one line two" }]);
  });

  it("separates paragraphs and stops a paragraph at a structural line", () => {
    const blocks = parseBlocks("intro para\n\n## Heading\nafter heading\n- item");
    expect(blocks).toEqual([
      { kind: "p", text: "intro para" },
      { kind: "h2", text: "Heading" },
      { kind: "p", text: "after heading" },
      { kind: "ul", items: ["item"] },
    ]);
  });

  it("normalises CRLF line endings", () => {
    expect(parseBlocks("a\r\nb")).toEqual([{ kind: "p", text: "a b" }]);
  });
});
