import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { LegalSection, LegalList } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "BillFixr - Terms of Service",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 2026">
      <LegalSection title="1. Introduction">
        <p>
          Welcome to BillFixr. These Terms of Service explain how our platform works, what you
          can expect from us, and what we expect from you. By using BillFixr, you agree to these
          terms.
        </p>
      </LegalSection>

      <LegalSection title="2. What BillFixr Does">
        <p>
          BillFixr helps users review, analyse, and negotiate medical bills. We use automated
          tools and human review to identify errors, overcharges, and opportunities for
          reduction. We are not a medical provider, insurance company, or legal service.
        </p>
      </LegalSection>

      <LegalSection title="3. Your Responsibilities">
        <p>You agree that:</p>
        <LegalList
          items={[
            "You are authorised to upload the medical bills you submit.",
            "The information you provide is accurate.",
            "You will not upload harmful, illegal, or fraudulent content.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. No Medical Advice">
        <p>
          BillFixr does not provide medical advice, diagnosis, or treatment. All information is
          strictly financial and administrative.
        </p>
      </LegalSection>

      <LegalSection title="5. Fees & Payments">
        <p>
          Some services may include fees. These will always be clearly stated before you
          proceed. You agree to pay any applicable fees for services you choose.
        </p>
      </LegalSection>

      <LegalSection title="6. Service Limitations">
        <p>
          Negotiation outcomes vary. We cannot guarantee reductions or specific results. We
          promise to act in your best interest and use every available method to help reduce
          your bill.
        </p>
      </LegalSection>

      <LegalSection title="7. Privacy & Security">
        <p>
          Your data is handled according to our Privacy Policy. We use industry-standard
          security practices to protect your information.
        </p>
      </LegalSection>

      <LegalSection title="8. Termination">
        <p>
          We may suspend or terminate your access if you violate these terms or misuse the
          platform.
        </p>
      </LegalSection>

      <LegalSection title="9. Governing Law">
        <p>
          These terms are governed by U.S. law. Any disputes will be resolved in the state where
          BillFixr is legally registered.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>support@billfixr.com</p>
      </LegalSection>
    </LegalPage>
  );
}
