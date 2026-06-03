"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
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
            Reset password
          </h1>
          <p className="mt-2 text-sm text-annex-dark-gray">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {success ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 rounded-md border border-annex-border-light/30 bg-annex-background-light p-4">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-annex-white">
                  Check your email
                </p>
                <p className="mt-1 text-xs text-annex-dark-gray">
                  If an account exists with that email, you&apos;ll receive a
                  password reset link.
                </p>
              </div>
            </div>

            <p className="text-center text-sm text-annex-dark-gray">
              Back to{" "}
              <Link
                href="/"
                className="text-annex-white underline underline-offset-4"
              >
                Login
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-sm text-annex-dark-gray">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                required
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white placeholder:text-annex-light-gray"
              />
            </div>

            {error && <p className="text-sm text-annex-light-red">{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? "Sending..." : "Send reset email"}
            </button>

            <p className="text-center text-sm text-annex-dark-gray">
              Back to{" "}
              <Link
                href="/"
                className="text-annex-white underline underline-offset-4"
              >
                Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
