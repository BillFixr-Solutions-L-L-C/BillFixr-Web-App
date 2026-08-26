"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import DashboardStats from "@/components/dashboard/DashboardStats";
import TextStepper from "@/components/dashboard/TextStepper";
import Modal from "@/components/dashboard/Modal";
import PaymentForm from "@/components/dashboard/PaymentForm";
import FlowCard from "@/components/dashboard/FlowCard";
import BillPreview from "@/components/dashboard/BillPreview";
import { createClient } from "@/lib/supabase/client";

type Stage =
  | "upload"
  | "terms"
  | "uploading"
  | "uploaded"
  | "ready"
  | "feePrompt"
  | "payment"
  | "scanning"
  | "negotiating";

const emptyStats = {
  billsAnalyzed: "0",
  savingsFound: "$0",
  errorsDetected: "0",
  appealsGenerated: "0",
};

const finalStats = {
  billsAnalyzed: "1",
  savingsFound: "$2,345",
  errorsDetected: "2",
  appealsGenerated: "1",
};

export default function DashboardHome() {
  const [stage, setStage] = useState<Stage>("upload");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fileName = pendingFile?.name ?? "";

  useEffect(() => {
    if (stage === "uploaded") {
      const t = setTimeout(() => setStage("ready"), 1200);
      return () => clearTimeout(t);
    }
  }, [stage]);

  async function handleAgree() {
    setStage("uploading");
    setUploadError(null);

    if (!pendingFile) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploadError("You need to be logged in to upload a bill.");
      setStage("upload");
      return;
    }

    const path = `${user.id}/${Date.now()}-${pendingFile.name}`;
    const { error: uploadErr } = await supabase.storage.from("bills").upload(path, pendingFile);
    if (uploadErr) {
      setUploadError(uploadErr.message);
      setStage("upload");
      return;
    }

    const { error: insertErr } = await supabase.from("bills").insert({
      user_id: user.id,
      filename: pendingFile.name,
      storage_url: path,
      status: "uploaded",
    });
    if (insertErr) {
      setUploadError(insertErr.message);
      setStage("upload");
      return;
    }

    setStage("uploaded");
  }

  const hasFile = stage === "scanning" || stage === "negotiating";
  const stats = stage === "negotiating" ? finalStats : emptyStats;

  return (
    <div>
      <WelcomeBanner />
      {stage === "negotiating" && <TextStepper activeStep={2} />}
      <DashboardStats values={stats} />

      {hasFile ? (
        stage === "scanning" ? (
          <FlowCard>
            <p className="text-3xl font-bold leading-tight text-[#003322]">
              We&apos;re scanning your
              <br />
              Medical Bill
            </p>
            <div className="relative mt-6 flex h-28 w-28 items-center justify-center rounded-full border-[8px] border-[#d9d9d9]">
              <div
                className="absolute inset-0 rounded-full border-[8px] border-transparent border-t-[#0f7545] border-r-[#0f7545]"
                style={{ transform: "rotate(-45deg)" }}
              />
              <span className="text-xl font-bold text-[#003322]">40%</span>
            </div>
            <p className="mt-5 text-base text-[#a6b1bb]">Please wait...</p>
            <button
              type="button"
              onClick={() => setStage("negotiating")}
              className="mt-4 text-xs text-gray-300 hover:text-gray-400"
            >
              (dev) simulate scan complete
            </button>
          </FlowCard>
        ) : (
          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-accent-500">📄</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{fileName || "Crown Med Hosp..."}</p>
                  <p className="flex items-center gap-1 text-xs text-gray-400">
                    205kb
                    <span className="text-primary-600">✓ Uploaded</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="text-sm font-medium text-primary-600"
              >
                👁 View
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                    <th className="px-4 py-3">Bill</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Upload Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Errors</th>
                    <th className="px-4 py-3">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-50">
                    <td className="px-4 py-3 text-gray-800">{fileName || "Crown Med Hosp..."}</td>
                    <td className="px-4 py-3 text-gray-600">Crown health...</td>
                    <td className="px-4 py-3 text-gray-600">Jul 14, 2026</td>
                    <td className="px-4 py-3 font-medium text-accent-600">Negotiating</td>
                    <td className="px-4 py-3 font-medium text-red-500">2 found</td>
                    <td className="px-4 py-3 text-gray-800">$2,345</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-primary-50 px-5 py-4">
              <p className="text-sm text-primary-800">
                Your errors have been found and negotiation has started. Track the response and
                next steps from your Active Case.
              </p>
              <Link
                href="/dashboard/case"
                className="shrink-0 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
              >
                Continue to Active Case
              </Link>
            </div>
          </div>
        )
      ) : (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex min-h-[440px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 px-6 py-10 text-center">
            {stage === "upload" && (
              <label className="flex cursor-pointer flex-col items-center">
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-6Z"
                      stroke="#0f7545"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path d="M14 3v6h5" stroke="#0f7545" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#0f7545] text-xs font-bold text-white">
                    +
                  </span>
                </span>
                <p className="mt-4 text-2xl font-bold text-[#003322]">Choose a file</p>
                <p className="mt-2 max-w-sm text-base text-[#a6b1bb]">
                  Drag and drop your files,{" "}
                  <span className="font-medium text-[#0f7545]">or click here to choose</span> from
                  your device. Supported files includes Jpeg, png, doc, pdf.
                </p>
                <span className="mt-5 rounded-full bg-[#0f7545] px-8 py-3 text-base font-semibold text-white">
                  Upload Your Bill
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPendingFile(file);
                      setStage("terms");
                    }
                  }}
                />
              </label>
            )}

            {stage === "upload" && uploadError && (
              <p className="mt-4 text-sm text-danger">{uploadError}</p>
            )}

            {stage === "uploading" && (
              <div className="flex w-full max-w-sm flex-col items-center">
                <p className="text-2xl font-bold text-[#003322]">File Uploading</p>
                <div className="mt-6 h-[8px] w-full rounded-[20px] bg-[#d9d9d9]">
                  <div className="h-[8px] w-[40%] rounded-[20px] bg-[#ebb55d]" />
                </div>
                <p className="mt-4 text-2xl font-bold text-[#003322]">40%</p>
                <p className="mt-2 text-base text-[#a6b1bb]">
                  Please wait a minute while your file is being uploaded for scan
                </p>
              </div>
            )}

            {stage === "uploaded" && (
              <div className="flex flex-col items-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#4bd37b]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="mt-4 max-w-xs text-2xl font-bold leading-tight text-[#003322]">
                  File Uploaded successfully
                </p>
                <p className="mt-2 max-w-sm text-base text-[#a6b1bb]">
                  Your file will be scan by in a moment
                </p>
              </div>
            )}

            {stage === "ready" && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-2xl font-bold text-[#003322]">Ready for scan</p>
                <p className="max-w-sm text-base text-[#a6b1bb]">
                  Your medical bill is ready for scan now, click the button below
                </p>
                <button
                  type="button"
                  onClick={() => setStage("feePrompt")}
                  className="mt-1 rounded-full bg-[#0f7545] px-8 py-3 text-base font-semibold text-white hover:opacity-90"
                >
                  Scan now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {stage === "terms" && (
        <Modal>
          <p className="text-sm leading-relaxed text-gray-600">
            These Terms &amp; Conditions <strong>(&quot;Terms&quot;)</strong> govern your use of
            BillFixr, an AI-powered medical bill reduction service operated in the United
            States. By accessing or using BillFixr, you agree to these Terms. If you do not
            agree, do not use the service.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            By uploading my medical bill, I authorize BillFixr to analyze, review, and
            negotiate with my healthcare provider on my behalf.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            I understand that BillFixr may contact the hospital, request corrections, and
            obtain a revised bill as part of the reduction process.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            I agree to the fee structure and confirm that all documents I upload are accurate
            and legally mine to submit.
          </p>
          <button
            type="button"
            onClick={handleAgree}
            className="mx-auto mt-8 block rounded-full bg-[#0f7545] px-10 py-3.5 text-sm font-semibold text-white hover:opacity-90"
          >
            I Agree
          </button>
        </Modal>
      )}

      {stage === "feePrompt" && (
        <Modal onClose={() => setStage("ready")}>
          <p className="text-center text-2xl font-bold leading-snug text-[#003322]">
            Proceed to make your commitment fee while your document is being scanned
          </p>
          <button
            type="button"
            onClick={() => setStage("payment")}
            className="mx-auto mt-8 block rounded-full bg-[#0f7545] px-10 py-3.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Proceed to Payment
          </button>
        </Modal>
      )}

      {stage === "payment" && (
        <Modal onClose={() => setStage("feePrompt")}>
          <PaymentForm
            lineItems={[{ label: "Commitment fee", value: "$5" }]}
            total="$5"
            onConfirm={() => setStage("scanning")}
          />
        </Modal>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <p className="mb-4 text-sm font-semibold text-gray-800">{fileName || "Crown Med Hosp..."}</p>
            <BillPreview />
          </div>
        </div>
      )}
    </div>
  );
}
