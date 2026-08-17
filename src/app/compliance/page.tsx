import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalList, LegalJumpNav } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "BillFixr - Government Compliance",
};

const links = [
  { href: "#hipaa", label: "HIPAA" },
  { href: "#accessibility", label: "Accessibility (ADA)" },
  { href: "#dmca", label: "DMCA" },
  { href: "#communications", label: "Communications (CAN-SPAM / TCPA)" },
];

export default function CompliancePage() {
  return (
    <LegalPage title="Government Compliance" updated="August 2026">
      <LegalJumpNav links={links} />

      <LegalSection id="hipaa" title="HIPAA Compliance Statement">
        <p>
          BillFixr is not a healthcare provider or insurance company. However, because we handle
          medical billing information, we follow HIPAA-aligned security practices:
        </p>
        <LegalList
          items={[
            "Encrypted storage",
            "Encrypted transmission",
            "Limited access to authorised staff",
            "Confidential handling of PHI",
            "Secure deletion procedures",
          ]}
        />
        <p>Your medical information is treated with the highest level of care.</p>
      </LegalSection>

      <LegalSection id="accessibility" title="Accessibility Statement (ADA)">
        <p>
          BillFixr is committed to making our website accessible to everyone. If you experience
          any accessibility issues, email{" "}
          <a href="mailto:accessibility@billfixr.com" className="font-medium text-primary-600 hover:text-primary-700">
            accessibility@billfixr.com
          </a>{" "}
          and we will assist you.
        </p>
      </LegalSection>

      <LegalSection id="dmca" title="DMCA Notice">
        <p>
          If you believe your copyrighted content has been uploaded to BillFixr without
          permission, contact us at{" "}
          <a href="mailto:dmca@billfixr.com" className="font-medium text-primary-600 hover:text-primary-700">
            dmca@billfixr.com
          </a>
          . We will review and remove infringing content promptly.
        </p>
      </LegalSection>

      <LegalSection id="communications" title="CAN-SPAM & TCPA Compliance Notice">
        <p>If you receive emails or SMS messages from BillFixr:</p>
        <LegalList
          items={[
            "You can opt out anytime.",
            "We will never send unsolicited marketing messages.",
            "We comply with all U.S. communication laws.",
          ]}
        />
      </LegalSection>
    </LegalPage>
  );
}
