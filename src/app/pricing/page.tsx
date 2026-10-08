import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMITMENT_FEE_CENTS } from "@/lib/stripe";
import {
  BUSINESS_NAME,
  BUSINESS_ADDRESS_LINES,
  BUSINESS_PHONE,
  BUSINESS_PHONE_HREF,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
} from "@/lib/businessContact";

export const metadata: Metadata = {
  title: "BillFixr - Pricing",
  description: "What BillFixr costs: a $5 commitment fee credited against a success fee charged only on what we save you.",
};

// No Figma frame exists for this page — the file has no pricing screen —
// so it is built from the landing page's existing tokens and components
// rather than invented layout.
//
// Both figures come from the same places checkout reads them, so the
// published price cannot drift from what a customer is actually charged:
// the commitment fee from lib/stripe.ts, the success fee from
// app_settings (an admin can change it in /admin/payments and this page
// follows).
export default async function PricingPage() {
  // Service role, deliberately, and selecting nothing but the percentage:
  // app_settings is not readable under RLS by a signed-out visitor, so the
  // user-scoped client got zero rows here and the page quietly advertised
  // the 30% fallback while the account was configured for 12%. Widening
  // RLS instead would expose the row's updated_by.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("success_fee_percentage")
    .eq("id", 1)
    .single();

  const percentage = Number(settings?.success_fee_percentage ?? 30);
  const commitmentFee = COMMITMENT_FEE_CENTS / 100;

  return (
    <div className="bg-primary-50">
      <Navbar />

      <main className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <header className="text-center">
          <h1 className="text-4xl font-bold text-[#003322] sm:text-5xl">Pricing</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-primary-900/60">
            You pay ${commitmentFee} to get your bill reviewed, and a share of what we save you.
            If we don&apos;t find anything, there is nothing more to pay.
          </p>
        </header>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <section className="rounded-3xl border border-primary-100 bg-white p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-900/40">
              Commitment fee
            </h2>
            <p className="mt-3 text-4xl font-bold text-[#003322]">
              ${commitmentFee}
              <span className="ml-2 text-base font-medium text-primary-900/50">per bill</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-primary-900/70">
              Charged once, when you submit a bill for review. It is credited in full against your
              success fee, so it is not an extra charge — if a success fee is owed, you pay that
              amount less the ${commitmentFee} you have already paid.
            </p>
          </section>

          <section className="rounded-3xl border border-[#0f7545] bg-white p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-900/40">
              Success fee
            </h2>
            <p className="mt-3 text-4xl font-bold text-[#003322]">
              {percentage}%
              <span className="ml-2 text-base font-medium text-primary-900/50">of what you save</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-primary-900/70">
              Charged only if we find errors and your bill is actually reduced. It is {percentage}% of
              the amount you save — never a percentage of the original bill. No reduction means no
              success fee.
            </p>
          </section>
        </div>

        <section className="mt-10 rounded-3xl bg-white p-8">
          <h2 className="text-xl font-semibold text-[#003322]">A worked example</h2>
          <p className="mt-3 text-sm leading-relaxed text-primary-900/70">
            Say we review a ${(2_000).toLocaleString()} bill and get it reduced by{" "}
            ${(500).toLocaleString()}.
          </p>
          <dl className="mt-6 divide-y divide-primary-100 text-sm">
            <div className="flex items-center justify-between py-3">
              <dt className="text-primary-900/70">You save</dt>
              <dd className="font-semibold text-[#003322]">${(500).toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-primary-900/70">Success fee ({percentage}% of ${(500).toLocaleString()})</dt>
              <dd className="font-semibold text-[#003322]">${(500 * percentage) / 100}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-primary-900/70">Less the commitment fee already paid</dt>
              <dd className="font-semibold text-[#003322]">-${commitmentFee}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="font-semibold text-[#003322]">Total you pay</dt>
              <dd className="font-semibold text-[#003322]">
                ${(500 * percentage) / 100 - commitmentFee}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-10 space-y-6 rounded-3xl bg-white p-8">
          <h2 className="text-xl font-semibold text-[#003322]">What else should I know?</h2>
          <div>
            <h3 className="text-sm font-semibold text-[#003322]">There is no subscription</h3>
            <p className="mt-1 text-sm leading-relaxed text-primary-900/70">
              Nothing recurring, and no charge for holding an account. You pay per bill you ask us
              to review.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#003322]">What if no errors are found?</h3>
            <p className="mt-1 text-sm leading-relaxed text-primary-900/70">
              Then there is no success fee. You will have paid the ${commitmentFee} commitment fee
              for the review itself, and nothing further.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#003322]">When am I charged?</h3>
            <p className="mt-1 text-sm leading-relaxed text-primary-900/70">
              The commitment fee when you submit the bill. The success fee only after your bill has
              been reduced and you can see the result.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#003322]">How do I pay?</h3>
            <p className="mt-1 text-sm leading-relaxed text-primary-900/70">
              By card, processed by Stripe. We never see or store your card details.
            </p>
          </div>
        </section>

        <section className="mt-10 rounded-3xl bg-white p-8">
          <h2 className="text-xl font-semibold text-[#003322]">Questions about a charge?</h2>
          <p className="mt-3 text-sm leading-relaxed text-primary-900/70">
            Talk to a person before or after you pay — we would rather answer a question than
            take a payment someone did not understand.
          </p>
          <address className="mt-5 not-italic text-sm leading-relaxed text-primary-900/70">
            <span className="font-semibold text-[#003322]">{BUSINESS_NAME}</span>
            <br />
            {BUSINESS_ADDRESS_LINES.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
            <a href={BUSINESS_PHONE_HREF} className="mt-2 inline-block font-medium text-[#0f7545] hover:underline">
              {BUSINESS_PHONE}
            </a>
            <br />
            <a href={SUPPORT_EMAIL_HREF} className="font-medium text-[#0f7545] hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </address>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-full bg-[#0f7545] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Review Your Bill
          </Link>
          <a
            href="mailto:support@billfixr.com"
            className="rounded-full border border-[#0f7545] px-8 py-3.5 text-sm font-semibold text-[#0f7545] transition hover:bg-white"
          >
            Ask us a question
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
