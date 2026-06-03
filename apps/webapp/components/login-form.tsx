"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/portal");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/portal`,
      },
    });
    if (error) {
      setError(error.message);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-8 py-12 sm:px-16 lg:px-24",
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-semibold text-annex-white font-mono">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-annex-dark-gray">
            Sign in to your account
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex items-center justify-center gap-3 w-full rounded-md border border-annex-border-light/30 bg-transparent py-3 text-sm text-annex-white hover:bg-annex-background-light transition-colors"
          >
            <Image
              src="/company_icons/google_icon.png"
              width={20}
              height={20}
              alt="Google"
            />
            Continue with Google
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-annex-border-light/30" />
          <span className="text-sm text-annex-dark-gray">or</span>
          <div className="flex-1 border-t border-annex-border-light/30" />
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-sm text-annex-dark-gray">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white placeholder:text-annex-light-gray"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className="text-sm text-annex-dark-gray"
              >
                Password
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-annex-light-purple hover:underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white"
            />
          </div>

          {error && <p className="text-sm text-annex-light-red">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm text-annex-dark-gray">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/sign-up"
              className="text-annex-white underline underline-offset-4"
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
