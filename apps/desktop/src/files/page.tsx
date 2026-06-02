import { createSignal, createMemo, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { invoke } from "@tauri-apps/api/core";
import SearchIcon from "../components/icons/search";
import ThreeDotsIcon from "../components/icons/three_dots";
import Dropdown from "../components/ui/dropdown";
import SortHeader, { type SortState } from "../components/ui/sort_header";
import { useClickOutside } from "../hooks/use_click_outside";
import { useAppState } from "../context/app_state";
import { FILE_TYPE_GROUPS, SIZE_FILTERS, TIME_PRESETS } from "./consts";
import { SizeFilter, SortField } from "./types";
import { type TimePreset } from "../utils/time";
import {
  getTimeThreshold,
  formatFileSize,
  getFileName,
  getFileTypeColor,
} from "./helpers";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};
const dateFormatter = new Intl.DateTimeFormat("en-US", DATE_FORMAT);

const ROW_HEIGHT = 52;

function RowMenu(props: {
  path: string;
  onDelete: (path: string) => void;
  onClose: () => void;
}) {
  let menuRef: HTMLDivElement | undefined;

  useClickOutside(
    () => menuRef,
    () => props.onClose(),
  );

  function handleDelete() {
    props.onClose();
    props.onDelete(props.path);
  }

  return (
    <div
      ref={menuRef}
      data-menu-for={props.path}
      class="absolute top-10 right-0 z-9999 p-1.5 w-40 h-fit border border-annex-border-light bg-annex-background-light! rounded-md shadow-lg animate-dropdown"
    >
      <button
        class="hover:cursor-pointer w-full text-left px-4 py-2 text-sm rounded-md text-annex-light-red border-transparent hover:bg-annex-white/5 hover:border-dashed"
        onClick={handleDelete}
      >
        Remove
      </button>
    </div>
  );
}

