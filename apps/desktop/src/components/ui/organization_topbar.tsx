import { createSignal } from "solid-js";
import { useAppState } from "../../context/app_state";
import { useClickOutside } from "../../hooks/use_click_outside";
import CaretDownIcon from "../icons/caret_down";
import { openUrl } from "@tauri-apps/plugin-opener";

export default function OrganizationTopBar() {
  const [state] = useAppState();
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  useClickOutside(
    () => containerRef,
    () => setOpen(false),
  );

  return (
    <div ref={containerRef} class="relative w-64">
      <button
        class="flex flex-row gap-x-3 items-center hover:cursor-pointer w-full text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div class="flex rounded-md px-2 py-1 items-center justify-center border border-annex-light-gray bg-annex-background w-14 h-12">
          <img
            class="w-full h-fit object-contain"
            src={state.logo_path ?? ""}
          />
        </div>
        <div class="flex flex-col justify-center w-full">
          <div class="flex flex-row justify-between w-full items-center">
            <h3 class="text-base font-mono leading-tight truncate max-w-40">
              {state.org_name ?? "No Organization"}
            </h3>
            <CaretDownIcon
              class={`w-4 h-4 transition-transform ${
                open() ? "" : "-rotate-90"
              }`}
            />
          </div>
          <p class="text-sm text-annex-dark-gray flex flex-row gap-x-2 items-center min-w-0 max-w-40 mt-1">
            <span class="truncate">
              {Math.round((state.curr_file_count / state.max_file_count) * 100)}
              % usage
            </span>
          </p>
        </div>
      </button>
      <div
        class={`p-1.5 absolute top-full right-0 mt-4 w-full border border-annex-border-light bg-annex-background-light rounded-md shadow-lg transition-opacity duration-150 ${
          open() ? "opacity-100 z-9999" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          class="w-full hover:cursor-pointer text-left px-4 py-2 text-sm rounded-md border-transparent hover:bg-annex-white/5 hover:border-dashed"
          onClick={() => openUrl("https://github.com/your-org/annex")}
        >
          Learn More
        </button>
      </div>
    </div>
  );
}
