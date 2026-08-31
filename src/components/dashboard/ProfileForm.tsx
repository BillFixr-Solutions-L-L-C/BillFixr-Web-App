"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

type Profile = {
  name: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  avatarUrl: string | null;
};

export default function ProfileForm({ profile }: { profile: Profile }) {
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save profile.");
      return;
    }
    setSaved(true);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarError("");
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    setUploadingAvatar(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploadingAvatar(false);
      setAvatarError("Not signed in.");
      return;
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingAvatar(false);
      setAvatarError(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const res = await fetch("/api/account/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: publicUrl }),
    });

    setUploadingAvatar(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAvatarError(data.error ?? "Failed to save photo.");
      return;
    }
    setForm((f) => ({ ...f, avatarUrl: publicUrl }));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-8">
      <div className="shrink-0">
        <div className="relative h-20 w-20">
          {form.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary-100" />
          )}
          <button
            type="button"
            aria-label="Edit photo"
            disabled={uploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs text-white ring-2 ring-white disabled:opacity-60"
          >
            {uploadingAvatar ? "…" : "✎"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        {avatarError && <p className="mt-2 max-w-[6rem] text-xs text-danger">{avatarError}</p>}
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Your Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Field label="Email" readOnly value={form.email} />
        <Field
          label="Address"
          required
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <Field
          label="City"
          required
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <Field
          label="Postal Code"
          required
          value={form.postalCode}
          onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
        />
        <Field
          label="Country"
          required
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
        />

        {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
        {saved && <p className="sm:col-span-2 text-sm text-primary-600">Profile saved.</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
