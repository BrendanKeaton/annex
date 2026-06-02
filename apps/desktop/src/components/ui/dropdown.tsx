import { createSignal, Show, JSX } from "solid-js";
import CaretDownIcon from "../icons/caret_down";
import { useClickOutside } from "../../hooks/use_click_outside";

export default function Dropdown(props: {
  label: string;
  displayValue: string;
  children: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  useClickOutside(
    () => containerRef,
    () => setOpen(false),
  );

  return (
    <div class="flex flex-col gap-y-2">
      <h2 class="font-mono text-sm">{props.label}</h2>
      <div ref={containerRef} class="relative">
        <button
          class="bg-annex-background-light flex flex-row items-center justify-between gap-x-3 border border-annex-border-light px-3 py-1 rounded-md min-w-32 text-sm transition-all duration-100 hover:border-annex-light-gray cursor-pointer"
          onClick={() => setOpen(!open())}
        >
          <span class="truncate text-annex-dark-gray">
            {props.displayValue}
          </span>
          <CaretDownIcon class="w-3 h-3 text-annex-dark-gray transition-transform duration-150 -rotate-90" />
        </button>
        <Show when={open()}>
          <div class="absolute top-full left-0 mt-1 z-50 bg-annex-background-light border border-annex-border-light rounded-md shadow-lg max-h-64 overflow-y-auto min-w-48 animate-dropdown">
            {props.children}
          </div>
        </Show>
      </div>
    </div>
  );
}
