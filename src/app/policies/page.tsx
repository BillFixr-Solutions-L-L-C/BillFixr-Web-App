import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalSubheading, LegalList, LegalJumpNav } from "@/components/legal/LegalSection";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF, BUSINESS_PHONE, BUSINESS_PHONE_HREF } from "@/lib/businessContact";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `BillFixr - ${t("legal.policies.title")}` };
}

export default async function PoliciesPage() {
  const t = await getT();

  // Inside the component, for the reason spelled out in compliance/page.tsx:
  // a module-level array of t(...) calls freezes in the first request's
  // language.
  const links = [
    { href: "#service-agreement", label: t("legal.policies.navAgreement") },
    { href: "#consent", label: t("legal.policies.navConsent") },
    { href: "#medical-disclaimer", label: t("legal.policies.navDisclaimer") },
    { href: "#refund-policy", label: t("legal.policies.navRefunds") },
    { href: "#cookies", label: t("legal.policies.navCookies") },
  ];

  return (
    <LegalPage title={t("legal.policies.title")} updatedLabel={t("legal.lastUpdated")} updated={t("legal.updatedDate")}>
      <LegalJumpNav links={links} />

      <LegalSection id="service-agreement" title={t("legal.policies.agreementTitle")}>
        <LegalSubheading>{t("legal.policies.ourCommitment")}</LegalSubheading>
        <p>{t("legal.policies.weWill")}</p>
        <LegalList
          items={[
            t("legal.policies.ourItem1"),
            t("legal.policies.ourItem2"),
            t("legal.policies.ourItem3"),
            t("legal.policies.ourItem4"),
          ]}
        />

        <LegalSubheading>{t("legal.policies.yourCommitment")}</LegalSubheading>
        <p>{t("legal.policies.youAgree")}</p>
        <LegalList
          items={[
            t("legal.policies.yourItem1"),
            t("legal.policies.yourItem2"),
            t("legal.policies.yourItem3"),
          ]}
        />

        <LegalSubheading>{t("legal.policies.outcomeTitle")}</LegalSubheading>
        <p>{t("legal.policies.outcomeBody")}</p>
      </LegalSection>

      <LegalSection id="consent" title={t("legal.policies.consentTitle")}>
        <p>{t("legal.policies.consentIntro")}</p>
        <LegalList
          items={[
            t("legal.policies.consentItem1"),
            t("legal.policies.consentItem2"),
            t("legal.policies.consentItem3"),
          ]}
        />
      </LegalSection>

      <LegalSection id="medical-disclaimer" title={t("legal.policies.disclaimerTitle")}>
        <p>{t("legal.policies.disclaimerBody")}</p>
      </LegalSection>

      <LegalSection id="refund-policy" title={t("legal.policies.refundTitle")}>
        <LegalSubheading>{t("legal.policies.refundNegSub")}</LegalSubheading>
        <p>{t("legal.policies.refundNegBody")}</p>

        <LegalSubheading>{t("legal.policies.refundPaidSub")}</LegalSubheading>
        <p>
          {t("legal.policies.refundPaidBefore")}{" "}
          <a href={SUPPORT_EMAIL_HREF} className="text-primary-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          {t("legal.policies.refundPaidOr")}{" "}
          <a href={BUSINESS_PHONE_HREF} className="text-primary-600 hover:underline">
            {BUSINESS_PHONE}
          </a>
          {t("legal.policies.refundPaidAfter")}
        </p>

        <LegalSubheading>{t("legal.policies.currencySub")}</LegalSubheading>
        <p>{t("legal.policies.currencyBody")}</p>
      </LegalSection>

      <LegalSection id="cookies" title={t("legal.policies.cookiesTitle")}>
        <p>{t("legal.policies.cookiesBody")}</p>
        <p>{t("legal.policies.cookiesTypesIntro")}</p>
        <LegalList
          items={[
            t("legal.policies.cookieType1"),
            t("legal.policies.cookieType2"),
            t("legal.policies.cookieType3"),
            t("legal.policies.cookieType4"),
          ]}
        />
      </LegalSection>
    </LegalPage>
  );
}
