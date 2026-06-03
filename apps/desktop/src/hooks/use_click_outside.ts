import { onCleanup } from "solid-js";

export function useClickOutside(
  getRef: () => HTMLElement | undefined,
  onOutside: () => void,
) {
  function handler(e: MouseEvent) {
    const el = getRef();
    if (el && !el.contains(e.target as Node)) {
      onOutside();
    }
  }

  document.addEventListener("mousedown", handler);
  onCleanup(() => document.removeEventListener("mousedown", handler));
}
