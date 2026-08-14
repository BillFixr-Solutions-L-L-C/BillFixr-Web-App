import Link from "next/link";
import Logo from "@/components/Logo";
import AuthPanel from "@/components/auth/AuthPanel";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-stretch gap-10 p-6 lg:p-10">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center lg:mx-0">
        <Logo />

        <h1 className="mt-16 text-3xl font-semibold text-gray-900">Welcome Back</h1>

        <form className="mt-8 flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            className="rounded-full border border-gray-200 px-5 py-3.5 text-sm focus:border-primary-400 focus:outline-none"
          />

          <Link href="#" className="text-sm text-gray-500 hover:text-gray-700">
            Forget Password
          </Link>

          <button
            type="submit"
            className="mt-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Log in
          </button>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-accent-600">
              Sign up
            </Link>
          </p>
        </form>
      </div>

      <AuthPanel />
    </main>
  );
}
