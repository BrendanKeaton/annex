import { createSignal, createEffect, on, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../../context/app_state";
import {
  PROTECTED_COLOR_DARK,
  PROTECTED_COLOR_LIGHT,
  PROTECTED_LABEL,
} from "./consts";
import OrganizationTopBar from "../ui/organization_topbar";
import RefreshIcon from "../icons/refresh";

function InfoText() {
  const [state, setState] = useAppState();
  const [displayedText, setDisplayedText] = createSignal("");
  const [visible, setVisible] = createSignal(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    on(
      () => state.info_text,
      (text) => {
        clearTimeout(hideTimer);
        clearTimeout(clearTimer);

        if (text) {
          setDisplayedText(text);
          requestAnimationFrame(() => setVisible(true));
          hideTimer = setTimeout(() => {
            setVisible(false);
            clearTimer = setTimeout(() => {
              setDisplayedText("");
              setState("info_text", null);
            }, 300);
          }, 5000);
        } else {
          setVisible(false);
          clearTimer = setTimeout(() => setDisplayedText(""), 300);
        }
      },
    ),
  );

  return (
    <Show when={displayedText()}>
      <p
        class="text-annex-light-gray leading-tight mt-1 line-clamp-2 ml-2 text-xs hidden lg:flex transition-all duration-300 ease-out"
        classList={{
          "opacity-100 translate-y-0": visible(),
          "opacity-0 translate-y-1": !visible(),
        }}
      >
        {displayedText()}
      </p>
    </Show>
  );
}

export default function TopBar() {
  const [state] = useAppState();
  const [refreshing, setRefreshing] = createSignal(false);

  async function handleRefresh() {
    if (refreshing()) return;
    setRefreshing(true);
    try {
      await invoke("refresh_user_session", { loud: true });
    } catch (e) {
      console.error("Failed to refresh session:", e);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div class="flex flex-row w-full justify-between items-center gap-2 text-sm py-5.5 pr-10">
      <div class="flex flex-row gap-x-2 items-center">
        <button
          onClick={handleRefresh}
          disabled={refreshing()}
          class="mt-1 p-1 rounded-sm hover:bg-annex-white/10 transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Refresh session"
        >
          <RefreshIcon
            class={`w-4 h-4 text-annex-white/70 hover:text-annex-white transition-colors ${
              refreshing() ? "animate-spin-moderate" : ""
            }`}
          />
        </button>
        <span
          class={`text-[10px] font-semibold px-6 rounded-sm py-1 border mt-1 min-w-fit ${
            PROTECTED_COLOR_LIGHT[state.protected_state]
          } ${PROTECTED_COLOR_DARK[state.protected_state]}`}
        >
          {PROTECTED_LABEL[state.protected_state]}
        </span>
        <InfoText />
      </div>

      <OrganizationTopBar />
    </div>
  );
}
