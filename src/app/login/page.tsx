import type { Metadata } from "next";
import Logo from "@/components/Logo";
import AuthPanel from "@/components/auth/AuthPanel";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "BillFixr - Login",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-stretch justify-center gap-16 p-6 lg:p-10">
      <div className="flex w-full max-w-md flex-col justify-center">
        <Logo />

        <h1 className="mt-16 text-3xl font-semibold text-gray-900">Welcome Back</h1>

        <LoginForm />
      </div>

      <AuthPanel />
    </main>
  );
}
