"use client";

import Image from "next/image";

import { useT } from "@/lib/i18n/client";

export default function WelcomeBanner({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const tr = useT();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-900 px-4 py-4 sm:gap-5 sm:px-8 sm:py-6">
      <Image
        src="/logo-icon.png"
        alt=""
        width={72}
        height={67}
        className="h-11 w-[47px] shrink-0 sm:h-[67px] sm:w-[72px]"
      />
      <div>
        <h2 className="text-lg font-bold text-white sm:text-2xl">{title ?? tr("upload.welcome")}</h2>
        <p className="mt-0.5 text-sm text-white/85 sm:mt-1 sm:text-base">{subtitle ?? tr("upload.welcomeSub")}</p>
      </div>
    </div>
  );
}
