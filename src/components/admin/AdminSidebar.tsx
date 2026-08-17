"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import {
  DashboardIcon,
  UsersIcon,
  CareersIcon,
  TestimonialsIcon,
  PaymentsIcon,
  UploadsIcon,
  SupportIcon,
  SettingsIcon,
  AutomationIcon,
  TeamIcon,
  ChevronIcon,
} from "@/components/admin/icons";

const nav = [
  { label: "Dashboard", href: "/admin", icon: DashboardIcon },
  { label: "Users", href: "/admin/users", icon: UsersIcon },
  { label: "Careers", href: "/admin/careers", icon: CareersIcon },
  { label: "Testimonials", href: "/admin/testimonials", icon: TestimonialsIcon },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: PaymentsIcon,
    children: [
      { label: "Commitment", href: "/admin/payments/commitment" },
      { label: "Percentage", href: "/admin/payments/percentage" },
    ],
  },
  {
    label: "Uploads",
    href: "/admin/uploads",
    icon: UploadsIcon,
    children: [{ label: "Customer", href: "/admin/uploads" }],
  },
  { label: "Support", href: "/admin/support", icon: SupportIcon },
  { label: "Automation Monitoring", href: "/admin/automation", icon: AutomationIcon },
  { label: "User Management", href: "/admin/user-management", icon: TeamIcon },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: SettingsIcon,
    children: [
      { label: "Manage Admin", href: "/admin/settings" },
      { label: "Profile Settings", href: "/admin/settings/profile" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(
    nav.find((item) => item.children?.some((c) => c.href === pathname))?.label ?? null,
  );

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col justify-between border-r border-gray-100 bg-white px-5 py-8">
      <div>
        <Link href="/">
          <Logo />
        </Link>

        <nav className="mt-10 flex flex-col gap-1 text-sm">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const isOpen = openGroup === item.label;

            return (
              <div key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => item.children && setOpenGroup(isOpen ? null : item.label)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 font-medium transition ${
                    active ? "text-gray-900" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon />
                    {item.label}
                  </span>
                  {item.children && <ChevronIcon open={isOpen} />}
                </Link>

                {item.children && isOpen && (
                  <div className="ml-8 flex flex-col gap-1 border-l border-gray-100 pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`py-1.5 text-sm ${
                          pathname === child.href
                            ? "font-medium text-primary-700"
                            : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <Link
        href="/"
        className="rounded-full border border-red-200 py-2.5 text-center text-sm font-semibold text-red-500 hover:bg-red-50"
      >
        Logout
      </Link>
    </aside>
  );
}
