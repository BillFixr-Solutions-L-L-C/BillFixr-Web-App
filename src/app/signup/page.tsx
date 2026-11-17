import type { Metadata } from "next";
import Logo from "@/components/Logo";
import AuthPanel from "@/components/auth/AuthPanel";
import SignUpForm from "@/components/auth/SignUpForm";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "BillFixr - Sign Up",
};

export default async function SignUpPage() {
  const t = await getT();
  return (
    <main className="flex min-h-screen items-stretch justify-center gap-16 p-6 lg:p-10">
      <div className="flex w-full max-w-md flex-col justify-center">
        <Logo />

        <h1 className="mt-16 text-3xl font-semibold text-gray-900">{t("auth.getStarted")}</h1>

        <SignUpForm />
      </div>

      <AuthPanel />
    </main>
  );
}
