import Link from "next/link";
import Logo from "@/components/Logo";

const links = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why choose us", href: "/#why-choose-us" },
  { label: "Testimonials", href: "/#testimonials" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/#contact" },
];

export default function Navbar() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
      <Link href="/">
        <Logo />
      </Link>

      <nav className="hidden items-center gap-8 text-sm font-medium text-primary-900 md:flex">
        {links.map((link) => (
          <Link key={link.label} href={link.href} className="hover:text-primary-600">
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          Sign Up
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-primary-600 px-5 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
        >
          Log in
        </Link>
      </div>
    </header>
  );
}
