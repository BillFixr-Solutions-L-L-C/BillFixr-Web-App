import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalList } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "BillFixr - Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2026">
      <LegalSection title="1. Overview">
        <p>
          Your privacy matters. BillFixr was built to protect your personal and medical
          information with care, transparency, and respect.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <p>We collect:</p>
        <LegalList
          items={[
            "Medical bills and documents you upload",
            "Contact information (name, email, phone)",
            "Payment details (for paid services)",
            "Usage data (analytics, device info)",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. How We Use Your Information">
        <p>We use your information to:</p>
        <LegalList
          items={[
            "Review and negotiate your medical bills",
            "Communicate with you",
            "Improve our platform",
            "Process payments",
            "Maintain security and compliance",
          ]}
        />
        <p>We never sell your data.</p>
      </LegalSection>

      <LegalSection title="4. HIPAA Alignment">
        <p>BillFixr is not a covered entity, but we follow HIPAA-aligned practices:</p>
        <LegalList
          items={[
            "Encryption in transit and at rest",
            "Strict access controls",
            "Confidential handling of PHI",
            "Secure deletion procedures",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Sharing Your Information">
        <p>We may share your information only when necessary:</p>
        <LegalList
          items={[
            "With healthcare providers during negotiation",
            "With secure third-party vendors",
            "When required by law",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Cookies & Tracking">
        <p>
          We use cookies to improve your experience. You can disable cookies in your browser
          settings. See our{" "}
          <a href="/policies#cookies" className="font-medium text-primary-600 hover:text-primary-700">
            Cookie Policy
          </a>{" "}
          for details.
        </p>
      </LegalSection>

      <LegalSection title="7. Your Rights">
        <p>You can:</p>
        <LegalList
          items={[
            "Request a copy of your data",
            "Ask us to delete your data",
            "Update your information",
            "Opt out of marketing communications",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>privacy@billfixr.com</p>
      </LegalSection>
    </LegalPage>
  );
}
