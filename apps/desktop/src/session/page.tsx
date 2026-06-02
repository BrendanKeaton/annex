import {
  createSignal,
  createMemo,
  createEffect,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import ExternalLinkIcon from "../components/icons/external_link";
import ShieldSlashIcon from "../components/icons/shield_slash";
import ShieldCheckIcon from "../components/icons/shield_check";
import { useAppState } from "../context/app_state";
import {
  trayEndSessionPending,
  setTrayEndSessionPending,
} from "../tray_actions";
import { formatLastSession } from "./helper";
import SessionRing from "./components/session_ring";
import AnimatedCarets from "./components/animated_carets";
import LogPanel from "./components/log_panel";
import PinModal, { type PinModalActions } from "./components/pin_modal";
import RecoveryModal from "./components/recovery_modal";
import DeletionBlockedModal from "./components/deletion_blocked_modal";

function formatTimer(ms: number): string {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSecs = Math.floor(totalCs / 100);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60);
  const csStr = String(cs).padStart(2, "0");
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${
    csStr[0]
  }${csStr[1]}`;
}

export default function Session() {
  const [appState] = useAppState();

  const [timerMs, setTimerMs] = createSignal(0);
  let timerInterval: ReturnType<typeof setInterval> | undefined;
  let timerStartTime: number | undefined;

  const [now, setNow] = createSignal(Date.now());
  const refreshTimer = setInterval(() => setNow(Date.now()), 30_000);
  onCleanup(() => clearInterval(refreshTimer));

  createEffect(
    on(
      () => appState.protected_state,
      (state, prevState) => {
        if (
          (state === "in_process" && prevState !== "in_process") ||
          (state === "ending" && prevState !== "ending")
        ) {
          timerStartTime = Date.now();
          setTimerMs(0);
          clearInterval(timerInterval);
          timerInterval = setInterval(() => {
            if (timerStartTime) {
              setTimerMs(Date.now() - timerStartTime);
            }
          }, 10);
        } else if (state === "inactive" || state === "active") {
          clearInterval(timerInterval);
          timerInterval = undefined;
          timerStartTime = undefined;
          setTimerMs(0);
        }
      },
    ),
  );

  onCleanup(() => clearInterval(timerInterval));

  const headerText = createMemo(() => {
    switch (appState.protected_state) {
      case "in_process":
        return "Please Wait...";
      case "ending":
        return "Ending Session...";
      case "active":
        return "Session is Live";
      case "deletion_blocked":
        return "File Access Blocked";
      default:
        return "Start a Session";
    }
  });

  const totalFiles = createMemo(() => appState.protected_paths.length);
  const filesProcessed = createMemo(() => appState.session_files_processed);
  const isEnding = createMemo(() => appState.protected_state === "ending");

  const filesProtectedCount = createMemo(() => {
    if (appState.protected_state === "active") return totalFiles();
    if (isEnding()) return totalFiles() - filesProcessed();
    return filesProcessed();
  });
  const filesUnprotectedCount = createMemo(() => {
    if (appState.protected_state === "active") return 0;
    if (isEnding()) return filesProcessed();
    return totalFiles() - filesProcessed();
  });

  const progress = createMemo(() => {
    const total = totalFiles();
    if (total === 0) {
      return appState.protected_state === "active" ? 1 : 0.75;
    }
    if (
      appState.protected_state === "active" ||
      appState.protected_state === "inactive"
    )
      return 1;
    return filesProcessed() / total;
  });

  const mostRecentSession = createMemo(() => {
    const history = appState.session_history ?? [];
    if (history.length === 0) return null;
    return [...history].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )[0];
  });

  const lastSessionText = createMemo(() => {
    now();
    const session = mostRecentSession();
    if (!session) return null;
    return formatLastSession(session.started_at, session.status === "active");
  });

  const buttonColors = createMemo(() => {
    switch (appState.protected_state) {
      case "in_process":
      case "ending":
      case "deletion_blocked":
        return "bg-annex-dark-yellow border-annex-light-yellow text-annex-light-yellow";
      case "active":
        return "bg-annex-dark-green border-annex-light-green text-annex-light-green";
      default:
        return "bg-annex-dark-red border-annex-light-red text-annex-light-red";
    }
  });

  const buttonText = createMemo(() => {
    switch (appState.protected_state) {
      case "in_process":
        return "Preparing Session...";
      case "ending":
        return "Ending Session...";
      case "active":
        return "End Session";
      case "deletion_blocked":
        return "Waiting...";
      default:
        return "Initiate Session";
    }
  });

  const isButtonDisabled = createMemo(
    () =>
      appState.protected_state === "in_process" ||
      appState.protected_state === "ending" ||
      appState.protected_state === "deletion_blocked" ||
      totalFiles() === 0,
  );

  let pinModalActions: PinModalActions | undefined;

  createEffect(
    on(trayEndSessionPending, (pending) => {
      if (pending) {
        setTrayEndSessionPending(false);
        if (appState.protected_state === "active") {
          pinModalActions?.open();
        }
      }
    }),
  );

  const [showRecoveryModal, setShowRecoveryModal] = createSignal(false);
  const [recoveryDismissed, setRecoveryDismissed] = createSignal(false);

  createEffect(() => {
    if (
      appState.mid_process &&
      appState.is_authenticated &&
      !recoveryDismissed()
    ) {
      setShowRecoveryModal(true);
    }
  });

  async function handleButtonClick() {
    if (appState.protected_state === "inactive") {
      try {
        await invoke("initiate_session");
      } catch (e) {
        console.error("Failed to initiate session:", e);
      }
    } else if (appState.protected_state === "active") {
      pinModalActions?.open();
    }
  }

  return (
    <div class="flex flex-col h-full">
      <div class="@container flex flex-row xl:px-20 items-center gap-x-6 justify-between animate-fadeIn flex-1">
        <div class="flex-col gap-y-32 flex-1 hidden xl:flex">
          <div class="flex flex-col gap-y-4">
            <h1 class="font-mono font-semibold text-3xl md:text-5xl">
              {headerText()}
            </h1>
            <p>
              Prevent AI assistants from accessing sensitive files by <br />{" "}
              encrypting them during active sessions.
            </p>
            <p class="text-annex-light-purple">
              {lastSessionText()
                ? `Last Session: ${lastSessionText()}`
                : "No sessions yet"}
            </p>
          </div>
          <div class="flex  flex-col">
            <h2 class="font-mono text-lg md:text-3xl mb-3">Quick Links</h2>
            <a
              class="py-1 max-w-64 hover:text-annex-white items-end transition duration-150 underline underline-offset-4 text-annex-dark-gray text-sm cursor-pointer flex flex-row gap-x-1"
              onClick={() => openUrl("https://github.com/your-org/annex")}
            >
              How Does it Work?
              <ExternalLinkIcon class="w-4 h-4" />
            </a>
            <a
              class="py-1 max-w-64 hover:text-annex-white items-end transition duration-150 underline underline-offset-4 text-annex-dark-gray text-sm cursor-pointer flex flex-row gap-x-1"
              onClick={() =>
                openUrl(
                  "https://github.com/your-org/annex#security",
                )
              }
            >
              Technical Documentation
              <ExternalLinkIcon class="w-4 h-4" />
            </a>
          </div>
        </div>

        <div class="relative flex items-center justify-center min-w-85">
          <div class="absolute hidden xl:block">
            <SessionRing
              progress={progress()}
              state={appState.protected_state}
            />
          </div>
          <div class="relative z-10 flex flex-col items-start xl:border border-[#8D8D8D] rounded-lg px-8 py-14 w-64 md:w-74 xl:bg-annex-background/20 xl:backdrop-blur-sm">
            <div class="flex flex-col items-start gap-y-1">
              <div class="flex flex-row items-center gap-x-3">
                <ShieldSlashIcon class="w-14 h-14 text-annex-white/80" />
                <div class="flex flex-col">
                  <span class="text-4xl font-bold leading-tight">
                    {filesUnprotectedCount().toLocaleString()}
                  </span>
                  <span class="text-sm text-annex-white">
                    Files Unprotected
                  </span>
                </div>
              </div>
              <AnimatedCarets state={appState.protected_state} />
              <div class="flex flex-row items-center gap-x-3">
                <ShieldCheckIcon class="w-14 h-14 text-annex-white/80" />
                <div class="flex flex-col">
                  <span class="text-4xl font-semibold font-mono leading-tight">
                    {filesProtectedCount().toLocaleString()}
                  </span>
                  <span class="text-sm text-annex-white">Files Protected</span>
                </div>
              </div>
            </div>
            <p class="font-mono text-sm text-annex-dark-gray mt-4">
              {formatTimer(timerMs())}
            </p>
            <button
              onClick={handleButtonClick}
              disabled={isButtonDisabled()}
              class={`mt-3 w-full py-3 rounded-md border font-semibold text-sm transition-all duration-300 ${buttonColors()} ${
                isButtonDisabled()
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:opacity-80 cursor-pointer"
              }`}
            >
              {buttonText()}
            </button>
          </div>
        </div>

        <Show when={showRecoveryModal()}>
          <RecoveryModal
            onDismiss={() => {
              setRecoveryDismissed(true);
              setShowRecoveryModal(false);
            }}
            onDecryptRecovery={() => {
              pinModalActions?.open({ recoveryPending: true });
            }}
          />
        </Show>

        <Show when={appState.protected_state === "deletion_blocked"}>
          <DeletionBlockedModal />
        </Show>

        <PinModal ref={(actions) => (pinModalActions = actions)} />
      </div>
      <LogPanel />
    </div>
  );
}
