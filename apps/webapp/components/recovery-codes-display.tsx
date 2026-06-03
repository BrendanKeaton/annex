"use client";

import { useState } from "react";

interface RecoveryCodesDisplayProps {
  codes: string[];
}

export function RecoveryCodesDisplay({ codes }: RecoveryCodesDisplayProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const csv = "recovery_code\n" + codes.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annex-recovery-codes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full rounded-lg border border-white/10 bg-white/4 p-5 flex flex-col gap-2.5">
        {codes.map((code, i) => (
          <div
            key={i}
            className="text-center text-xl font-mono font-bold text-white tracking-widest"
            style={{
              animation: `pin-digit-in 250ms cubic-bezier(0.16, 1, 0.3, 1) ${60 + i * 50}ms both`,
            }}
          >
            {code}
          </div>
        ))}
      </div>

      <button
        onClick={handleCopy}
        className="flex items-center gap-2 text-sm text-annex-dark-gray hover:text-white transition-colors duration-150 cursor-pointer"
        title="Copy codes"
      >
        {copied ? (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-annex-dark-green"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy codes
          </>
        )}
      </button>

      <button
        onClick={handleDownload}
        className="flex items-center gap-2 text-sm text-annex-dark-gray hover:text-white transition-colors duration-150 cursor-pointer"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download as .csv
      </button>
    </div>
  );
}
