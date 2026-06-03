import { Show } from "solid-js";
import SortAscIcon from "../icons/sort_asc";
import SortDescIcon from "../icons/sort_desc";

export type SortDir = "asc" | "desc";

export interface SortState<F extends string = string> {
  field: F;
  dir: SortDir;
}

export default function SortHeader<F extends string>(props: {
  label: string;
  field: F;
  activeSort: SortState<F> | null;
  onSort: (field: F) => void;
  class?: string;
}) {
  const isActive = () => props.activeSort?.field === props.field;
  const dir = () => props.activeSort?.dir;

  return (
    <button
      class={`flex flex-row items-center gap-x-1 cursor-pointer text-xs font-mono transition-colors duration-75 hover:text-annex-white ${
        isActive() ? "text-annex-white" : "text-annex-dark-gray"
      } ${props.class ?? ""}`}
      onClick={() => props.onSort(props.field)}
    >
      {props.label}
      <Show when={isActive()}>
        {dir() === "asc" ? (
          <SortAscIcon class="w-3 h-3" />
        ) : (
          <SortDescIcon class="w-3 h-3" />
        )}
      </Show>
    </button>
  );
}
