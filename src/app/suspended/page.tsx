import Link from "next/link";
import Logo from "@/components/Logo";
import LogOutButton from "@/components/LogOutButton";

// Where the proxy sends a signed-in account whose profile is suspended.
// Deliberately outside /dashboard and /admin so it isn't caught by the
// same gate that redirects here.
export default function SuspendedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 py-16 text-center">
      <Logo />

      <h1 className="mt-10 font-serif text-3xl font-bold text-gray-900">Your account is suspended</h1>

      <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-600">
        You can&apos;t use BillFixr while your account is suspended. Any case already in progress is
        unaffected and stays on file. If you think this is a mistake, get in touch and we&apos;ll take
        another look.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href="mailto:support@billfixr.com"
          className="rounded-full bg-primary-600 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Contact Support
        </a>
        <LogOutButton />
      </div>

      <Link href="/" className="mt-8 text-sm font-medium text-primary-600 hover:text-primary-700">
        Back to billfixr.com
      </Link>
    </main>
  );
}
