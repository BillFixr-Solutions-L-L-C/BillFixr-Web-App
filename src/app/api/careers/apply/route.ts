import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderEmailCard, emailParagraph } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/html";

// The CV file itself is uploaded client-side straight to the `cvs`
// storage bucket (unchanged) before this is called — this route only
// takes the resulting path, does the job_applications insert (RLS
// already permits a public insert here, same as before this route
// existed), and sends the confirmation email, which has to happen
// server-side since sendEmail is server-only.
export async function POST(request: Request) {
  const { jobId, fullName, email, phone, cvPath } = await request.json();
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
    await sendEmail({
      to: email,
      subject: "We received your application",
      html: applicationReceivedEmailHtml({ fullName, jobTitle: job?.title ?? "the role" }),
    });
  } catch (err) {
    // Best-effort — the application itself is already recorded.
    console.error("Application-received email failed for", email, err);
  }

  return NextResponse.json({ ok: true });
}

function applicationReceivedEmailHtml({ fullName, jobTitle }: { fullName: string; jobTitle: string }) {
  return renderEmailCard({
    title: "We received your application",
    heading: "Application received",
    bodyHtml: emailParagraph(
      `Hi ${escapeHtml(fullName)}, thanks for applying for <span style="color:#003322; font-weight:600;">${escapeHtml(jobTitle)}</span>. Our team will review your application and reach out if it's a match.`,
    ),
  });
}
