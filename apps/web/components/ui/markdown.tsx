"use client";

import { Fragment, useMemo, type ReactNode } from "react";

/**
 * Minimal, dependency-free markdown renderer (dark theme, gold ## headers).
 * Handles the block shapes our LLM prompts emit: headings, fenced code, ordered
 * and unordered lists, tables, and paragraphs, with inline bold / code / italic.
 * Shared by the Close Room and the Knowledge Q&A so both render identically and
 * we carry no markdown dependency.
 */

/** Strip inline markdown markers from a single line of text. */
export function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+?)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

/** Render inline bold / code / italic into React nodes. Order matters. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenise on **bold**, `code`, and *italic* in a single pass.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${i}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
      i += 1;
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-ink-50">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[12px] text-teal-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}-i-${i}`} className="italic text-ink-100">
          {token.slice(1, -1)}
        </em>,
      );
    }
    i += 1;
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

type Block =
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
function parseBlocks(source: string): Block[] {
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

export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);

  if (blocks.length === 0) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-200">{source}</p>;
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-200">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "h2":
            return (
              <h3
                key={idx}
                className="mt-6 font-display text-lg font-bold text-gold-300 first:mt-0"
              >
                {renderInline(block.text, `h2-${idx}`)}
              </h3>
            );
          case "h3":
            return (
              <h4 key={idx} className="mt-4 font-display text-sm font-bold text-ink-50">
                {renderInline(block.text, `h3-${idx}`)}
              </h4>
            );
          case "code":
            return (
              <pre
                key={idx}
                className="overflow-x-auto rounded-lg border border-ink-800 bg-ink-900 p-4"
              >
                <code className="font-mono text-[12.5px] leading-relaxed text-ink-100">
                  {block.text}
                </code>
              </pre>
            );
          case "ul":
            return (
              <ul key={idx} className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `ul-${idx}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="list-decimal space-y-1.5 pl-5 marker:text-gold-400">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `ol-${idx}-${j}`)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={idx} className="overflow-x-auto rounded-lg border border-ink-800">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-800 bg-ink-900">
                      {block.header.map((cell, j) => (
                        <th
                          key={j}
                          className="px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-400"
                        >
                          {renderInline(cell, `th-${idx}-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-ink-800/60 last:border-0">
                        {row.map((cell, c) => (
                          <td key={c} className="px-4 py-2.5 text-ink-200">
                            {renderInline(cell, `td-${idx}-${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "p":
          default:
            return (
              <p key={idx} className="text-ink-200">
                {renderInline(block.text, `p-${idx}`)}
              </p>
            );
        }
      })}
    </div>
  );
}
