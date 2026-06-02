import { useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import Drag_and_Drop from "../upload_methods/drag_and_drop";
import annex_icon from "../../assets/annex_icon.svg";
import HouseIcon from "../icons/house";
import TreeIcon from "../icons/tree";
import CounterClockWiseClockIcon from "../icons/clock_counter_clockwise";
import UpgradeAccount from "../ui/upgrade_account";
import ProfileSideBar from "../ui/profile_sidebar";
import { useAppState } from "../../context/app_state";

const baseClass = "flex flex-row pl-2 gap-x-2 items-center rounded-sm border";
const activeClass = `${baseClass} bg-annex-background border-annex-light-gray text-annex-white`;
const inactiveClass = `${baseClass} border-transparent hover:border-annex-light-gray hover:border-dashed`;

export default function Sidebar() {
  const location = useLocation();
  const [state] = useAppState();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav class="flex flex-col h-screen justify-between pl-8 pr-4 py-8">
      <div class="flex flex-col">
        <div class="mb-9 flex items-center gap-2 mt-1 font-mono text-lg leading-0">
          <img src={annex_icon} class="w-5 h-5" alt="Annex" />
          Annex
        </div>
        <div class="flex flex-col gap-y-1 text-annex-dark-gray text-lg font-light">
          <Drag_and_Drop />
          <h2 class="text-annex-white text-xl font-mono mt-5 mb-2">Views</h2>
          <a
            href="/app/session"
            class={isActive("/app/session") ? activeClass : inactiveClass}
          >
            <HouseIcon class="w-4 h-4 text-annex-dark-gray!" />
            Session
          </a>
          <a
            href="/app/files"
            class={isActive("/app/files") ? activeClass : inactiveClass}
          >
            <TreeIcon class="w-4 h-4 text-annex-dark-gray!" />
            Files
          </a>
          <a
            href="/app/history"
            class={isActive("/app/history") ? activeClass : inactiveClass}
          >
            <CounterClockWiseClockIcon class="w-4 h-4 text-annex-dark-gray!" />
            History
          </a>
        </div>
      </div>
      <div class="flex flex-col gap-y-3">
        <Show when={state.subscription_level === "free"}>
          <UpgradeAccount />
        </Show>
        <ProfileSideBar />
      </div>
    </nav>
  );
}
