import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalList, LegalJumpNav } from "@/components/legal/LegalSection";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `BillFixr - ${t("legal.compliance.title")}` };
}

export default async function CompliancePage() {
  const t = await getT();

  // Built inside the component, not at module level. A module-level array
  // of t(...) calls is evaluated once per process, on whichever request
  // happens to load the module first, and then every later request gets
  // that request's language -- the bug already fixed three times in this
  // codebase (DashboardStats, the landing Navbar, the support dropdown).
  const links = [
    { href: "#hipaa", label: t("legal.compliance.navHipaa") },
    { href: "#accessibility", label: t("legal.compliance.navAccessibility") },
    { href: "#dmca", label: t("legal.compliance.navDmca") },
    { href: "#communications", label: t("legal.compliance.navComms") },
  ];

  return (
    <LegalPage title={t("legal.compliance.title")} updatedLabel={t("legal.lastUpdated")} updated={t("legal.updatedDate")}>
      <LegalJumpNav links={links} />

      <LegalSection id="hipaa" title={t("legal.compliance.hipaaTitle")}>
        <p>{t("legal.compliance.hipaaBody")}</p>
        <LegalList
          items={[
            t("legal.compliance.hipaaItem1"),
            t("legal.compliance.hipaaItem2"),
            t("legal.compliance.hipaaItem3"),
            t("legal.compliance.hipaaItem4"),
            t("legal.compliance.hipaaItem5"),
          ]}
        />
        <p>{t("legal.compliance.hipaaNote")}</p>
      </LegalSection>

      <LegalSection id="accessibility" title={t("legal.compliance.accessTitle")}>
        <p>
          {t("legal.compliance.accessBefore")}{" "}
          <a href="mailto:accessibility@billfixr.com" className="font-medium text-primary-600 hover:text-primary-700">
            accessibility@billfixr.com
          </a>{" "}
          {t("legal.compliance.accessAfter")}
        </p>
      </LegalSection>

      <LegalSection id="dmca" title={t("legal.compliance.dmcaTitle")}>
        <p>
          {t("legal.compliance.dmcaBefore")}{" "}
          <a href="mailto:dmca@billfixr.com" className="font-medium text-primary-600 hover:text-primary-700">
            dmca@billfixr.com
          </a>
          {t("legal.compliance.dmcaAfter")}
        </p>
      </LegalSection>

      <LegalSection id="communications" title={t("legal.compliance.commsTitle")}>
        <p>{t("legal.compliance.commsIntro")}</p>
        <LegalList
          items={[
            t("legal.compliance.commsItem1"),
            t("legal.compliance.commsItem2"),
            t("legal.compliance.commsItem3"),
          ]}
        />
      </LegalSection>
    </LegalPage>
  );
}
