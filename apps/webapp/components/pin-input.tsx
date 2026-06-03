"use client";

import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from "react";

export interface PinInputHandle {
  clear: () => void;
  focus: () => void;
}

interface PinInputProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  shake?: boolean;
}

export const PinInput = forwardRef<PinInputHandle, PinInputProps>(
  function PinInput({ onComplete, disabled = false, shake = false }, ref) {
    const [filled, setFilled] = useState([false, false, false, false, false, false]);
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const readPin = useCallback(
      () => inputRefs.current.map((r) => r?.value ?? "").join(""),
      []
    );

    useImperativeHandle(ref, () => ({
      clear() {
        inputRefs.current.forEach((el) => {
          if (el) el.value = "";
        });
        setFilled([false, false, false, false, false, false]);
      },
      focus() {
        inputRefs.current[0]?.focus();
      },
    }));

    function triggerPop(el: HTMLInputElement | null) {
      if (!el) return;
      el.classList.remove("animate-pin-digit-pop");
      void el.offsetWidth;
      el.classList.add("animate-pin-digit-pop");
    }

    function handleDigitInput(index: number, value: string) {
      if (disabled) return;
      const digit = value.replace(/\D/g, "").slice(-1);
      const el = inputRefs.current[index];
      if (el) el.value = digit;

      const next = [...filled];
      next[index] = digit !== "";
      setFilled(next);

      if (digit) {
        triggerPop(el);
        if (index < 5) {
          inputRefs.current[index + 1]?.focus();
        }
        if (next.every(Boolean)) {
          onComplete(readPin());
        }
      }
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent) {
      if (e.key === "Backspace") {
        e.preventDefault();
        const el = inputRefs.current[index];
        if (el && el.value === "" && index > 0) {
          const prev = inputRefs.current[index - 1];
          if (prev) prev.value = "";
          const next = [...filled];
          next[index - 1] = false;
          setFilled(next);
          prev?.focus();
        } else if (el) {
          el.value = "";
          const next = [...filled];
          next[index] = false;
          setFilled(next);
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }

    function handlePaste(e: React.ClipboardEvent) {
      e.preventDefault();
      if (disabled) return;
      const pasted = (e.clipboardData?.getData("text") ?? "")
        .replace(/\D/g, "")
        .slice(0, 6);
      if (!pasted) return;
      const next = [false, false, false, false, false, false];
      for (let i = 0; i < pasted.length && i < 6; i++) {
        const el = inputRefs.current[i];
        if (el) el.value = pasted[i];
        next[i] = true;
        triggerPop(el);
      }
      setFilled(next);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      if (next.every(Boolean)) {
        onComplete(inputRefs.current.map((r) => r?.value ?? "").join(""));
      }
    }

    return (
      <div className={`flex gap-x-2.5 ${shake ? "animate-pin-shake" : ""}`}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            onInput={(e) =>
              handleDigitInput(i, (e.target as HTMLInputElement).value)
            }
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(e)}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex(-1)}
            disabled={disabled}
            className={`w-13 h-15 text-center text-2xl font-mono font-bold rounded-lg outline-none transition-all duration-150 ease-out border caret-transparent select-none text-white ${
              disabled
                ? "bg-annex-dark-green/20 border-annex-light-green/40 text-annex-light-green"
                : activeIndex === i
                  ? "bg-white/8 border-annex-purple shadow-[0_0_0_1px_rgba(177,37,255,0.3)]"
                  : filled[i]
                    ? "bg-white/8 border-white/15"
                    : "bg-white/4 border-white/8"
            }`}
            style={{
              animation: `pin-digit-in 250ms cubic-bezier(0.16, 1, 0.3, 1) ${60 + i * 30}ms both`,
            }}
          />
        ))}
      </div>
    );
  }
);
