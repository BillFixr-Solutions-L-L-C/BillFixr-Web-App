import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

// Promotes an existing customer account to an admin role in place — the
// account, credentials, and any existing case/bill history stay exactly
// as they are, only profiles.role/role_id change. Distinct from
// invite-admin, which always creates a brand-new auth user; this route
// works on someone who already has a real, confirmed account. Same
// authorization gate as invite-admin (any existing admin can grant a
// role) — see roles RLS policy comments for why this isn't scoped
// tighter yet.
export async function POST(request: Request) {
  const { userId, roleId } = await request.json();
  if (typeof userId !== "string" || typeof roleId !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("name, email, role").eq("id", userId).single();
  if (!target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (target.role === "admin") {
    return NextResponse.json({ error: "already an admin" }, { status: 400 });
  }

  const { data: role } = await admin.from("roles").select("name").eq("id", roleId).single();
  if (!role) {
    return NextResponse.json({ error: "role not found" }, { status: 404 });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role: "admin", role_id: roleId })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  try {
    await sendEmail({
      to: target.email,
      subject: `Welcome to your new role: ${role.name}`,
      html: roleWelcomeEmailHtml({ name: target.name, roleName: role.name }),
    });
  } catch (err) {
    // The promotion itself already succeeded and shouldn't be rolled back
    // over a notification failure — log it so it can be resent manually.
    console.error("Role welcome email failed for", userId, err);
  }

  return NextResponse.json({ ok: true });
}

function roleWelcomeEmailHtml({ name, roleName }: { name: string; roleName: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Welcome to your new role</title>
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
                Welcome to ${escapeHtml(roleName)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 0;">
              <p style="margin:0; font-size:14px; line-height:1.6; color:#4d6276; text-align:center;">
                Hi ${escapeHtml(name)}, you've been given the <strong>${escapeHtml(roleName)}</strong> role on
                BillFixr. Your account now has admin access based on what that role covers - log in any time to
                see what's changed.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:28px 40px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:999px; background-color:#0f7545;">
                    <a href="https://www.billfixr.com/admin"
                       style="display:inline-block; padding:14px 40px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px;">
                      Go to Admin Dashboard
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
                Didn't expect this? Contact whoever manages your BillFixr team.
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
