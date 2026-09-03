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

  if (user && (isAdminRoute || isAuthRoute)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (isAdminRoute && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (isAuthRoute) {
      return NextResponse.redirect(new URL(profile?.role === "admin" ? "/admin" : "/dashboard", request.url));
    }
  }

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
  if (user && isDashboardRoute && !DASHBOARD_COMPLETION_EXEMPT_PATHS.some((p) => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("address, city, postal_code, country, profile_completion_exempt")
      .eq("id", user.id)
      .single();

    const needsCompletion =
      profile &&
      !profile.profile_completion_exempt &&
      (!profile.address || !profile.city || !profile.postal_code || !profile.country);

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
