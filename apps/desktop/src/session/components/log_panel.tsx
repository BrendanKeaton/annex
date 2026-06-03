import { createSignal, createMemo, createEffect, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, type LogLevel } from "../../context/app_state";

function levelColor(level: LogLevel) {
  switch (level) {
    case "info":
      return "text-annex-light-green";
    case "warning":
      return "text-annex-light-yellow";
    case "error":
      return "text-annex-light-red";
  }
}

function levelTag(level: LogLevel) {
  switch (level) {
    case "info":
      return "INF";
    case "warning":
      return "WRN";
    case "error":
      return "ERR";
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return ts;
  }
}

export default function LogPanel() {
  const [appState] = useAppState();
  const [open, setOpen] = createSignal(false);
  const [showInfo, setShowInfo] = createSignal(false);
  const [showWarning, setShowWarning] = createSignal(true);
  const [showError, setShowError] = createSignal(true);
  let logEndRef: HTMLDivElement | undefined;

  const infoCount = createMemo(() => appState.logs.filter((e) => e.level === "info").length);
  const warningCount = createMemo(() => appState.logs.filter((e) => e.level === "warning").length);
  const errorCount = createMemo(() => appState.logs.filter((e) => e.level === "error").length);

  const filteredLogs = createMemo(() =>
    appState.logs.filter((entry) => {
      if (entry.level === "info" && !showInfo()) return false;
      if (entry.level === "warning" && !showWarning()) return false;
      if (entry.level === "error" && !showError()) return false;
      return true;
    })
  );

  createEffect(() => {
    filteredLogs();
    if (open() && logEndRef) {
      logEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  return (
    <div class="border-t border-white/8">
      <button
        onClick={() => setOpen(!open())}
        class="w-full flex items-center justify-between px-4 py-2 hover:bg-white/3 transition-colors duration-150 cursor-pointer"
      >
        <div class="flex items-center gap-x-2">
          <div class="w-1.5 h-1.5 rounded-full bg-annex-light-green" />
          <span class="font-mono text-xs text-annex-dark-gray">Logging</span>
          <Show when={appState.logs.length > 0}>
            <span class="font-mono text-xs text-annex-dark-gray/60">
              ({appState.logs.length})
            </span>
          </Show>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class={`text-annex-dark-gray transition-transform duration-200 ${
            open() ? "rotate-180" : ""
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        class="overflow-hidden transition-all duration-200 ease-out"
        style={{
          "max-height": open() ? "280px" : "0px",
          opacity: open() ? "1" : "0",
        }}
      >
        <div class="flex items-center gap-x-3 px-4 py-1.5 border-t border-white/5 bg-white/2">
          <button
            onClick={() => setShowInfo(!showInfo())}
            class={`font-mono text-xs cursor-pointer transition-all duration-150 ${
              showInfo()
                ? "text-annex-light-green"
                : "text-annex-light-green/30 line-through"
            }`}
          >
            INFO ({infoCount()})
          </button>
          <button
            onClick={() => setShowWarning(!showWarning())}
            class={`font-mono text-xs cursor-pointer transition-all duration-150 ${
              showWarning()
                ? "text-annex-light-yellow"
                : "text-annex-light-yellow/30 line-through"
            }`}
          >
            WARNING ({warningCount()})
          </button>
          <button
            onClick={() => setShowError(!showError())}
            class={`font-mono text-xs cursor-pointer transition-all duration-150 ${
              showError()
                ? "text-annex-light-red"
                : "text-annex-light-red/30 line-through"
            }`}
          >
            ERROR ({errorCount()})
          </button>
          <div class="flex-1" />
          <button
            onClick={() => invoke("clear_logs")}
            class="font-mono text-xs text-annex-dark-gray hover:text-annex-white transition-colors duration-150 cursor-pointer"
          >
            Clear
          </button>
        </div>

        <div
          class="overflow-y-auto px-4 py-2 bg-annex-black/60"
          style={{ "max-height": "220px" }}
        >
          <Show
            when={filteredLogs().length > 0}
            fallback={
              <p class="font-mono text-xs text-annex-dark-gray/50 py-2">
                No log entries.
              </p>
            }
          >
            <For each={filteredLogs()}>
              {(entry) => (
                <div class="flex gap-x-2 py-0.5 font-mono text-xs leading-relaxed">
                  <span class="text-annex-dark-gray/50 shrink-0">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span class={`shrink-0 ${levelColor(entry.level)}`}>
                    {levelTag(entry.level)}
                  </span>
                  <span class="text-annex-white/80">{entry.message}</span>
                </div>
              )}
            </For>
            <div ref={logEndRef} />
          </Show>
        </div>
      </div>
    </div>
  );
}
