import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../../context/app_state";

export default function DeletionBlockedModal() {
  const [appState] = useAppState();
  const [confirmingSkip, setConfirmingSkip] = createSignal(false);

  async function handleRetry() {
    try {
      await invoke("retry_secure_deletion");
    } catch (e) {
      console.error("Failed to signal retry:", e);
    }
  }

  async function handleSkip() {
    try {
      await invoke("skip_secure_deletion");
    } catch (e) {
      console.error("Failed to signal skip:", e);
    } finally {
      setConfirmingSkip(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center animate-pin-backdrop">
      <div class="animate-pin-modal flex flex-col items-center gap-y-5 bg-annex-background border border-white/8 rounded-xl px-10 py-9 shadow-2xl w-104">
        <div class="flex flex-col items-center gap-y-2">
          <div class="w-10 h-10 rounded-full bg-annex-dark-yellow/30 border border-annex-light-yellow/20 flex items-center justify-center mb-1">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-annex-light-yellow"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 class="text-lg font-mono font-semibold text-white">
            File Access Blocked
          </h2>
          <p class="text-sm text-annex-dark-gray text-center leading-relaxed">
            A file could not be securely deleted.
            <br />
            It may be open in another application.
          </p>
        </div>

        <div class="w-full bg-white/4 border border-white/8 rounded-lg px-4 py-3">
          <p class="text-xs text-annex-dark-gray mb-1">File path</p>
          <p class="text-sm text-white font-mono break-all leading-relaxed">
            {appState.deletion_blocked_file ?? "Unknown file"}
          </p>
        </div>

        <Show when={appState.info_text}>
          <p class="text-red-400 text-xs text-center animate-pin-error-in break-all max-w-full">
            {appState.info_text}
          </p>
        </Show>

        <Show
          when={!confirmingSkip()}
          fallback={
            <div class="flex flex-col gap-y-3 w-full">
              <div class="bg-annex-dark-red/30 border border-annex-light-red/30 rounded-md px-4 py-3">
                <p class="text-annex-light-red text-xs font-semibold mb-1">
                  Warning: skipping leaves this file unprotected
                </p>
                <p class="text-annex-light-red/80 text-xs leading-relaxed">
                  The original will remain on disk in plaintext and will be
                  visible to local AI agents. The encrypted copy will also
                  remain. You can manually delete it later, but the session
                  will continue without protecting this file.
                </p>
              </div>
              <div class="flex flex-row gap-x-3">
                <button
                  onClick={() => setConfirmingSkip(false)}
                  class="flex-1 py-3 rounded-md border font-semibold text-sm transition-all duration-300 bg-transparent border-annex-light-gray text-annex-light-gray hover:bg-white/5 cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={handleSkip}
                  class="flex-1 py-3 rounded-md border font-semibold text-sm transition-all duration-300 bg-annex-dark-red border-annex-light-red text-annex-light-red hover:opacity-80 cursor-pointer"
                >
                  Skip Anyway
                </button>
              </div>
            </div>
          }
        >
          <p class="text-xs text-annex-dark-gray text-center leading-relaxed">
            Please close the file and press Retry to continue.
            <br />
            The session cannot proceed until all originals are securely
            wiped.
          </p>

          <div class="flex flex-row gap-x-3 w-full">
            <button
              onClick={() => setConfirmingSkip(true)}
              class="flex-1 py-3 rounded-md border font-semibold text-sm transition-all duration-300 bg-transparent border-annex-light-gray text-annex-light-gray hover:bg-white/5 cursor-pointer"
            >
              Skip File
            </button>
            <button
              onClick={handleRetry}
              class="flex-1 py-3 rounded-md border font-semibold text-sm transition-all duration-300 bg-annex-dark-yellow border-annex-light-yellow text-annex-light-yellow hover:opacity-80 cursor-pointer"
            >
              Retry
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
