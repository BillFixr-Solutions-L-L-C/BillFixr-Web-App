"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import NavIcon, { type NavIconName } from "@/components/dashboard/NavIcon";
import { SOCIAL_LINKS } from "@/components/socialLinks";

type Link = { label: string; href: string; icon: NavIconName };

const topLinks: Link[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "My Document", href: "/dashboard/documents", icon: "document" },
  { label: "Active Case", href: "/dashboard/case", icon: "case" },
  { label: "Completed Case", href: "/dashboard/completed", icon: "completed" },
  { label: "Support", href: "/dashboard/support", icon: "support" },
];

const bottomLinks: Link[] = [
  { label: "Settings", href: "/dashboard/settings", icon: "settings" },
  { label: "Log out", href: "/dashboard/logout", icon: "logout" },
];

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NavLink({ label, href, icon, onNavigate }: Link & { onNavigate?: () => void }) {
  const pathname = usePathname();
  // Detail routes live under their section (e.g. /dashboard/documents/[id]),
  // so the section stays highlighted while you're inside one. /dashboard
  // itself is exact — everything else is nested under it.
  const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg border-l-[6px] py-3 pl-3 pr-4 text-base font-medium transition ${
        active
          ? "border-[#0f7545] bg-[#ebebeb] text-[#0f7545]"
          : `border-transparent hover:bg-gray-50 ${icon === "logout" ? "text-danger" : "text-[#4d6276]"}`
      }`}
    >
      <NavIcon name={icon} active={active} />
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
        <Link href="/dashboard">
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
        // Desktop: sticky + full viewport height so the nav stays put while
        // the page scrolls. Its own contents scroll if they ever outgrow the
        // viewport. Mobile keeps the slide-in drawer.
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto bg-white px-5 py-8 transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
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

        <div className="mt-6 flex items-center justify-center gap-2">
          {SOCIAL_LINKS.filter((s) => s.href).map((s) => (
            <a
              key={s.label}
              href={s.href!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              title={s.label}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-[#0f7545] transition hover:bg-primary-100"
            >
              {s.icon}
            </a>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 p-4 shadow-sm">
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
