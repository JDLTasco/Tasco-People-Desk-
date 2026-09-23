// html-to-text 10.x ships no type declarations at all (no "types" in its
// package.json exports, nothing in "files") and DefinitelyTyped's
// @types/html-to-text only covers up through 9.x -- rather than depend on
// a community typings package that's already behind the installed major
// version, this declares only the minimal shape lib/graph/client.ts's
// emailHtmlToText() actually calls.
declare module "html-to-text" {
  export interface HtmlToTextSelectorOptions {
    format?: string;
    options?: Record<string, unknown>;
  }

  export interface HtmlToTextOptions {
    wordwrap?: number | false;
    selectors?: Array<{ selector: string; format?: string; options?: Record<string, unknown> }>;
  }

  export function htmlToText(html: string, options?: HtmlToTextOptions): string;
}
