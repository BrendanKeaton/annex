"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { LogoutButton } from "@/components/logout-button";
import { PinInput, type PinInputHandle } from "@/components/pin-input";
import { RecoveryCodesDisplay } from "@/components/recovery-codes-display";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface ProfileClientProps {
  email: string;
  provider: string;
  isOAuthUser: boolean;
}

export function ProfileClient({
  email,
  provider,
  isOAuthUser,
}: ProfileClientProps) {
  const router = useRouter();

  // Change password state
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwPin, setPwPin] = useState("");
  const [pwPinShake, setPwPinShake] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const pwPinRef = useRef<PinInputHandle>(null);

  // Change email state
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPin, setEmailPin] = useState("");
  const [emailPinShake, setEmailPinShake] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const emailPinRef = useRef<PinInputHandle>(null);

  // PIN reset state
  const [pinResetOpen, setPinResetOpen] = useState(false);
  const [pinStage, setPinStage] = useState<"current" | "new" | "confirm">(
    "current",
  );
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinShake, setPinShake] = useState(false);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const pinRef = useRef<PinInputHandle>(null);

  // Recovery codes state
  const [codesOpen, setCodesOpen] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");

    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword.length > 128) {
      setPwError("Password must be at most 128 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }
    if (pwPin.length !== 6) {
      setPwError("Please enter your 6-digit PIN.");
      return;
    }

    setPwSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/account/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ new_password: newPassword, pin: pwPin }),
      });

      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (res.status === 403) {
        setPwError("Invalid PIN.");
        setPwPinShake(true);
        setTimeout(() => setPwPinShake(false), 500);
        setPwPin("");
        pwPinRef.current?.clear();
        setTimeout(() => pwPinRef.current?.focus(), 50);
        return;
      }
      if (res.status === 429) {
        setPwError("Too many attempts, please try again later.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update password");
      }

      setPwSuccess(true);
      setPwOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      setPwPin("");
      pwPinRef.current?.clear();
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setPwSubmitting(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");

    if (!newEmail.trim() || newEmail.length > 320) {
      setEmailError("Please enter a valid email (max 320 characters).");
      return;
    }
    if (emailPin.length !== 6) {
      setEmailError("Please enter your 6-digit PIN.");
      return;
    }

    setEmailSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/account/email`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ new_email: newEmail.trim(), pin: emailPin }),
      });

      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (res.status === 403) {
        setEmailError("Invalid PIN.");
        setEmailPinShake(true);
        setTimeout(() => setEmailPinShake(false), 500);
        setEmailPin("");
        emailPinRef.current?.clear();
        setTimeout(() => emailPinRef.current?.focus(), 50);
        return;
      }
      if (res.status === 429) {
        setEmailError("Too many attempts, please try again later.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update email");
      }

      setEmailSuccess(true);
      setEmailOpen(false);
      setNewEmail("");
      setEmailPin("");
      emailPinRef.current?.clear();
      setTimeout(() => setEmailSuccess(false), 5000);
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setEmailSubmitting(false);
    }
  }

  function handlePinComplete(pin: string) {
    if (pinStage === "current") {
      setCurrentPin(pin);
      setPinStage("new");
      setPinError("");
      setTimeout(() => {
        pinRef.current?.clear();
        pinRef.current?.focus();
      }, 50);
    } else if (pinStage === "new") {
      setNewPin(pin);
      setPinStage("confirm");
      setPinError("");
      setTimeout(() => {
        pinRef.current?.clear();
        pinRef.current?.focus();
      }, 50);
    } else if (pinStage === "confirm") {
      if (pin !== newPin) {
        setPinError("PINs do not match. Try again.");
        setPinShake(true);
        setTimeout(() => setPinShake(false), 500);
        pinRef.current?.clear();
        setTimeout(() => pinRef.current?.focus(), 50);
        return;
      }
      submitPinReset(currentPin, newPin);
    }
  }

  async function submitPinReset(oldPin: string, pin: string) {
    setPinSubmitting(true);
    setPinError("");
    try {
      await apiFetch("/auth/pin", {
        method: "PUT",
        body: JSON.stringify({ current_pin: oldPin, new_pin: pin }),
      });
      setPinSuccess(true);
      setPinResetOpen(false);
      setTimeout(() => setPinSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset PIN";
      setPinError(msg);
      setPinShake(true);
      setTimeout(() => setPinShake(false), 500);
      if (msg.toLowerCase().includes("invalid pin")) {
        setPinStage("current");
      } else {
        setPinStage("new");
      }
      pinRef.current?.clear();
      setTimeout(() => pinRef.current?.focus(), 50);
    } finally {
      setPinSubmitting(false);
    }
  }

  function resetPinFlow() {
    setPinStage("current");
    setCurrentPin("");
    setNewPin("");
    setPinError("");
    setPinSuccess(false);
    setPinResetOpen(true);
    setTimeout(() => pinRef.current?.focus(), 100);
  }

  async function handleViewCodes() {
    if (codesOpen && codes.length > 0) {
      setCodesOpen(false);
      return;
    }
    setCodesLoading(true);
    setCodesError("");
    try {
      const data = await apiFetch<{ recovery_codes: string[] }>(
        "/auth/recovery_codes",
      );
      setCodes(data.recovery_codes);
      setCodesOpen(true);
    } catch (err: unknown) {
      setCodesError(
        err instanceof Error ? err.message : "Failed to load codes",
      );
    } finally {
      setCodesLoading(false);
    }
  }

  async function handleRegenerateCodes() {
    setRegenerating(true);
    setCodesError("");
    try {
      const data = await apiFetch<{ recovery_codes: string[] }>(
        "/auth/recovery_codes/regenerate",
        { method: "POST" },
      );
      setCodes(data.recovery_codes);
    } catch (err: unknown) {
      setCodesError(
        err instanceof Error ? err.message : "Failed to regenerate codes",
      );
    } finally {
      setRegenerating(false);
    }
  }

  const pinStageLabel = {
    current: "Enter your current PIN",
    new: "Enter your new PIN",
    confirm: "Confirm your new PIN",
  };

  return (
    <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
      <div className="w-full max-w-lg flex flex-col gap-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-mono font-semibold text-white">
            Profile
          </h1>
          <p className="text-sm text-annex-dark-gray mt-1">
            Manage your security settings and account details.
          </p>
        </div>

        {/* Account Info */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
            Account
          </h2>
          <div className="rounded-lg border border-white/8 bg-white/2 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-annex-dark-gray">Email</span>
              <span className="text-sm text-white font-mono">{email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-annex-dark-gray">
                Sign-in method
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm text-white font-mono capitalize">
                {provider === "google" && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    className="text-white/60"
                  >
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                {provider === "github" && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-white/60"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                )}
                {provider}
              </span>
            </div>

            {/* Change Email */}
            {!isOAuthUser && (
              <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Change email</p>
                    <p className="text-xs text-annex-dark-gray">
                      Update your account email address.
                    </p>
                  </div>
                  {!emailOpen && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEmailOpen(true);
                        setEmailError("");
                        setEmailSuccess(false);
                      }}
                    >
                      Change
                    </Button>
                  )}
                </div>

                {emailSuccess && (
                  <p className="text-xs text-annex-light-green animate-fadeIn">
                    Check your new email to confirm the change.
                  </p>
                )}

                {emailOpen && (
                  <form
                    onSubmit={handleChangeEmail}
                    className="flex flex-col gap-4 rounded-md border border-annex-purple/40 bg-annex-background-light p-4 animate-fadeIn"
                  >
                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="new-email"
                        className="text-xs text-annex-dark-gray"
                      >
                        New email
                      </Label>
                      <Input
                        id="new-email"
                        type="email"
                        placeholder="newemail@example.com"
                        required
                        maxLength={320}
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="h-9 text-sm rounded-md border-white/10 bg-white/5 text-white placeholder:text-annex-dark-gray"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <Label className="text-xs text-annex-dark-gray self-start">
                        Enter your PIN to confirm
                      </Label>
                      <PinInput
                        ref={emailPinRef}
                        onComplete={(pin) => setEmailPin(pin)}
                        disabled={emailSubmitting}
                        shake={emailPinShake}
                      />
                    </div>
                    {emailError && (
                      <p className="text-xs text-annex-light-red animate-fadeIn">
                        {emailError}
                      </p>
                    )}
                    <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEmailOpen(false);
                          setEmailError("");
                          setNewEmail("");
                          setEmailPin("");
                          emailPinRef.current?.clear();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={emailSubmitting || !newEmail.trim()}
                      >
                        {emailSubmitting ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Security */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
            Security
          </h2>
          <div className="rounded-lg border border-white/8 bg-white/2 p-5 flex flex-col gap-5">
            {/* Change Password */}
            {!isOAuthUser && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Password</p>
                    <p className="text-xs text-annex-dark-gray">
                      Change your account password.
                    </p>
                  </div>
                  {!pwOpen && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPwOpen(true);
                        setPwError("");
                        setPwSuccess(false);
                      }}
                    >
                      Change
                    </Button>
                  )}
                </div>

                {pwSuccess && (
                  <p className="text-xs text-annex-light-green animate-fadeIn">
                    Password updated successfully.
                  </p>
                )}

                {pwOpen && (
                  <form
                    onSubmit={handleChangePassword}
                    className="flex flex-col gap-4 rounded-md border border-annex-purple/40 bg-annex-background-light p-4 animate-fadeIn"
                  >
                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="new-password"
                        className="text-xs text-annex-dark-gray"
                      >
                        New password
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="At least 8 characters"
                        required
                        minLength={8}
                        maxLength={128}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-9 text-sm rounded-md border-white/10 bg-white/5 text-white"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="confirm-new-password"
                        className="text-xs text-annex-dark-gray"
                      >
                        Confirm password
                      </Label>
                      <Input
                        id="confirm-new-password"
                        type="password"
                        placeholder="Re-enter your password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-9 text-sm rounded-md border-white/10 bg-white/5 text-white"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <Label className="text-xs text-annex-dark-gray self-start">
                        Enter your PIN to confirm
                      </Label>
                      <PinInput
                        ref={pwPinRef}
                        onComplete={(pin) => setPwPin(pin)}
                        disabled={pwSubmitting}
                        shake={pwPinShake}
                      />
                    </div>
                    {pwError && (
                      <p className="text-xs text-annex-light-red animate-fadeIn">
                        {pwError}
                      </p>
                    )}
                    <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPwOpen(false);
                          setPwError("");
                          setNewPassword("");
                          setConfirmPassword("");
                          setPwPin("");
                          pwPinRef.current?.clear();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={pwSubmitting}>
                        {pwSubmitting ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* PIN */}
            <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">PIN</p>
                  <p className="text-xs text-annex-dark-gray">
                    Used to decrypt files on the desktop app.
                  </p>
                </div>
                {!pinResetOpen && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={resetPinFlow}
                  >
                    Reset
                  </Button>
                )}
              </div>

              {pinSuccess && (
                <p className="text-xs text-annex-light-green animate-fadeIn">
                  PIN updated successfully.
                </p>
              )}

              {pinResetOpen && (
                <div className="flex flex-col items-center gap-4 rounded-md border border-annex-purple/40 bg-annex-background-light p-4 animate-fadeIn">
                  <p className="text-sm text-white self-start">
                    {pinStageLabel[pinStage]}
                  </p>
                  <PinInput
                    ref={pinRef}
                    onComplete={handlePinComplete}
                    disabled={pinSubmitting}
                    shake={pinShake}
                  />
                  {pinError && (
                    <p className="text-xs text-annex-light-red animate-pin-error-in">
                      {pinError}
                    </p>
                  )}
                  <div className="flex justify-end w-full pt-2 border-t border-white/5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPinResetOpen(false);
                        setPinError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Recovery */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
            Recovery
          </h2>
          <div className="rounded-lg border border-white/8 bg-white/2 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Recovery codes</p>
                <p className="text-xs text-annex-dark-gray">
                  Use these with support attempt encryption key recovery.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleViewCodes}
                disabled={codesLoading}
              >
                {codesLoading ? "Loading..." : codesOpen ? "Hide" : "View"}
              </Button>
            </div>

            {codesError && (
              <p className="text-xs text-annex-light-red animate-fadeIn">
                {codesError}
              </p>
            )}

            {codesOpen && codes.length > 0 && (
              <div className="animate-fadeIn flex flex-col gap-3">
                <RecoveryCodesDisplay codes={codes} />
                {!confirmRegenerate ? (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRegenerate(true)}
                      disabled={regenerating}
                      className="text-annex-dark-gray hover:text-annex-light-red"
                    >
                      Regenerate codes
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 animate-fadeIn rounded-md border border-annex-light-red/30 bg-annex-light-red/5 p-4">
                    <p className="text-sm text-annex-light-red font-medium">
                      Are you sure?
                    </p>
                    <p className="text-xs text-annex-dark-gray leading-relaxed">
                      Regenerating your recovery codes will invalidate your
                      current codes. Any active sessions encrypted with keys
                      derived from your current codes will become impossible to
                      recover if decryption fails.
                    </p>
                    <div className="flex gap-2 justify-end pt-2 border-t border-annex-light-red/15">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRegenerate(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          await handleRegenerateCodes();
                          setConfirmRegenerate(false);
                        }}
                        disabled={regenerating}
                      >
                        {regenerating ? "Regenerating..." : "Regenerate"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Sign Out */}
        <section className="flex flex-col gap-3 pb-8">
          <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
            Session
          </h2>
          <div className="rounded-lg border border-white/8 bg-white/2 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Sign out</p>
              <p className="text-xs text-annex-dark-gray">
                End your current session.
              </p>
            </div>
            <LogoutButton />
          </div>
        </section>
      </div>
    </div>
  );
}
