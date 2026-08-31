import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

// Deletes everything that references a profile before deleting the auth
// user itself, since none of those foreign keys are `on delete cascade`.
// Shared between the admin-triggered delete route and the self-service
// one — same cleanup either way, only the authorization check differs.
// Also sends a brief deletion-confirmation email — captured before any
// deletion happens, since the profile row (and the email address on it)
// won't exist anymore once this finishes.
export async function deleteAccountCascade(admin: SupabaseClient, userId: string) {
  const { data: profile } = await admin.from("profiles").select("name, email").eq("id", userId).single();

  const { data: cases } = await admin.from("cases").select("id").eq("user_id", userId);
  const caseIds = (cases ?? []).map((c) => c.id);
  const { data: tickets } = await admin.from("support_tickets").select("id").eq("user_id", userId);
  const ticketIds = (tickets ?? []).map((t) => t.id);

  if (ticketIds.length) {
    await admin.from("chat_messages").delete().in("ticket_id", ticketIds);
  }
  if (caseIds.length) {
    await admin.from("communication_logs").delete().in("case_id", caseIds);
    await admin.from("follow_ups").delete().in("case_id", caseIds);
  }
  await admin.from("payment_records").delete().eq("user_id", userId);
  await admin.from("support_tickets").delete().eq("user_id", userId);
  await admin.from("notifications").delete().eq("user_id", userId);
  await admin.from("testimonials").delete().eq("user_id", userId);
  if (caseIds.length) {
    await admin.from("cases").delete().eq("user_id", userId);
  }
  await admin.from("bills").delete().eq("user_id", userId);

  const result = await admin.auth.admin.deleteUser(userId);

  if (!result.error && profile?.email) {
    try {
      await sendEmail({
        to: profile.email,
        subject: "Your BillFixr account has been deleted",
        html: deletionEmailHtml({ name: profile.name }),
      });
    } catch (err) {
      // The deletion itself already succeeded — a failed notification
      // shouldn't surface as a deletion failure, just log it.
      console.error("Deletion confirmation email failed for", userId, err);
    }
  }

  return result;
}

function deletionEmailHtml({ name }: { name: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your BillFixr account has been deleted</title>
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
                Your account has been deleted
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 0;">
              <p style="margin:0; font-size:14px; line-height:1.6; color:#4d6276; text-align:center;">
                Hi ${escapeHtml(name)}, this confirms your BillFixr account and all associated data (bills,
                cases, support tickets) have been permanently deleted.
              </p>
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
                If you didn't expect this, or believe it was done in error, reach out from
                <a href="https://www.billfixr.com/#contact" style="color:#0f7545;">billfixr.com/#contact</a> right away.
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
