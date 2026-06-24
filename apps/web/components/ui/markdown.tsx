"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { parseBlocks } from "./markdown-parse";

// Re-exported so existing importers (e.g. the Close Room) keep getting stripInline
// from "@/components/ui/markdown"; the implementation lives in the pure, tested
// markdown-parse module.
export { stripInline } from "./markdown-parse";

/**
 * Minimal, dependency-free markdown renderer (dark theme, gold ## headers).
 * Handles the block shapes our LLM prompts emit: headings, fenced code, ordered
 * and unordered lists, tables, and paragraphs, with inline bold / code / italic.
 * Shared by the Close Room, Knowledge Q&A, and Voice Dojo so all render identically
 * and we carry no markdown dependency. Parsing lives in ./markdown-parse (tested).
 */

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
