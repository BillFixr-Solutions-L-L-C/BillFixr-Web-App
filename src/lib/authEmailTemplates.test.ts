import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The three Supabase Auth emails: signup confirmation, password recovery
// and the admin invite.
//
// These are rendered by GoTrue, not by this app, so nothing else in the
// suite touches them -- and a mistake in one is invisible until a real
// person cannot confirm a real account. Two things are worth asserting.
//
// First, the Go template variables. GoTrue substitutes .TokenHash and
// .SiteURL; a template that loses one still renders and still sends, and
// the link in it goes nowhere.
//
// Second, the language. GoTrue knows .Email, .TokenHash and .SiteURL and
// nothing about the person, so it cannot pick a language the way every
// other customer email now does -- profiles.communication_language is
// not available to it. The two customer-facing templates carry both
// languages instead. The invite is staff-facing and stays English, like
// the rest of the admin side.
function template(name: string): string {
  return readFileSync(`supabase/templates/${name}.html`, "utf8");
}

const CUSTOMER_FACING = ["confirmation", "recovery"];

describe("the Supabase Auth email templates", () => {
  it.each([...CUSTOMER_FACING, "invite"])("%s keeps the link GoTrue fills in", (name) => {
    const html = template(name);

    expect(html).toContain("{{ .TokenHash }}");
    expect(html).toContain("{{ .SiteURL }}");
    // The anchor and the visible fallback URL, so a blocked button still
    // leaves something to paste.
    expect(html.match(/\{\{ \.TokenHash \}\}/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it.each(CUSTOMER_FACING)("%s is written in both languages", (name) => {
    const html = template(name);

    // Spanish markers that cannot appear by accident in English copy.
    expect(html).toMatch(/&eacute;|&oacute;|&ntilde;|&iquest;/);
    expect(html.toLowerCase()).toMatch(/su cuenta|su contrase/);
  });

  it("leaves the admin invite in English", () => {
    // Staff-facing, like every other admin screen.
    const html = template("invite");

    expect(html.toLowerCase()).not.toMatch(/su cuenta|su contrase/);
  });

  it.each([...CUSTOMER_FACING, "invite"])("%s has balanced table markup", (name) => {
    // These are table-layout emails; an unclosed <tr> renders as a blank
    // message in Outlook rather than as an error anywhere.
    const html = template(name);

    for (const tag of ["table", "tr", "td"]) {
      // A character class with no backslash in it. An earlier version
      // used a whitespace escape, which did not survive the shell that
      // wrote this file and silently became [s>] -- matching <tr> and
      // never <table role=...>, so the counts looked wrong rather than
      // the regex.
      const open = (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect(`${tag}:${open}`).toBe(`${tag}:${close}`);
    }
  });
});
