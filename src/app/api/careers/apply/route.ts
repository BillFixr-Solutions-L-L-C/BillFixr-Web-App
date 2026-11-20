import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";
import { PUBLIC_EMAILS, fillCopy } from "@/lib/emailCopy";
import { asLanguage, type Language } from "@/lib/language";

// The CV file itself is uploaded client-side straight to the `cvs`
// storage bucket (unchanged) before this is called — this route only
// takes the resulting path, does the job_applications insert (RLS
// already permits a public insert here, same as before this route
// existed), and sends the confirmation email, which has to happen
// server-side since sendEmail is server-only.
export async function POST(request: Request) {
  const { jobId, fullName, email, phone, cvPath, language: requested } = await request.json();
  // The language the careers page was being read in. An applicant has
  // no profile, so this is the only signal there is.
  const language = asLanguage(requested);
  if (
    typeof jobId !== "string" ||
    typeof fullName !== "string" ||
    typeof email !== "string" ||
    typeof phone !== "string" ||
    typeof cvPath !== "string"
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error: insertError } = await supabase.from("job_applications").insert({
    job_id: jobId,
    full_name: fullName,
    email,
    phone,
    cv_storage_url: cvPath,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: job } = await supabase.from("job_postings").select("title").eq("id", jobId).single();

  try {
    const copy = PUBLIC_EMAILS[language].application;
    await sendEmail({
      to: email,
      subject: copy.subject,
      html: applicationReceivedEmailHtml({ fullName, jobTitle: job?.title ?? "", language }),
    });
  } catch (err) {
    // Best-effort — the application itself is already recorded.
    console.error("Application-received email failed for", email, err);
  }

  return NextResponse.json({ ok: true });
}

function applicationReceivedEmailHtml({
  fullName,
  jobTitle,
  language,
}: {
  fullName: string;
  jobTitle: string;
  language: Language;
}) {
  const copy = PUBLIC_EMAILS[language].application;
  // The role is emphasised inside the sentence, so the two values are
  // escaped before they are put into it and the result is not escaped
  // again -- doing both would show the customer &amp; in their own name.
  const body = fillCopy(copy.body, {
    name: escapeHtml(fullName),
    role: `<span style="color:#003322; font-weight:600;">${escapeHtml(jobTitle)}</span>`,
  });
  return renderEmailCard({
    title: copy.subject,
    heading: copy.heading,
    language,
    bodyHtml: emailParagraph(body),
  });
}