export default function Files() {
  const [appState] = useAppState();

  const [searchQuery, setSearchQuery] = createSignal("");
  const [timePreset, setTimePreset] = createSignal<TimePreset>("MAX");
  const [sizeFilter, setSizeFilter] = createSignal<SizeFilter>(SIZE_FILTERS[0]);
  const [selectedTypes, setSelectedTypes] = createSignal<Set<string>>(
    new Set()
  );
  const [deletingPath, setDeletingPath] = createSignal<string | null>(null);
  const [sort, setSort] = createSignal<SortState<SortField> | null>(null);
  const [openMenuPath, setOpenMenuPath] = createSignal<string | null>(null);

  let scrollRef: HTMLDivElement | undefined;

  const pathsWithEpoch = createMemo(() =>
    (appState.protected_paths ?? []).map((p) => ({
      ...p,
      _epoch: new Date(p.created_at).getTime(),
      _name: getFileName(p.path).toLowerCase(),
      _typeLower: (p.file_type ?? "unknown").toLowerCase(),
      _formattedDate: dateFormatter.format(new Date(p.created_at)),
      _formattedSize: formatFileSize(p.file_size),
      _typeColor: getFileTypeColor(p.file_type),
      _displayName: getFileName(p.path),
    }))
  );

  const afterTime = createMemo(() => {
    const threshold = getTimeThreshold(timePreset());
    return pathsWithEpoch().filter((p) => p._epoch >= threshold);
  });

  const afterSize = createMemo(() => {
    const f = sizeFilter();
    if (f.min === 0 && f.max === Infinity) return afterTime();
    return afterTime().filter(
      (p) => p.file_size >= f.min && p.file_size < f.max
    );
  });

  const afterType = createMemo(() => {
    const sel = selectedTypes();
    if (sel.size === 0) return afterSize();
    return afterSize().filter((p) => sel.has(p._typeLower));
  });

  const afterSearch = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    if (!q) return afterType();
    const tokens = q.split(/\s+/);
    return afterType().filter((p) => {
      const haystack = p._name + " " + p.path.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  });

  const filteredPaths = createMemo(() => {
    const s = sort();
    if (!s) return afterSearch();

    const arr = [...afterSearch()];
    const dir = s.dir === "asc" ? 1 : -1;

    switch (s.field) {
      case "name":
        arr.sort((a, b) => dir * a._name.localeCompare(b._name));
        break;
      case "type":
        arr.sort((a, b) => dir * a._typeLower.localeCompare(b._typeLower));
        break;
      case "size":
        arr.sort((a, b) => -dir * (a.file_size - b.file_size));
        break;
      case "created":
        arr.sort((a, b) => -dir * (a._epoch - b._epoch));
        break;
    }
    return arr;
  });

  const virtualizer = createVirtualizer({
    get count() {
      return filteredPaths().length;
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  function handleSort(field: SortField) {
    const s = sort();
    if (s && s.field === field) {
      setSort({ field, dir: s.dir === "asc" ? "desc" : "asc" });
    } else {
      setSort({ field, dir: "asc" });
    }
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function typeDisplayValue(): string {
    const sel = selectedTypes();
    if (sel.size === 0) return "All";
    const arr = [...sel];
    if (arr.length <= 2) return arr.join(", ");
    return `${arr.slice(0, 2).join(", ")}, +${arr.length - 2}`;
  }

  async function handleDeletePath(path: string) {
    setDeletingPath(path);
    try {
      await invoke("delete_protected_path", { path });
    } catch (e) {
      console.error("Failed to delete protected path:", e);
    } finally {
      setDeletingPath(null);
    }
  }

  function toggleMenu(path: string, e: MouseEvent) {
    e.stopPropagation();
    setOpenMenuPath((prev) => (prev === path ? null : path));
  }

  return (
    <div class="@container flex flex-col px-6 py-8 gap-y-6 animate-fadeIn h-full">
      <div class="flex flex-row gap-x-4 items-end flex-wrap gap-y-3 @[700px]:gap-x-6">
        <div class="flex flex-col gap-y-2 min-w-0 flex-1 @[700px]:flex-none">
          <h2 class="font-mono text-sm">Search</h2>
          <label class="bg-annex-background-light flex flex-row gap-x-2 items-center border border-annex-border-light px-3 min-w-48 @[700px]:min-w-64 py-1 rounded-md transition-all duration-100 focus-within:border-annex-light-gray">
            <SearchIcon class="w-4 h-4 text-annex-dark-gray shrink-0" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="bg-transparent outline-none text-sm text-annex-white placeholder:text-annex-dark-gray w-full"
            />
          </label>
        </div>

        <div class="hidden @[600px]:flex flex-col gap-y-2">
          <h2 class="font-mono text-sm">Time Since Added</h2>
          <div class="flex flex-row bg-annex-background-light border border-annex-border-light rounded-md overflow-hidden">
            <For each={[...TIME_PRESETS]}>
              {(preset) => (
                <button
                  class={`px-2 py-0 text-sm font-mono cursor-pointer transition-all duration-100 @[800px]:px-3 ${
                    timePreset() === preset
                      ? "bg-annex-white m-1 rounded-sm text-annex-black"
                      : "text-annex-dark-gray m-1 rounded-sm hover:text-annex-white hover:bg-white/5"
                  }`}
                  onClick={() => setTimePreset(preset)}
                >
                  {preset}
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="hidden @[900px]:block">
          <Dropdown label="File Size" displayValue={sizeFilter().label}>
            <For each={SIZE_FILTERS}>
              {(option) => (
                <button
                  class={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-75 cursor-pointer ${
                    sizeFilter().label === option.label
                      ? "bg-white/10 text-annex-white"
                      : "text-annex-dark-gray hover:bg-white/5 hover:text-annex-white"
                  }`}
                  onClick={() => setSizeFilter(option)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </Dropdown>
        </div>

        <div class="hidden @[1000px]:block">
          <Dropdown label="File Type" displayValue={typeDisplayValue()}>
            <div class="p-2 flex flex-col gap-y-1">
              <button
                class="text-left px-2 py-1 text-xs text-annex-white hover:text-annex-light-red transition-colors duration-75 cursor-pointer"
                onClick={() => setSelectedTypes(new Set())}
              >
                Clear all
              </button>
              <For each={Object.entries(FILE_TYPE_GROUPS)}>
                {([group, types]) => (
                  <div class="mb-1">
                    <div class="px-2 py-1 text-xs font-mono text-annex-light-gray uppercase tracking-wider">
                      {group}
                    </div>
                    <div class="flex flex-wrap gap-1 px-1">
                      <For each={types}>
                        {(type) => (
                          <button
                            class={`px-2 py-0.5 text-xs rounded cursor-pointer transition-all duration-75 ${
                              selectedTypes().has(type)
                                ? "bg-annex-purple/30 text-annex-light-purple border border-annex-purple/50"
                                : "bg-white/5 text-annex-dark-gray hover:text-annex-white hover:bg-white/10 border border-transparent"
                            }`}
                            onClick={() => toggleType(type)}
                          >
                            .{type}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Dropdown>
        </div>
      </div>

      <div class="text-sm text-annex-light-purple font-mono">
        {filteredPaths().length} file{filteredPaths().length !== 1 ? "s" : ""}
      </div>

      <div class="flex flex-row items-center gap-x-3 px-3 @[500px]:gap-x-4">
        <SortHeader
          label="File Name"
          field="name"
          activeSort={sort()}
          onSort={handleSort}
          class="flex-1 min-w-0 max-w-sm"
        />
        <SortHeader
          label="Type"
          field="type"
          activeSort={sort()}
          onSort={handleSort}
          class="w-12 justify-center shrink-0 hidden @[400px]:flex"
        />
        <SortHeader
          label="Size"
          field="size"
          activeSort={sort()}
          onSort={handleSort}
          class="w-20 justify-end shrink-0 hidden @[550px]:flex"
        />
        <SortHeader
          label="Added"
          field="created"
          activeSort={sort()}
          onSort={handleSort}
          class="w-24 justify-end shrink-0 hidden @[750px]:flex"
        />
        <div class="w-6.5 shrink-0 ml-auto" />
      </div>

      <div ref={scrollRef} class="flex-1 overflow-y-auto min-h-0">
        <Show
          when={filteredPaths().length > 0}
          fallback={
            <div class="text-sm text-annex-dark-gray py-8 text-center animate-fadeIn">
              No files match the current filters
            </div>
          }
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            <For each={virtualizer.getVirtualItems()}>
              {(virtualRow) => {
                const file = () => filteredPaths()[virtualRow.index];
                const isMenuOpen = () => openMenuPath() === file()?.path;

                return (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      "z-index": isMenuOpen() ? 50 : 0,
                    }}
                  >
                    <Show when={file()}>
                      {(f) => {
                        const isDeleting = () => deletingPath() === f().path;

                        return (
                          <div
                            class={`flex flex-row items-center gap-x-3 px-3 py-2 rounded-md transition-colors duration-75 group hover:bg-annex-white/3 hover:border border border-transparent hover:border-annex-border-light @[500px]:gap-x-4 ${
                              isDeleting()
                                ? "opacity-40 pointer-events-none"
                                : ""
                            }`}
                          >
                            <div class="flex flex-col min-w-0 flex-1 max-w-sm">
                              <span class="text-sm text-annex-white truncate">
                                {f()._displayName}
                              </span>
                              <span class="text-xs text-annex-dark-gray truncate group-hover:text-annex-light-gray transition-colors duration-75">
                                {f().path}
                              </span>
                            </div>
                            <span
                              class={`text-xs font-mono w-12 text-center shrink-0 hidden @[400px]:block ${
                                f()._typeColor
                              }`}
                            >
                              .{f()._typeLower}
                            </span>

                            <span class="text-xs font-mono text-annex-dark-gray shrink-0 w-20 text-right hidden @[550px]:block">
                              {f()._formattedSize}
                            </span>

                            <span class="text-xs font-mono text-annex-dark-gray shrink-0 w-24 text-right hidden @[750px]:block">
                              {f()._formattedDate}
                            </span>

                            <div class="ml-auto relative">
                              <button
                                class={`p-1 rounded cursor-pointer transition-all duration-100 shrink-0 ${
                                  isMenuOpen()
                                    ? "border border-dashed border-annex-border-light"
                                    : "border border-dashed border-transparent group-hover:border-annex-border-light"
                                }`}
                                onClick={(e) => toggleMenu(f().path, e)}
                              >
                                <ThreeDotsIcon class="w-5 h-5" />
                              </button>
                              <Show when={isMenuOpen()}>
                                <RowMenu
                                  path={f().path}
                                  onDelete={handleDeletePath}
                                  onClose={() => setOpenMenuPath(null)}
                                />
                              </Show>
                            </div>
                          </div>
                        );
                      }}
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
