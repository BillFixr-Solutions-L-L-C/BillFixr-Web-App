import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refreshes the session cookie if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isAdminRoute = pathname.startsWith("/admin");
  const isTestimonialRoute = pathname.startsWith("/testimonial");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  if (!user && (isDashboardRoute || isAdminRoute || isTestimonialRoute)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Suspending an account used to be cosmetic: it set profiles.status and
  // coloured a label, but nothing anywhere checked it, so a suspended
  // customer kept full use of the dashboard and the API, and a suspended
  // admin kept full admin access. Enforced here because the proxy is the
  // one place every page and API request already passes through — a
  // per-route check is exactly what gets forgotten.
  //
  // The account keeps a valid session; it is simply not allowed to act.
  // /suspended explains that, and logging out talks to Supabase directly
  // rather than through our API, so it still works from there.
  const isApiRoute = pathname.startsWith("/api");
  const SUSPENSION_EXEMPT_PATHS = ["/suspended", "/dashboard/logout"];
  const isSuspensionExempt = SUSPENSION_EXEMPT_PATHS.some((p) => pathname.startsWith(p));

  // Mandatory-profile-completion gate — deliberately here, not in
  // dashboard/layout.tsx's redirect() (where it originally lived). A
  // redirect() thrown from a layout during a client-side (soft)
  // navigation — which is what every real path into /dashboard is,
  // since login/signup/confirm all land here via router.push/replace,
  // never a full page load — gets encoded as an in-stream RSC
  // instruction instead of a clean HTTP redirect, and that path turned
  // out to reliably render a permanently blank page in production
  // (reproduced on the live site itself, not just locally). A
  // middleware redirect is always a real top-level HTTP redirect
  // regardless of how the request arrived, so it doesn't hit that bug.
  const DASHBOARD_COMPLETION_EXEMPT_PATHS = ["/dashboard/settings", "/dashboard/logout"];
  const checksCompletion =
    isDashboardRoute && !DASHBOARD_COMPLETION_EXEMPT_PATHS.some((p) => pathname.startsWith(p));

  const needsProfile =
    user && (isAdminRoute || isAuthRoute || isDashboardRoute || isTestimonialRoute || isApiRoute);

  if (needsProfile && !isSuspensionExempt) {
    // A single lookup serving all three gates below — suspension, the
    // admin-role check, and profile completion — rather than a round trip
    // each. Keyed on the primary key, so it is one index hit.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, address, city, postal_code, country, avatar_url, profile_completion_exempt")
      .eq("id", user.id)
      .single();

    if (profile?.status === "suspended") {
      // An API caller wants a status code, not an HTML redirect.
      if (isApiRoute) {
        return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
      }
      // Leave /login and /signup reachable so they can still sign out and
      // back in as someone else; everything else goes to the notice.
      if (!isAuthRoute) {
        return NextResponse.redirect(new URL("/suspended", request.url));
      }
    }

    if (isAdminRoute && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (isAuthRoute && profile?.status !== "suspended") {
      return NextResponse.redirect(new URL(profile?.role === "admin" ? "/admin" : "/dashboard", request.url));
    }

    const needsCompletion =
      checksCompletion &&
      profile &&
      !profile.profile_completion_exempt &&
      (!profile.address || !profile.city || !profile.postal_code || !profile.country || !profile.avatar_url);

    if (needsCompletion) {
      return NextResponse.redirect(new URL("/dashboard/settings?complete_profile=1", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
