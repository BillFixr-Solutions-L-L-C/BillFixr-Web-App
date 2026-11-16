"use client";

import Image from "next/image";
import { useT } from "@/lib/i18n/client";

export default function WhyChooseUs() {
  const t = useT();
  return (
    <section id="why-choose-us" className="bg-primary-50 px-6 py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <h2 className="text-4xl font-bold text-primary-900 sm:text-5xl">{t("home.whyChooseUs")}</h2>
          <p className="mt-6 text-lg text-primary-900">
            {t("home.whyBody1")}
          </p>
          <p className="mt-4 text-lg text-primary-900">
            {t("home.whyBody2")}
          </p>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-primary-100 sm:aspect-[9/10]">
          <Image
            src="/img-1.jpg"
            alt={t("home.caregiverAlt")}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
