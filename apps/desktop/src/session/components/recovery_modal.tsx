import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export default function RecoveryModal(props: {
  onDismiss: () => void;
  onDecryptRecovery: () => void;
}) {
  const [submitting, setSubmitting] = createSignal<"encrypt" | "decrypt" | null>(null);
  const [error, setError] = createSignal("");

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center animate-pin-backdrop">
      <div class="animate-pin-modal flex flex-col items-center gap-y-5 bg-annex-background border border-white/8 rounded-xl px-10 py-9 shadow-2xl w-md">
        <div class="flex flex-col items-center gap-y-2">
          <div class="w-10 h-10 rounded-full bg-white/5 border border-white/8 flex items-center justify-center mb-1">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-annex-dark-gray"
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
          </div>
          <h2 class="text-lg font-mono font-semibold text-white">
            Session Interrupted
          </h2>
          <p class="text-sm text-annex-dark-gray text-center leading-relaxed">
            Your previous session didn't finish processing.
            <br />
            Choose how to proceed.
          </p>
        </div>

        <div class="flex flex-col gap-y-3 w-full">
          <button
            disabled={submitting() !== null}
            onClick={async () => {
              setError("");
              setSubmitting("encrypt");
              try {
                await invoke("recover_session", { encrypt: true });
                props.onDismiss();
                setSubmitting(null);
              } catch (e) {
                setError(
                  typeof e === "string"
                    ? e
                    : "Recovery failed. Please try again."
                );
                setSubmitting(null);
              }
            }}
            class={`group flex items-start gap-x-4 w-full p-4 rounded-lg border transition-all duration-200 text-left cursor-pointer ${
              submitting() === "encrypt"
                ? "bg-annex-dark-green/20 border-annex-light-green/30"
                : submitting() !== null
                ? "opacity-40 cursor-not-allowed"
                : "bg-white/4 border-white/8 hover:border-white/15 hover:bg-white/6"
            }`}
            style={{
              animation:
                "recovery-card-in 300ms cubic-bezier(0.16, 1, 0.3, 1) 100ms both",
            }}
          >
            <div class="w-9 h-9 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0 mt-0.5">
              {submitting() === "encrypt" ? (
                <svg
                  class="w-4 h-4 text-annex-light-green animate-spin-moderate"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-annex-dark-gray group-hover:text-white transition-colors duration-200"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </div>
            <div class="flex flex-col gap-y-1">
              <span class="text-sm font-mono font-semibold text-white">
                Complete Encryption
              </span>
              <span class="text-xs text-annex-dark-gray leading-relaxed">
                Encrypt remaining files and secure your session.
              </span>
            </div>
          </button>

          <button
            disabled={submitting() !== null}
            onClick={() => {
              setError("");
              props.onDismiss();
              props.onDecryptRecovery();
            }}
            class={`group flex items-start gap-x-4 w-full p-4 rounded-lg border transition-all duration-200 text-left cursor-pointer ${
              submitting() !== null
                ? "opacity-40 cursor-not-allowed"
                : "bg-white/4 border-white/8 hover:border-white/15 hover:bg-white/6"
            }`}
            style={{
              animation:
                "recovery-card-in 300ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both",
            }}
          >
            <div class="w-9 h-9 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0 mt-0.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-annex-dark-gray group-hover:text-white transition-colors duration-200"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 4.33 2.5" />
              </svg>
            </div>
            <div class="flex flex-col gap-y-1">
              <span class="text-sm font-mono font-semibold text-white">
                Restore & Decrypt
              </span>
              <span class="text-xs text-annex-dark-gray leading-relaxed">
                Remove encrypted files and restore to original state.
              </span>
            </div>
          </button>
        </div>

        <Show when={error()}>
          <p class="text-red-400 text-sm text-center animate-pin-error-in">
            {error()}
          </p>
        </Show>
      </div>
    </div>
  );
}
