import Link from "next/link";
import Navbar from "@/components/landing/Navbar";

export default function NotFound() {
  return (
    <main className="flex-1 bg-gradient-to-b from-primary-50 via-white to-white">
      <Navbar />
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="flex items-center justify-center gap-4 text-6xl font-bold sm:text-7xl">
          <span className="text-primary-900">Error</span>
          <span className="text-primary-500">404</span>
        </h1>
        <h2 className="mt-6 text-2xl font-bold text-primary-900">Oop! Page not found.</h2>
        <p className="mt-4 text-primary-900/50">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin ultricies fringilla
          diam, a egestas tellus ultricies et. Maecenas nec erat non nulla commodo ultricies
          at eu nisl. Proin egestas, nisi a Maecenas
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full border border-primary-600 px-7 py-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
