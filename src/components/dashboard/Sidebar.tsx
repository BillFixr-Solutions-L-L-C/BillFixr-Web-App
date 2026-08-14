"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import NavIcon from "@/components/dashboard/NavIcon";

const topLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Document", href: "/dashboard/documents" },
  { label: "Active Case", href: "/dashboard/case" },
];

const bottomLinks = [
  { label: "Support", href: "/dashboard/support" },
  { label: "Settings", href: "/dashboard/settings" },
  { label: "Log out", href: "/dashboard/logout" },
];

function NavLink({ label, href }: { label: string; href: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border-l-[6px] py-3 pl-3 pr-4 text-base font-medium transition ${
        active
          ? "border-[#0f7545] bg-[#ebebeb] text-[#0f7545]"
          : "border-transparent text-[#4d6276] hover:bg-gray-50"
      }`}
    >
      <NavIcon active={active} />
      {label}
    </Link>
  );
}

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-white px-5 py-8">
      <Link href="/">
        <Logo />
      </Link>

      <nav className="mt-6 flex flex-col gap-2">
        {topLinks.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
      </nav>

      <div className="flex-1" />

      <nav className="flex flex-col gap-2">
        {bottomLinks.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
      </nav>

      <div className="mt-6 rounded-2xl border border-gray-100 p-4 shadow-sm">
        <span className="block h-11 w-11 shrink-0 rounded-full bg-primary-100" aria-hidden="true" />
        <div className="mt-3 min-w-0">
          <p className="truncate text-base font-medium text-gray-900">Haris Ahmed</p>
          <p className="text-sm text-[#0f7545]">Active</p>
        </div>
      </div>
    </aside>
  );
}
