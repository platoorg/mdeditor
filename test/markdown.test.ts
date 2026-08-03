import { describe, expect, it } from "vitest";
import { escapeHtmlText, renderMarkdownSafe } from "../src/markdown";

describe("escapeHtmlText", () => {
  it("escapes ampersands, less-than, and greater-than", () => {
    expect(escapeHtmlText("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("neutralizes a script tag", () => {
    expect(escapeHtmlText("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("is a no-op on plain text", () => {
    expect(escapeHtmlText("hello world")).toBe("hello world");
  });
});

describe("renderMarkdownSafe", () => {
  it("parses then sanitizes when a sanitizer is available", () => {
    const parse = (md: string) => `<p>${md}</p>`;
    const sanitize = (html: string) => html.replace("<p>", "<p class=\"sanitized\">");
    expect(renderMarkdownSafe("hi", parse, sanitize)).toBe('<p class="sanitized">hi</p>');
  });

  it("fails closed to escaped text when no sanitizer is available", () => {
    const parse = (md: string) => `<img src=x onerror=alert(1)>${md}`;
    expect(renderMarkdownSafe("<b>hi</b>", parse, null)).toBe("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("never calls parse when there is no sanitizer, so raw HTML can't leak through", () => {
    let parseCalled = false;
    const parse = (md: string) => {
      parseCalled = true;
      return md;
    };
    renderMarkdownSafe("hi", parse, null);
    expect(parseCalled).toBe(false);
  });

  it("treats a missing markdown value as an empty string", () => {
    let received: string | undefined;
    const parse = (md: string) => {
      received = md;
      return md;
    };
    renderMarkdownSafe("", parse, (html) => html);
    expect(received).toBe("");
  });
});
