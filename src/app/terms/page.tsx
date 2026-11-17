import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalList } from "@/components/legal/LegalSection";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `BillFixr - ${t("legal.terms.title")}` };
}

export default async function TermsPage() {
  const t = await getT();
  return (
    <LegalPage title={t("legal.terms.title")} updatedLabel={t("legal.lastUpdated")} updated={t("legal.updatedDate")}>
      <LegalSection title={t("legal.terms.s1Title")}>
        <p>{t("legal.terms.s1Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s2Title")}>
        <p>{t("legal.terms.s2Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s3Title")}>
        <p>{t("legal.terms.s3Intro")}</p>
        <LegalList
          items={[t("legal.terms.s3Item1"), t("legal.terms.s3Item2"), t("legal.terms.s3Item3")]}
        />
      </LegalSection>

      <LegalSection title={t("legal.terms.s4Title")}>
        <p>{t("legal.terms.s4Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s5Title")}>
        <p>{t("legal.terms.s5Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s6Title")}>
        <p>{t("legal.terms.s6Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s7Title")}>
        <p>{t("legal.terms.s7Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s8Title")}>
        <p>{t("legal.terms.s8Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s9Title")}>
        <p>{t("legal.terms.s9Body")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.s10Title")}>
        <p>support@billfixr.com</p>
      </LegalSection>
    </LegalPage>
  );
}
