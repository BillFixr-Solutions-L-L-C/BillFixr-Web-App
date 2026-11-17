import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalList } from "@/components/legal/LegalSection";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `BillFixr - ${t("legal.privacy.title")}` };
}

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <LegalPage title={t("legal.privacy.title")} updatedLabel={t("legal.lastUpdated")} updated={t("legal.updatedDate")}>
      <LegalSection title={t("legal.privacy.s1Title")}>
        <p>{t("legal.privacy.s1Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.s2Title")}>
        <p>{t("legal.privacy.s2Intro")}</p>
        <LegalList
          items={[
            t("legal.privacy.s2Item1"),
            t("legal.privacy.s2Item2"),
            t("legal.privacy.s2Item3"),
            t("legal.privacy.s2Item4"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.s3Title")}>
        <p>{t("legal.privacy.s3Intro")}</p>
        <LegalList
          items={[
            t("legal.privacy.s3Item1"),
            t("legal.privacy.s3Item2"),
            t("legal.privacy.s3Item3"),
            t("legal.privacy.s3Item4"),
            t("legal.privacy.s3Item5"),
          ]}
        />
        <p>{t("legal.privacy.s3Note")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.s4Title")}>
        <p>{t("legal.privacy.s4Intro")}</p>
        <LegalList
          items={[
            t("legal.privacy.s4Item1"),
            t("legal.privacy.s4Item2"),
            t("legal.privacy.s4Item3"),
            t("legal.privacy.s4Item4"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.s5Title")}>
        <p>{t("legal.privacy.s5Intro")}</p>
        <LegalList
          items={[t("legal.privacy.s5Item1"), t("legal.privacy.s5Item2"), t("legal.privacy.s5Item3")]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.s6Title")}>
        <p>
          {t("legal.privacy.s6Before")}{" "}
          <a href="/policies#cookies" className="font-medium text-primary-600 hover:text-primary-700">
            {t("legal.privacy.s6Link")}
          </a>{" "}
          {t("legal.privacy.s6After")}
        </p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.s7Title")}>
        <p>{t("legal.privacy.s7Intro")}</p>
        <LegalList
          items={[
            t("legal.privacy.s7Item1"),
            t("legal.privacy.s7Item2"),
            t("legal.privacy.s7Item3"),
            t("legal.privacy.s7Item4"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.s8Title")}>
        <p>privacy@billfixr.com</p>
      </LegalSection>
    </LegalPage>
  );
}
