import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("escapes all five reserved characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Hello, John Dansu")).toBe("Hello, John Dansu");
  });

  it("neutralizes a script-injection attempt", () => {
    const input = `<script>alert('xss')</script>`;
    const output = escapeHtml(input);
    expect(output).not.toContain("<script>");
    expect(output).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("handles an empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
