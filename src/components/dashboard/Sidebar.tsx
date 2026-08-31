"use client";

import { useState } from "react";
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

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NavLink({ label, href, onNavigate }: { label: string; href: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
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

export default function Sidebar({
  user,
}: {
  user: { name: string; status: "active" | "suspended"; avatarUrl: string | null };
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4 md:hidden">
        <Link href="/">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50"
        >
          <MenuIcon />
        </button>
      </div>

      {open && (
        <div
          role="presentation"
          onClick={close}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col bg-white px-5 py-8 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="text-gray-400 hover:text-gray-600 md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="mt-6 flex flex-col gap-2">
          {topLinks.map((link) => (
            <NavLink key={link.href} {...link} onNavigate={close} />
          ))}
        </nav>

        <div className="flex-1" />

        <nav className="flex flex-col gap-2">
          {bottomLinks.map((link) => (
            <NavLink key={link.href} {...link} onNavigate={close} />
          ))}
        </nav>

        <div className="mt-6 rounded-2xl border border-gray-100 p-4 shadow-sm">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="block h-11 w-11 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="block h-11 w-11 shrink-0 rounded-full bg-primary-100" aria-hidden="true" />
          )}
          <div className="mt-3 min-w-0">
            <p className="truncate text-base font-medium text-gray-900">{user.name}</p>
            <p className={`text-sm ${user.status === "active" ? "text-[#0f7545]" : "text-danger"}`}>
              {user.status === "active" ? "Active" : "Suspended"}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
