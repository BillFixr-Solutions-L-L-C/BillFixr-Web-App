import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

// Vercel Cron hits this on a schedule (see vercel.json). Sends the
// 3/7/21-day follow-up emails for cases stuck in awaiting_response.
// Content is a fixed template — no AI involved, per BACKEND-PLAN.md.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: dueFollowUps, error } = await supabase
    .from("follow_ups")
    .select("id, cadence_day, cases(id, bills(filename), profiles(name, email))")
    .eq("sent", false)
    .lte("scheduled_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type DueFollowUp = {
    id: string;
    cases: {
      bills: { filename: string } | null;
      profiles: { name: string; email: string } | null;
    } | null;
  };

  let sentCount = 0;
  for (const followUp of (dueFollowUps ?? []) as unknown as DueFollowUp[]) {
    const caseRow = followUp.cases;
    const profile = caseRow?.profiles;
    const filename = caseRow?.bills?.filename ?? "your bill";

    if (!profile?.email) continue;

    try {
      await sendEmail({
        to: profile.email,
        subject: "Update on your BillFixr case",
        html: followUpEmailHtml({ name: profile.name, filename }),
      });
      await supabase.from("follow_ups").update({ sent: true }).eq("id", followUp.id);
      sentCount += 1;
    } catch (err) {
      // leave sent=false so the next cron run retries it
      console.error("Follow-up send failed for", followUp.id, err);
    }
  }

  return NextResponse.json({ processed: dueFollowUps?.length ?? 0, sent: sentCount });
}

function followUpEmailHtml({ name, filename }: { name: string; filename: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Update on your BillFixr case</title>
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
                Still waiting on your provider
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 0;">
              <p style="margin:0; font-size:14px; line-height:1.6; color:#4d6276; text-align:center;">
                Hi ${escapeHtml(name)}, we're still waiting to hear back from your provider about
                ${escapeHtml(filename)}. No action is needed on your end &mdash; we'll keep
                following up and let you know as soon as there's a response.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 40px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:999px; background-color:#0f7545;">
                    <a href="https://billfixr.com/dashboard/case"
                       style="display:inline-block; padding:14px 40px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px;">
                      View Your Case
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
