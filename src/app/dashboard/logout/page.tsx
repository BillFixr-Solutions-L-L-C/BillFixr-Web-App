import Link from "next/link";

export default function LogoutPage() {
  return (
    <div className="flex h-full min-h-[70vh] items-center justify-center gap-4">
      <Link
        href="/dashboard"
        className="rounded-full bg-primary-600 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-700"
      >
        Back to Dashboard
      </Link>
      <Link
        href="/"
        className="rounded-full bg-red-500 px-8 py-3 text-sm font-semibold text-white hover:bg-red-600"
      >
        Log Out
      </Link>
    </div>
  );
}
