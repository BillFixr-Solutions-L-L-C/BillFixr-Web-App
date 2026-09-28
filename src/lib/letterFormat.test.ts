import { describe, expect, it } from "vitest";
import { letterToHtml, parseLetter, toggleBullets, toggleWrap } from "./letterFormat";

describe("parseLetter", () => {
  it("parses bold, italic and bullets", () => {
    const blocks = parseLetter("Hello **world** and *you*\n- first\n- **second**");
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      runs: [
        { text: "Hello ", bold: false, italic: false },
        { text: "world", bold: true, italic: false },
        { text: " and ", bold: false, italic: false },
        { text: "you", bold: false, italic: true },
      ],
    });
    expect(blocks[1]).toEqual({ kind: "bullet", runs: [{ text: "first", bold: false, italic: false }] });
    expect(blocks[2].runs).toEqual([{ text: "second", bold: true, italic: false }]);
  });

  it("keeps blank lines as empty paragraphs", () => {
    expect(parseLetter("a\n\nb")[1]).toEqual({ kind: "paragraph", runs: [] });
  });
});

describe("letterToHtml", () => {
  it("escapes HTML in the letter text", () => {
    const html = letterToHtml("<script>alert(1)</script> **<b>x</b>**");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
  });

  it("groups consecutive bullets into one list", () => {
    const html = letterToHtml("- a\n- b\ntext");
    expect(html).toBe('<ul><li>a</li><li>b</li></ul><p style="margin:0">text</p>');
  });
});

describe("toggleWrap", () => {
  it("wraps the selection in a marker", () => {
    expect(toggleWrap({ value: "say hello now", start: 4, end: 9 }, "**")).toEqual({
      value: "say **hello** now",
      start: 6,
      end: 11,
    });
  });

  it("unwraps a selection that is already wrapped", () => {
    expect(toggleWrap({ value: "say **hello** now", start: 6, end: 11 }, "**")).toEqual({
      value: "say hello now",
      start: 4,
      end: 9,
    });
  });
});

describe("toggleBullets", () => {
  it("adds a bullet to every selected line", () => {
    const result = toggleBullets({ value: "a\nb\nc", start: 0, end: 3 });
    expect(result.value).toBe("- a\n- b\nc");
  });

  it("removes bullets when every selected line already has one", () => {
    const result = toggleBullets({ value: "- a\n- b", start: 0, end: 7 });
    expect(result.value).toBe("a\nb");
  });
});
