import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Forwarded so dashboard/layout.tsx (a Server Component, no direct
  // access to the current path) can know which page it's rendering
  // without a second per-request lookup.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

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
          response = NextResponse.next({ request: { headers: requestHeaders } });
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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
