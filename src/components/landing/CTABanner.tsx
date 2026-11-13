"use client";

import { useT } from "@/lib/i18n/client";

export default function CTABanner() {
  const t = useT();
  return (
    <section className="bg-primary-900 px-6 py-28 sm:py-36">
      <h2 className="mx-auto max-w-2xl text-center text-4xl font-semibold leading-tight text-white sm:text-6xl">
        {t("home.ctaLine1")}
        <br />
        {t("home.ctaLine2")}
      </h2>
    </section>
  );
}
