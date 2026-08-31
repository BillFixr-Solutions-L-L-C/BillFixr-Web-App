"use client";

import { useState } from "react";
import PageHeading from "@/components/dashboard/PageHeading";
import DeleteMyAccount from "@/components/dashboard/DeleteMyAccount";

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm text-primary-700 focus:border-primary-400 focus:outline-none"
      />
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "security">("profile");

  return (
    <div>
      <PageHeading title="Settings" />

      <div className="mb-6 flex gap-8 border-b border-gray-200 text-sm font-medium">
        {(["profile", "security"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-3 ${
              tab === t ? "border-primary-600 text-primary-700" : "border-transparent text-gray-400"
            }`}
          >
            {t === "profile" ? "Edit Profile" : "Security"}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <div className="flex flex-wrap gap-8">
          <div className="relative h-20 w-20 shrink-0">
            <div className="h-20 w-20 rounded-full bg-primary-100" />
            <button
              type="button"
              aria-label="Edit photo"
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs text-white ring-2 ring-white"
            >
              ✎
            </button>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Your Name" defaultValue="Charlene Reed" />
            <Field label="User Name" defaultValue="Charlene Reed" />
            <Field label="Email" defaultValue="charlenereed@gmail.com" />
            <Field label="Password" type="password" defaultValue="charlene123" />
            <Field label="Date of Birth" defaultValue="25 January 1990" />
            <Field label="Present Address" defaultValue="San Jose, California, USA" />
            <Field label="Permanent Address" defaultValue="San Jose, California, USA" />
            <Field label="City" defaultValue="San Jose" />
            <Field label="Postal Code" defaultValue="45962" />
            <Field label="Country" defaultValue="USA" />

            <div className="sm:col-span-2">
              <button
                type="button"
                className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-8">
          <div className="max-w-md flex-1">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Change Password</h2>
            <div className="flex flex-col gap-5">
              <Field label="Current Password" type="password" />
              <Field label="New Password" type="password" />
            </div>
            <button
              type="button"
              className="mt-6 rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Save
            </button>
          </div>

          <DeleteMyAccount />
        </div>
      )}
    </div>
  );
}
