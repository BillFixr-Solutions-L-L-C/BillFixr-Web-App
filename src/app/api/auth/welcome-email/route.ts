import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

// Fired once, right after a new user's confirmation link lands them back
// in the app (see /welcome). Idempotent via profiles.welcome_email_sent_at
// — a reload, a re-clicked confirmation link, or a retried fetch on that
// page shouldn't send this twice.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, welcome_email_sent_at")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (profile.welcome_email_sent_at) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  try {
    await sendEmail({
      to: profile.email,
      subject: "Welcome to BillFixr",
      html: welcomeEmailHtml({ name: profile.name }),
    });
  } catch (err) {
    console.error("Welcome email send failed for", user.id, err);
    return NextResponse.json({ error: "failed to send" }, { status: 500 });
  }

  await supabase.from("profiles").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}

function welcomeEmailHtml({ name }: { name: string }) {
  const steps = [
    { title: "Upload Your Bill", description: "Upload your medical bill" },
    { title: "We Review & Detect Errors", description: "AI scans for overcharges and hidden fees" },
    { title: "We Negotiate For You", description: "Our experts negotiate with providers" },
    { title: "You Save Money", description: "Receive your reduced bill" },
  ];

  const stepRows = steps
    .map(
      (step, i) => `
          <tr>
            <td style="padding:0 40px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="top" width="32" style="padding-right:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="24" height="24">
                      <tr>
                        <td width="24" height="24" align="center" valign="middle" bgcolor="#0f7545" style="width:24px; height:24px; border-radius:12px; background-color:#0f7545; font-family:Arial, Helvetica, sans-serif; font-size:12px; font-weight:700; line-height:24px; color:#ffffff; text-align:center;">${i + 1}</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top">
                    <p style="margin:0; font-size:14px; font-weight:700; color:#003322;">${escapeHtml(step.title)}</p>
                    <p style="margin:2px 0 0; font-size:13px; color:#4d6276;">${escapeHtml(step.description)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Welcome to BillFixr</title>
</head>
<body style="margin:0; padding:0; background-color:#f4fffa; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4fffa; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:24px; box-shadow:0 4px 24px rgba(0,0,0,0.06); overflow:hidden;">

          <tr>
            <td align="center" style="padding:40px 40px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="padding-right:8px;">
                    <img src="https://www.billfixr.com/logo-icon-green.png" width="28" height="28" alt="BillFixr" style="display:block;" />
                  </td>
                  <td valign="middle">
                    <span style="font-size:20px; font-weight:700; color:#0f7545;">Bill</span><span style="font-size:20px; font-weight:700; color:#eaa93f;">Fixr</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 8px;">
              <h1 style="margin:0; font-size:22px; line-height:1.3; color:#003322; font-weight:700; text-align:center;">
                You're in, ${escapeHtml(name)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 24px;">
              <p style="margin:0; font-size:14px; line-height:1.6; color:#4d6276; text-align:center;">
                Your account is confirmed and ready. Here's how BillFixr works:
              </p>
            </td>
          </tr>

          ${stepRows}

          <tr>
            <td style="padding:8px 40px 0;">
              <div style="border-top:1px solid #ebebeb;"></div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 0;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:700; color:#003322; text-transform:uppercase; letter-spacing:0.04em;">
                What it costs
              </p>
              <p style="margin:0; font-size:13px; line-height:1.6; color:#4d6276;">
                A small $5 commitment fee gets your bill into the queue for review right away -
                it goes toward your final BillFixr fee, so it's never extra. If we find and fix
                errors, a success fee applies only as a percentage of what you actually save. If
                no errors are found, that's all you ever pay - no success fee.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 40px 0;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:700; color:#003322; text-transform:uppercase; letter-spacing:0.04em;">
                Your documents are private
              </p>
              <p style="margin:0; font-size:13px; line-height:1.6; color:#4d6276;">
                Your bill is only used to review and negotiate on your behalf - it's not shared or
                sold, and you can see everything we're doing from your dashboard at any time.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:28px 40px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:999px; background-color:#0f7545;">
                    <a href="https://www.billfixr.com/dashboard"
                       style="display:inline-block; padding:14px 40px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px;">
                      Upload Your First Bill
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px 0;">
              <div style="border-top:1px solid #ebebeb;"></div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 40px;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#a6b1bb; text-align:center;">
                Questions? Reach us anytime from the Support tab in your dashboard.
              </p>
              <p style="margin:16px 0 0; font-size:11px; color:#a6b1bb; text-align:center;">
                Copyright 2026 BillFixr Technologies. All Rights Reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
