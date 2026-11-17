import Image from "next/image";
import { getT } from "@/lib/i18n/server";

export default async function AuthPanel() {
  const t = await getT();
  return (
    <div className="relative hidden self-stretch overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-primary-900 lg:flex lg:w-full lg:max-w-lg lg:flex-col lg:items-center lg:justify-center lg:gap-10">
      <Image src="/logo-icon.png" alt="" width={280} height={246} />
      <p className="absolute bottom-10 text-xs font-semibold tracking-wide text-white/70">
        {t("auth.panelTagline")}
      </p>
    </div>
  );
}
