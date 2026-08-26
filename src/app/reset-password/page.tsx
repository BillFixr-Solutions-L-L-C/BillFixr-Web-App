import type { Metadata } from "next";
import Logo from "@/components/Logo";
import AuthPanel from "@/components/auth/AuthPanel";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "BillFixr - Set New Password",
};

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-stretch justify-center gap-16 p-6 lg:p-10">
      <div className="flex w-full max-w-md flex-col justify-center">
        <Logo />

        <h1 className="mt-16 text-3xl font-semibold text-gray-900">Set a new password</h1>

        <ResetPasswordForm />
      </div>

      <AuthPanel />
    </main>
  );
}
