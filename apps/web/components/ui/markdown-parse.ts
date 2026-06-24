/**
 * Pure markdown parsing for the shared renderer. No React, no DOM: turns a source
 * string into a flat list of typed blocks and strips inline markers. Split out of
 * markdown.tsx so the parser (used by Close, Knowledge, and Voice Dojo) is unit-
 * tested independently of rendering.
 */

/** Strip inline markdown markers from a single line of text. */
export function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+?)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

export type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "p"; text: string };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+/;
const UL_RE = /^\s*[-*+]\s+/;

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
const splitRow = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Parse markdown into a flat list of blocks. Handles the shapes our prompts emit. */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  // Indexing under noUncheckedIndexedAccess: always read through this helper so the
  // result is a guaranteed string (empty string for out-of-range), never undefined.
  const at = (idx: number): string => lines[idx] ?? "";

  while (i < lines.length) {
    const line = at(i);
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !at(i).trim().startsWith("```")) {
        buf.push(at(i));
        i += 1;
      }
      i += 1; // consume closing fence
      blocks.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Headings (#### and deeper fold into h3)
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const text = (headingMatch[2] ?? "").replace(/\s*#+\s*$/, "");
      const level = (headingMatch[1] ?? "").length;
      blocks.push({ kind: level <= 2 ? "h2" : "h3", text });
      i += 1;
      continue;
    }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && isDivider(at(i + 1))) {
      const header = splitRow(line);
      i += 2; // header + divider
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(at(i))) {
        rows.push(splitRow(at(i)));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Ordered list
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(at(i))) {
        items.push(at(i).replace(OL_RE, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Unordered list
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(at(i))) {
        items.push(at(i).replace(UL_RE, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-structural lines
    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = at(i);
      const nextTrim = next.trim();
      if (
        nextTrim === "" ||
        HEADING_RE.test(nextTrim) ||
        nextTrim.startsWith("```") ||
        OL_RE.test(next) ||
        UL_RE.test(next) ||
        isTableRow(next)
      ) {
        break;
      }
      para.push(nextTrim);
      i += 1;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }

  return blocks;
}
