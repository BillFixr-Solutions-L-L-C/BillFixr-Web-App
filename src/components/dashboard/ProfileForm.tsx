"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

// Sanity cap on the raw source file before we even try to decode it —
// the resize step below handles "too big" for any normal photo, this
// just stops someone selecting something absurd (or non-image data with
// an image extension) from hanging the browser on decode.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const AVATAR_MAX_DIMENSION = 512;
const AVATAR_JPEG_QUALITY = 0.85;

// Resolution/size reducer: every avatar gets downscaled and re-encoded
// client-side before upload, regardless of the source photo's resolution
// or format, so a multi-megabyte/high-resolution phone photo never hits
// Supabase Storage as-is (server-side bucket limits stay as a second
// layer, see 20260910000000_storage_bucket_limits.sql, but should rarely
// matter once this runs first).
async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))),
      "image/jpeg",
      AVATAR_JPEG_QUALITY,
    );
  });
}

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
  const router = useRouter();
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
    // Two separate things need clearing after a save that completes the
    // required fields: (1) the dashboard layout's server-side completion
    // check, which the client-side router cache would otherwise keep
    // serving a stale "incomplete" result for, and (2) the on-page
    // "please complete your profile" banner, which is driven purely by
    // the ?complete_profile=1 URL param rather than real profile state
    // and so never clears on its own. Replacing to the bare path fixes
    // both — it drops the param (clearing the banner) and forces a fresh
    // server render (clearing the layout's stale check).
    router.replace("/dashboard/settings");
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
    if (file.size > MAX_SOURCE_BYTES) {
      setAvatarError("Image is too large to process. Please choose a smaller file.");
      return;
    }

    setUploadingAvatar(true);

    let resized: Blob;
    try {
      resized = await resizeAvatar(file);
    } catch {
      setUploadingAvatar(false);
      setAvatarError("Couldn't process that image — try a different file.");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploadingAvatar(false);
      setAvatarError("Not signed in.");
      return;
    }

    const path = `${user.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, resized, { upsert: true, contentType: "image/jpeg" });
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
        <p className="mb-1 text-sm text-gray-600">
          Profile photo <span className="text-danger">*</span>
        </p>
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
        {!form.avatarUrl && !avatarError && (
          <p className="mt-2 max-w-[7rem] text-xs text-gray-400">Required to use the dashboard.</p>
        )}
        {avatarError && <p className="mt-2 max-w-[7rem] text-xs text-danger">{avatarError}</p>}
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
