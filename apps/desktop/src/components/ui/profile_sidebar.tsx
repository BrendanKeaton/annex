import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAppState, useResetAppState } from "../../context/app_state";
import { useClickOutside } from "../../hooks/use_click_outside";
import CaretDownIcon from "../icons/caret_down";
import UserIcon from "../icons/user";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

export default function ProfileSideBar() {
  const [state] = useAppState();
  const resetAppState = useResetAppState();
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  useClickOutside(
    () => containerRef,
    () => setOpen(false),
  );

  async function handleLogout() {
    try {
      await invoke("logout");
    } catch (e) {
      console.error("Logout failed:", e);
    }
    resetAppState();
    navigate("/");
  }

  return (
    <div ref={containerRef} class="relative">
      <button
        class="flex flex-row gap-x-3 items-center hover:cursor-pointer w-full text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div class="flex rounded-md p-3 items-center justify-center border border-annex-light-gray bg-annex-background">
          <UserIcon class="w-7 h-7" />
        </div>
        <div class="flex flex-row justify-between w-full items-center">
          <span class="text-lg font-mono leading-tight truncate max-w-40">
            {state.user_email}
          </span>
          <CaretDownIcon
            class={`w-4 h-4 transition-transform ${
              open() ? "-rotate-180" : "-rotate-90"
            }`}
          />
        </div>
      </button>
      <div
        class={`p-1.5 absolute bottom-full right-0 mb-2 w-full border border-annex-border-light bg-annex-background-light rounded-md shadow-lg transition-opacity duration-150 ${
          open() ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          class="hover:cursor-pointer w-full text-left px-4 py-2 text-sm rounded-md border-transparent hover:bg-annex-white/5 hover:border-dashed"
          onClick={handleLogout}
        >
          Logout
        </button>
        <button
          class="w-full hover:cursor-pointer text-left px-4 py-2 text-sm rounded-md border-transparent hover:bg-annex-white/5 hover:border-dashed"
          onClick={() => openUrl("https://github.com/your-org/annex")}
        >
          Documentation
        </button>
      </div>
    </div>
  );
}
