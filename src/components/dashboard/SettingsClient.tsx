"use client";

import { useState } from "react";
import PageHeading from "@/components/dashboard/PageHeading";
import ProfileForm from "@/components/dashboard/ProfileForm";
import ChangePasswordForm from "@/components/dashboard/ChangePasswordForm";
import DeleteMyAccount from "@/components/dashboard/DeleteMyAccount";

type Profile = {
  name: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  avatarUrl: string | null;
};

export default function SettingsClient({
  profile,
  showCompletionNotice,
}: {
  profile: Profile;
  showCompletionNotice: boolean;
}) {
  const [tab, setTab] = useState<"profile" | "security">("profile");

  return (
    <div>
      <PageHeading title="Settings" />

      {showCompletionNotice && (
        <div className="mb-6 rounded-xl border border-accent-300 bg-accent-300/10 px-4 py-3 text-sm text-accent-600">
          Please complete your profile (name and mailing address) to continue using the dashboard.
        </div>
      )}

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
        <ProfileForm profile={profile} />
      ) : (
        <div className="flex flex-wrap items-start gap-16">
          <ChangePasswordForm email={profile.email} />

          <div className="mt-9">
            <DeleteMyAccount />
          </div>
        </div>
      )}
    </div>
  );
}
