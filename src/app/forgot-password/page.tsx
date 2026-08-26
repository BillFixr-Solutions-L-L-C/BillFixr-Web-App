import type { Metadata } from "next";
import Logo from "@/components/Logo";
import AuthPanel from "@/components/auth/AuthPanel";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "BillFixr - Reset Password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-stretch justify-center gap-16 p-6 lg:p-10">
      <div className="flex w-full max-w-md flex-col justify-center">
        <Logo />

        <h1 className="mt-16 text-3xl font-semibold text-gray-900">Reset your password</h1>

        <ForgotPasswordForm />
      </div>

      <AuthPanel />
    </main>
  );
}
