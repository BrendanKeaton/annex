"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { PinInput, type PinInputHandle } from "@/components/pin-input";

export default function OnboardingStep2() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [savedPin, setSavedPin] = useState("");
  const [pinFilled, setPinFilled] = useState(false);
  const [confirmFilled, setConfirmFilled] = useState(false);
  const [confirmPinValue, setConfirmPinValue] = useState("");

  const enterRef = useRef<PinInputHandle>(null);
  const confirmRef = useRef<PinInputHandle>(null);
  const router = useRouter();

  useEffect(() => {
    enterRef.current?.focus();
  }, []);

  function handleEnterComplete(pin: string) {
    setSavedPin(pin);
    setPinFilled(true);
  }

  function handleConfirmComplete(pin: string) {
    setConfirmFilled(true);
    setConfirmPinValue(pin);
  }

  function handleContinue() {
    if (!pinFilled) return;
    setStage("confirm");
    setError("");
    setConfirmFilled(false);
    setTimeout(() => {
      confirmRef.current?.clear();
      confirmRef.current?.focus();
    }, 50);
  }

  async function handleSubmit() {
    if (confirmPinValue !== savedPin) {
      setError("PINs do not match. Try again.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      confirmRef.current?.clear();
      setConfirmFilled(false);
      setConfirmPinValue("");
      setTimeout(() => confirmRef.current?.focus(), 50);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/auth/onboarding/pin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: savedPin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to set PIN");
      }

      await supabase.auth.refreshSession();
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      confirmRef.current?.clear();
      setStage("confirm");
      setConfirmFilled(false);
      setTimeout(() => confirmRef.current?.focus(), 50);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    setStage("enter");
    setError("");
    setConfirmFilled(false);
    setTimeout(() => enterRef.current?.focus(), 50);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 sm:px-16 lg:px-24">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col gap-y-2">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/8 flex items-center justify-center mb-1">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-annex-dark-gray"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-lg font-mono font-semibold text-white">
            {stage === "enter" ? "Set your PIN" : "Confirm your PIN"}
          </h1>
          <p className="text-sm text-annex-dark-gray leading-relaxed">
            {stage === "enter"
              ? "Your PIN is used to decrypt files on the desktop app. Choose a 6-digit PIN you'll remember."
              : "Re-enter your 6-digit PIN to confirm."}
          </p>
          {stage === "enter" && (
            <p className="text-xs text-annex-dark-gray/60">
              You can change your PIN at any time from the web app.
            </p>
          )}
        </div>

        {stage === "enter" ? (
          <PinInput
            ref={enterRef}
            onComplete={handleEnterComplete}
            disabled={isSubmitting}
            shake={false}
          />
        ) : (
          <PinInput
            ref={confirmRef}
            onComplete={handleConfirmComplete}
            disabled={isSubmitting}
            shake={shake}
          />
        )}

        <div className="h-5 flex items-center justify-center">
          {error && (
            <p className="text-annex-light-red text-sm animate-pin-error-in">
              {error}
            </p>
          )}
          {isSubmitting && !error && (
            <p className="text-annex-dark-gray text-sm animate-pin-error-in">
              Setting PIN...
            </p>
          )}
        </div>

        {stage === "enter" && pinFilled && (
          <button
            onClick={handleContinue}
            className="w-full py-2.5 rounded-lg bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 cursor-pointer"
          >
            Continue
          </button>
        )}

        {stage === "confirm" && !isSubmitting && (
          <div className="flex flex-col items-center gap-3 w-full">
            {confirmFilled && (
              <button
                onClick={handleSubmit}
                className="w-full py-2.5 rounded-lg bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 cursor-pointer"
              >
                Set PIN
              </button>
            )}
            <button
              onClick={handleBack}
              className="text-sm text-annex-dark-gray hover:text-white transition-colors duration-150 cursor-pointer"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
