import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface PinModalActions {
  open: (opts?: { recoveryPending?: boolean }) => void;
  close: () => void;
}

export default function PinModal(props: {
  ref: (actions: PinModalActions) => void;
}) {
  const [visible, setVisible] = createSignal(false);
  const [pinError, setPinError] = createSignal("");
  const [pinSubmitting, setPinSubmitting] = createSignal(false);
  const [pinFilled, setPinFilled] = createSignal([
    false, false, false, false, false, false,
  ]);
  const [pinShake, setPinShake] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [recoveryPending, setRecoveryPending] = createSignal(false);
  const pinInputRefs: (HTMLInputElement | undefined)[] = [];

  function clearPinInputs() {
    for (let i = 0; i < 6; i++) {
      const el = pinInputRefs[i];
      if (el) el.value = "";
    }
    setPinFilled([false, false, false, false, false, false]);
  }

  function readPinFromRefs(): string {
    return pinInputRefs.map((r) => r?.value ?? "").join("");
  }

  function triggerDigitPop(index: number) {
    const el = pinInputRefs[index];
    if (el) {
      el.classList.remove("animate-pin-digit-pop");
      void el.offsetWidth;
      el.classList.add("animate-pin-digit-pop");
    }
  }

  function handleDigitInput(index: number, value: string) {
    if (pinSubmitting()) return;
    const digit = value.replace(/\D/g, "").slice(-1);
    const el = pinInputRefs[index];
    if (el) el.value = digit;

    const filled = [...pinFilled()];
    filled[index] = digit !== "";
    setPinFilled(filled);

    if (digit) {
      triggerDigitPop(index);
      if (index < 5) {
        pinInputRefs[index + 1]?.focus();
      }
      if (filled.every(Boolean)) {
        handlePinSubmit();
      }
    }
  }

  function handleDigitKeyDown(index: number, e: KeyboardEvent) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const el = pinInputRefs[index];
      if (el && el.value === "" && index > 0) {
        const prev = pinInputRefs[index - 1];
        if (prev) prev.value = "";
        const filled = [...pinFilled()];
        filled[index - 1] = false;
        setPinFilled(filled);
        prev?.focus();
      } else if (el) {
        el.value = "";
        const filled = [...pinFilled()];
        filled[index] = false;
        setPinFilled(filled);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      pinInputRefs[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      pinInputRefs[index + 1]?.focus();
    }
  }

  function handleDigitPaste(e: ClipboardEvent) {
    e.preventDefault();
    if (pinSubmitting()) return;
    const pasted = (e.clipboardData?.getData("text") ?? "")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    const filled = [...pinFilled()];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      const el = pinInputRefs[i];
      if (el) el.value = pasted[i];
      filled[i] = true;
      triggerDigitPop(i);
    }
    setPinFilled(filled);
    const focusIdx = Math.min(pasted.length, 5);
    pinInputRefs[focusIdx]?.focus();
    if (filled.every(Boolean)) {
      handlePinSubmit();
    }
  }

  async function handlePinSubmit() {
    if (pinSubmitting()) return;
    const pin = readPinFromRefs();
    clearPinInputs();

    if (pin.length !== 6) {
      setPinError("Please enter all 6 digits.");
      setPinShake(true);
      setTimeout(() => setPinShake(false), 500);
      return;
    }

    setPinError("");
    setPinSubmitting(true);

    try {
      await invoke("verify_pin", { pin });
      setVisible(false);
      setPinSubmitting(false);
      if (recoveryPending()) {
        setRecoveryPending(false);
        invoke("recover_session", { encrypt: false }).catch((e) => {
          console.error("Recovery decryption failed:", e);
        });
      } else {
        invoke("decrypt_session").catch((e) => {
          console.error("Decryption failed:", e);
        });
      }
    } catch (e) {
      const msg = typeof e === "string" ? e : "Invalid PIN. Please try again.";
      setPinError(msg);
      setPinShake(true);
      setTimeout(() => setPinShake(false), 500);
      setTimeout(() => pinInputRefs[0]?.focus(), 50);
      setPinSubmitting(false);
    }
  }

  function close() {
    clearPinInputs();
    setPinError("");
    setPinSubmitting(false);
    setPinShake(false);
    setVisible(false);
    setRecoveryPending(false);
  }

  function open(opts?: { recoveryPending?: boolean }) {
    setPinError("");
    clearPinInputs();
    if (opts?.recoveryPending) {
      setRecoveryPending(true);
    }
    setVisible(true);
    setTimeout(() => pinInputRefs[0]?.focus(), 100);
  }

  props.ref({ open, close });

  return (
    <Show when={visible()}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center animate-pin-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget && !pinSubmitting()) close();
        }}
      >
        <div class="animate-pin-modal flex flex-col items-center gap-y-5 bg-annex-background border border-white/8 rounded-xl px-10 py-9 shadow-2xl w-104">
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 class="text-lg font-mono font-semibold text-white">
              Enter your PIN
            </h2>
            <p class="text-sm text-annex-dark-gray text-center leading-relaxed">
              Enter your 6-digit PIN to decrypt
              <br />
              and end the session.
            </p>
          </div>

          <div
            class={`flex gap-x-2.5 ${
              pinShake() ? "animate-pin-shake" : ""
            }`}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                ref={(el) => (pinInputRefs[i] = el)}
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxLength={1}
                onInput={(e) => handleDigitInput(i, e.currentTarget.value)}
                onKeyDown={(e) => handleDigitKeyDown(i, e)}
                onPaste={handleDigitPaste}
                onFocus={() => setActiveIndex(i)}
                onBlur={() => setActiveIndex(-1)}
                disabled={pinSubmitting()}
                class={`w-13 h-15 text-center text-2xl font-mono font-bold rounded-lg outline-none transition-all duration-150 ease-out border caret-transparent select-none text-white ${
                  pinSubmitting()
                    ? "bg-annex-dark-green/20 border-annex-light-green/40 text-annex-light-green"
                    : activeIndex() === i
                    ? "bg-white/8 border-annex-purple shadow-[0_0_0_1px_rgba(177,37,255,0.3)]"
                    : pinFilled()[i]
                    ? "bg-white/8 border-white/15"
                    : "bg-white/4 border-white/8"
                }`}
                style={{
                  animation: `pin-digit-in 250ms cubic-bezier(0.16, 1, 0.3, 1) ${
                    60 + i * 30
                  }ms both`,
                }}
              />
            ))}
          </div>

          <div class="h-5 flex items-center justify-center">
            <Show when={pinError()}>
              <p class="text-red-400 text-sm text-center animate-pin-error-in">
                {pinError()}
              </p>
            </Show>
            <Show when={pinSubmitting() && !pinError()}>
              <p class="text-annex-dark-gray text-sm animate-pin-error-in">
                Verifying...
              </p>
            </Show>
          </div>

          <button
            onClick={close}
            disabled={pinSubmitting()}
            class="text-sm text-annex-dark-gray hover:text-white transition-colors duration-150 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </Show>
  );
}
