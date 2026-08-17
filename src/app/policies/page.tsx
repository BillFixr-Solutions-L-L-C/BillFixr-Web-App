import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalSubheading, LegalList, LegalJumpNav } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "BillFixr - Service Policies",
};

const links = [
  { href: "#service-agreement", label: "Service Agreement" },
  { href: "#consent", label: "Document Upload Consent" },
  { href: "#medical-disclaimer", label: "Medical Disclaimer" },
  { href: "#refund-policy", label: "Refund Policy" },
  { href: "#cookies", label: "Cookie Policy" },
];

export default function PoliciesPage() {
  return (
    <LegalPage title="Service Policies" updated="August 2026">
      <LegalJumpNav links={links} />

      <LegalSection id="service-agreement" title="Client Service Agreement">
        <LegalSubheading>Our Commitment</LegalSubheading>
        <p>We will:</p>
        <LegalList
          items={[
            "Review your bill thoroughly",
            "Identify errors and opportunities for reduction",
            "Negotiate on your behalf",
            "Keep you updated throughout the process",
          ]}
        />

        <LegalSubheading>Your Commitment</LegalSubheading>
        <p>You agree to:</p>
        <LegalList
          items={[
            "Provide accurate information",
            "Respond to requests for clarification",
            "Pay any agreed-upon fees",
          ]}
        />

        <LegalSubheading>Outcome</LegalSubheading>
        <p>
          Negotiation results vary. We cannot guarantee reductions, but we always act in your
          best interest.
        </p>
      </LegalSection>

      <LegalSection id="consent" title="Document Upload Consent">
        <p>By uploading documents to BillFixr, you confirm that:</p>
        <LegalList
          items={[
            "You are authorised to share the medical bill.",
            "You give BillFixr permission to review, analyse, and negotiate the bill.",
            "You allow us to contact the provider or billing department on your behalf.",
          ]}
        />
      </LegalSection>

      <LegalSection id="medical-disclaimer" title="Medical Disclaimer">
        <p>
          BillFixr does not provide medical advice, diagnosis, or treatment. All information and
          services are strictly financial and administrative. Always consult a licensed medical
          professional for medical concerns.
        </p>
      </LegalSection>

      <LegalSection id="refund-policy" title="Refund Policy">
        <LegalSubheading>Refunds for Negotiation Services</LegalSubheading>
        <p>If your bill is not reduced, you will not be charged any success-based fee.</p>

        <LegalSubheading>Refunds for Paid Services</LegalSubheading>
        <p>
          If you purchased a paid service and believe there was an error, contact us within 7
          days. We review all refund requests fairly and quickly.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookie Policy">
        <p>
          BillFixr uses cookies to improve site performance, personalise your experience, and
          analyse usage. You can disable cookies in your browser settings, but some features may
          not work properly.
        </p>
        <p>Types of cookies we use:</p>
        <LegalList
          items={["Essential cookies", "Performance cookies", "Analytics cookies", "Preference cookies"]}
        />
      </LegalSection>
    </LegalPage>
  );
}
