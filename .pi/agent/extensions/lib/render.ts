/**
 * render: shared "collapsed by default, ctrl-o to expand" tool rendering.
 *
 * pi already binds `app.tools.expand` to ctrl-o (a GLOBAL toggle of the
 * `expanded` flag passed into every renderResult). The default fallback
 * renderer just dumps raw text regardless of that flag, so output is never
 * really hidden. These helpers give tools the Claude-Code-style behaviour:
 *
 *   - collapsed (default): a compact one-line summary + "(… ctrl-o to expand)"
 *   - expanded (ctrl-o):   the full text body
 *
 * Usage in a tool:
 *
 *   import { renderToolCall, renderCollapsibleResult } from "../lib/render.ts";
 *   ...
 *   renderCall: renderToolCall("web_search", (a) => `"${a.query}"`),
 *   renderResult: renderCollapsibleResult({
 *     summary: (result) => result.details?.query
 *       ? `searched "${result.details.query}"`
 *       : "done",
 *   }),
 */

import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// Minimal structural types so this file does not depend on exported tool types.
type ThemeLike = {
  fg: (token: string, s: string) => string;
  bold: (s: string) => string;
};
type ToolResultLike = {
  content?: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown> & { error?: unknown };
  isError?: boolean;
};

/** Pull the first text block out of a tool result. */
export function resultText(result: ToolResultLike): string {
  const block = result.content?.find((c) => c.type === "text");
  return block?.text ?? "";
}

/**
 * renderCall factory: bold tool name + an optional accent-coloured argument
 * summary. Keep this compact; it is always visible.
 */
export function renderToolCall<A>(
  name: string,
  argSummary?: (args: A) => string,
) {
  return (args: A, theme: ThemeLike) => {
    let text = theme.fg("toolTitle", theme.bold(`${name} `));
    if (argSummary) {
      const s = argSummary(args);
      if (s) text += theme.fg("accent", s);
    }
    return new Text(text, 0, 0);
  };
}

/**
 * renderCall factory for fully custom friendly header text. `build` returns the
 * already-themed string (use the passed `theme` to colour it).
 */
export function renderCallText<A>(build: (args: A, theme: ThemeLike) => string) {
  return (args: A, theme: ThemeLike) => new Text(build(args, theme), 0, 0);
}

export interface CollapsibleOptions<R extends ToolResultLike = ToolResultLike> {
  /** One-line headline shown in BOTH collapsed and expanded views. */
  summary: (result: R) => string;
  /** Text shown when expanded. Defaults to the result's first text block. */
  body?: (result: R) => string;
  /** Headline shown while the call is still streaming. */
  partial?: string;
  /** Max body lines to show when expanded (default: 200). */
  maxLines?: number;
}

/**
 * renderResult factory: collapsed summary + ctrl-o hint by default, full body
 * when expanded. Honours `isPartial` and error results automatically.
 */
export function renderCollapsibleResult<R extends ToolResultLike = ToolResultLike>(
  opts: CollapsibleOptions<R>,
) {
  const { summary, body, partial = "Working…", maxLines = 200 } = opts;

  return (
    result: R,
    state: { expanded: boolean; isPartial: boolean },
    theme: ThemeLike,
  ) => {
    const { expanded, isPartial } = state;

    if (isPartial) {
      return new Text(theme.fg("warning", partial), 0, 0);
    }

    const errored = result.isError || result.details?.error;
    if (errored) {
      const msg = String(result.details?.error ?? resultText(result) ?? "error");
      let text = theme.fg("error", `✗ ${msg.split("\n")[0]}`);
      if (!expanded && msg.includes("\n")) {
        text += theme.fg("dim", ` (${keyHint("app.tools.expand", "to expand")})`);
      } else if (expanded) {
        text += `\n${theme.fg("dim", msg)}`;
      }
      return new Text(text, 0, 0);
    }

    const fullBody = (body ? body(result) : resultText(result)).trimEnd();
    const lineCount = fullBody ? fullBody.split("\n").length : 0;
    let text = theme.fg("success", `✓ ${summary(result)}`);

    if (!expanded) {
      if (lineCount > 0) {
        const noun = lineCount === 1 ? "line" : "lines";
        text += theme.fg(
          "dim",
          ` (${lineCount} ${noun}, ${keyHint("app.tools.expand", "to expand")})`,
        );
      }
      return new Text(text, 0, 0);
    }

    // Expanded view: show the body, capped at maxLines.
    if (fullBody) {
      const lines = fullBody.split("\n");
      const shown = lines.slice(0, maxLines);
      for (const line of shown) text += `\n${theme.fg("dim", line)}`;
      if (lines.length > maxLines) {
        const omitted = lines.length - maxLines;
        text += `\n${theme.fg("muted", `… ${omitted} more line${omitted === 1 ? "" : "s"} omitted`)}`;
      }
    }
    return new Text(text, 0, 0);
  };
}
