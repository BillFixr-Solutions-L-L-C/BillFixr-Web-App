import { createClient } from "@/lib/supabase/server";
import SettingsClient from "@/components/dashboard/SettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ complete_profile?: string }>;
}) {
  const { complete_profile } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, address, city, postal_code, country, avatar_url")
    .eq("id", user!.id)
    .single();

  return (
    <SettingsClient
      profile={{
        name: profile?.name ?? "",
        email: profile?.email ?? "",
        address: profile?.address ?? "",
        city: profile?.city ?? "",
        postalCode: profile?.postal_code ?? "",
        country: profile?.country ?? "",
        avatarUrl: profile?.avatar_url ?? null,
      }}
      showCompletionNotice={complete_profile === "1"}
    />
  );
}
