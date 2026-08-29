import type { Metadata } from "next";
import Logo from "@/components/Logo";
import AuthPanel from "@/components/auth/AuthPanel";
import WelcomeRedirect from "@/components/auth/WelcomeRedirect";

export const metadata: Metadata = {
  title: "BillFixr - Welcome",
};

export default function WelcomePage() {
  return (
    <main className="flex min-h-screen items-stretch justify-center gap-16 p-6 lg:p-10">
      <div className="flex w-full max-w-md flex-col justify-center">
        <Logo />

        <h1 className="mt-16 text-3xl font-semibold text-gray-900">Confirming your account</h1>

        <WelcomeRedirect />
      </div>

      <AuthPanel />
    </main>
  );
}
