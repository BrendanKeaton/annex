import { JSX, createEffect, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import TopBar from "./components/nav/top_bar";
import Sidebar from "./components/nav/side_bar";
import { useAppState } from "./context/app_state";
import { setTrayEndSessionPending } from "./tray_actions";

const POLL_INTERVAL_MS = 30_000;

export function ExternalLayout(props: { children?: JSX.Element }) {
  return (
    <div class="min-h-screen bg-annex-black text-annex-white font-sans">
      <main class="container mx-auto px-6 flex flex-col gap-y-3 items-center justify-center min-h-screen">
        {props.children}
      </main>
    </div>
  );
}

export function InternalLayout(props: { children?: JSX.Element }) {
  const [state] = useAppState();
  const navigate = useNavigate();

  createEffect(() => {
    if (!state.is_authenticated) {
      navigate("/", { replace: true });
    }
  });

  const unlistens: Promise<UnlistenFn>[] = [];

  unlistens.push(
    listen("tray-start-session", () => {
      navigate("/app/session", { replace: true });
      invoke("initiate_session").catch((e) =>
        console.error("Failed to initiate session from tray:", e),
      );
    }),
  );

  unlistens.push(
    listen("tray-end-session", () => {
      setTrayEndSessionPending(true);
      navigate("/app/session", { replace: true });
    }),
  );

  const pollHandle = setInterval(() => {
    if (!state.is_authenticated) return;
    if (
      state.protected_state === "in_process" ||
      state.protected_state === "ending" ||
      state.protected_state === "deletion_blocked"
    )
      return;
    invoke("refresh_user_session", { loud: false }).catch(() => {});
  }, POLL_INTERVAL_MS);

  onCleanup(() => {
    clearInterval(pollHandle);
    for (const p of unlistens) {
      p.then((fn) => fn());
    }
  });

  return (
    <div class="min-h-screen bg-annex-black text-annex-white font-sans flex flex-row">
      <Sidebar />
      <div class="flex flex-col flex-1">
        {" "}
        <TopBar />
        <main class="flex-1 border border-annex-light-gray rounded-md mr-8 mb-8 bg-annex-background">
          {props.children}
        </main>
      </div>
    </div>
  );
}
