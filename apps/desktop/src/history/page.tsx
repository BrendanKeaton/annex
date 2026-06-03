import { createSignal, createMemo, For, Show } from "solid-js";
import SearchIcon from "../components/icons/search";
import CaretDownIcon from "../components/icons/caret_down";
import Dropdown from "../components/ui/dropdown";
import SortHeader, { type SortState } from "../components/ui/sort_header";
import { useAppState, type SessionStatus } from "../context/app_state";
import { TIME_PRESETS } from "./consts";
import { StatusFilter, SortField } from "./types";
import { type TimePreset } from "../utils/time";
import {
  getTimeThreshold,
  formatDuration,
  formatSizeKb,
  formatRelativeTime,
  sessionDuration,
} from "./helpers";

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};
const datetimeFormatter = new Intl.DateTimeFormat("en-US", DATETIME_FORMAT);

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  active: {
    label: "Active",
    dotClass: "bg-annex-light-green",
    textClass: "text-annex-light-green",
  },
  ended: {
    label: "Ended",
    dotClass: "bg-annex-light-purple",
    textClass: "text-annex-light-purple",
  },
  failed: {
    label: "Failed",
    dotClass: "bg-annex-light-red",
    textClass: "text-annex-light-red",
  },
};

function StatusBadge(props: { status: SessionStatus }) {
  const config = () => STATUS_CONFIG[props.status];

  return (
    <div class="flex flex-row items-center gap-x-1.5">
      <div
        class={`w-1.5 h-1.5 rounded-full ${config().dotClass} ${
          props.status === "active" ? "animate-pulse" : ""
        }`}
      />
      <span class={`text-xs font-mono ${config().textClass}`}>
        {config().label}
      </span>
    </div>
  );
}

export default function History() {
  const [appState] = useAppState();

  const [searchQuery, setSearchQuery] = createSignal("");
  const [timePreset, setTimePreset] = createSignal<TimePreset>("MAX");
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
  const [sort, setSort] = createSignal<SortState<SortField> | null>({
    field: "started",
    dir: "desc",
  });
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const sessionsEnriched = createMemo(() =>
    (appState.session_history ?? []).map((s) => ({
      ...s,
      _startedEpoch: new Date(s.started_at).getTime(),
      _endedEpoch: s.ended_at ? new Date(s.ended_at).getTime() : null,
      _formattedStarted: datetimeFormatter.format(new Date(s.started_at)),
      _formattedEnded: s.ended_at
        ? datetimeFormatter.format(new Date(s.ended_at))
        : null,
      _relativeStarted: formatRelativeTime(s.started_at),
      _duration: sessionDuration(s.started_at, s.ended_at),
      _formattedSize: formatSizeKb(s.total_size_enc_kb),
      _formattedEncTime: formatDuration(s.actual_encryption_time_ms),
      _formattedEstTime: formatDuration(s.est_encryption_time_ms),
    }))
  );

  const afterTime = createMemo(() => {
    const threshold = getTimeThreshold(timePreset());
    return sessionsEnriched().filter((s) => s._startedEpoch >= threshold);
  });

  const afterStatus = createMemo(() => {
    const f = statusFilter();
    if (f === "all") return afterTime();
    return afterTime().filter((s) => s.status === f);
  });

  const afterSearch = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    if (!q) return afterStatus();
    const tokens = q.split(/\s+/);
    return afterStatus().filter((s) => {
      const haystack = [
        s.status,
        s._formattedStarted,
        s._formattedEnded ?? "",
        s._duration,
        s.failure_message ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  });

  const filteredSessions = createMemo(() => {
    const s = sort();
    if (!s) return afterSearch();

    const arr = [...afterSearch()];
    const dir = s.dir === "asc" ? 1 : -1;

    switch (s.field) {
      case "started":
        arr.sort((a, b) => -dir * (a._startedEpoch - b._startedEpoch));
        break;
      case "ended":
        arr.sort((a, b) => {
          const ae = a._endedEpoch ?? Infinity;
          const be = b._endedEpoch ?? Infinity;
          return -dir * (ae - be);
        });
        break;
      case "status":
        arr.sort((a, b) => dir * a.status.localeCompare(b.status));
        break;
      case "files":
        arr.sort((a, b) => -dir * (a.file_count - b.file_count));
        break;
      case "size":
        arr.sort(
          (a, b) =>
            -dir * ((a.total_size_enc_kb ?? 0) - (b.total_size_enc_kb ?? 0))
        );
        break;
      case "enc_time":
        arr.sort(
          (a, b) =>
            -dir * (a.actual_encryption_time_ms - b.actual_encryption_time_ms)
        );
        break;
    }
    return arr;
  });

  function handleSort(field: SortField) {
    const s = sort();
    if (s && s.field === field) {
      setSort({ field, dir: s.dir === "asc" ? "desc" : "asc" });
    } else {
      setSort({ field, dir: "desc" });
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "ended", label: "Ended" },
    { value: "failed", label: "Failed" },
  ];

  return (
    <div class="@container flex flex-col px-6 py-8 gap-y-6 animate-fadeIn h-full">
      <div class="flex flex-row gap-x-4 items-end flex-wrap gap-y-3 @[700px]:gap-x-6">
        <div class="flex flex-col gap-y-2 min-w-0 flex-1 @[700px]:flex-none">
          <h2 class="font-mono text-sm">Search</h2>
          <label class="bg-annex-background-light flex flex-row gap-x-2 items-center border border-annex-border-light px-3 min-w-48 @[700px]:min-w-64 py-1 rounded-md transition-all duration-100 focus-within:border-annex-light-gray">
            <SearchIcon class="w-4 h-4 text-annex-dark-gray shrink-0" />
            <input
              type="text"
              placeholder="Search sessions"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="bg-transparent outline-none text-sm text-annex-white placeholder:text-annex-dark-gray w-full"
            />
          </label>
        </div>

        <div class="hidden @[600px]:flex flex-col gap-y-2">
          <h2 class="font-mono text-sm">Time Range</h2>
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
          <Dropdown
            label="Status"
            displayValue={
              STATUS_OPTIONS.find((o) => o.value === statusFilter())?.label ??
              "All"
            }
          >
            <For each={STATUS_OPTIONS}>
              {(option) => (
                <button
                  class={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-75 cursor-pointer ${
                    statusFilter() === option.value
                      ? "bg-white/10 text-annex-white"
                      : "text-annex-dark-gray hover:bg-white/5 hover:text-annex-white"
                  }`}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </Dropdown>
        </div>
      </div>

      <div class="text-sm text-annex-light-purple font-mono">
        {filteredSessions().length} session
        {filteredSessions().length !== 1 ? "s" : ""}
      </div>

      <div class="flex flex-row items-center gap-x-3 px-4 @[500px]:gap-x-4">
        <SortHeader
          label="Status"
          field="status"
          activeSort={sort()}
          onSort={handleSort}
          class="w-20 shrink-0"
        />
        <SortHeader
          label="Started"
          field="started"
          activeSort={sort()}
          onSort={handleSort}
          class="flex-1 min-w-0"
        />
        <SortHeader
          label="Duration"
          field="ended"
          activeSort={sort()}
          onSort={handleSort}
          class="w-16 justify-end shrink-0 hidden @[450px]:flex"
        />
        <SortHeader
          label="Files"
          field="files"
          activeSort={sort()}
          onSort={handleSort}
          class="w-12 justify-end shrink-0 hidden @[550px]:flex"
        />
        <SortHeader
          label="Size"
          field="size"
          activeSort={sort()}
          onSort={handleSort}
          class="w-20 justify-end shrink-0 hidden @[700px]:flex"
        />
        <SortHeader
          label="Enc. Time"
          field="enc_time"
          activeSort={sort()}
          onSort={handleSort}
          class="w-20 justify-end shrink-0 hidden @[850px]:flex"
        />
        <div class="w-5 shrink-0" />
      </div>

      <div class="flex-1 overflow-y-auto min-h-0">
        <Show
          when={filteredSessions().length > 0}
          fallback={
            <div class="text-sm text-annex-dark-gray py-8 text-center animate-fadeIn">
              No sessions match the current filters
            </div>
          }
        >
          <div class="flex flex-col gap-y-1">
            <For each={filteredSessions()}>
              {(s) => {
                const isExpanded = () => expandedId() === s.id;

                return (
                  <div
                    class={`rounded-lg border transition-colors duration-100 ${
                      isExpanded()
                        ? "bg-annex-white/3 border-annex-border-light"
                        : "border-transparent hover:bg-annex-white/3 hover:border-annex-border-light"
                    }`}
                  >
                    <div
                      class="flex flex-row items-center gap-x-3 px-4 py-3 cursor-pointer group @[500px]:gap-x-4"
                      onClick={() => toggleExpand(s.id)}
                    >
                      <div class="w-20 shrink-0">
                        <StatusBadge status={s.status} />
                      </div>

                      <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-sm text-annex-white truncate">
                          {s._relativeStarted}
                        </span>
                        <span class="text-xs text-annex-dark-gray truncate group-hover:text-annex-light-gray transition-colors duration-75">
                          {s._formattedStarted}
                        </span>
                      </div>

                      <span class="text-xs font-mono text-annex-dark-gray w-16 text-right shrink-0 hidden @[450px]:block">
                        {s._duration}
                      </span>

                      <span class="text-xs font-mono text-annex-dark-gray w-12 text-right shrink-0 hidden @[550px]:block">
                        {s.file_count.toLocaleString()}
                      </span>

                      <span class="text-xs font-mono text-annex-dark-gray w-20 text-right shrink-0 hidden @[700px]:block">
                        {s._formattedSize}
                      </span>

                      <span class="text-xs font-mono text-annex-dark-gray w-20 text-right shrink-0 hidden @[850px]:block">
                        {s.status === "active" ? "—" : s._formattedEncTime}
                      </span>

                      <CaretDownIcon
                        class={`w-4 h-4 shrink-0 text-annex-dark-gray transition-transform duration-200 ${
                          isExpanded() ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </div>

                    <div
                      class="grid transition-[grid-template-rows] duration-200 ease-out"
                      style={{
                        "grid-template-rows": isExpanded() ? "1fr" : "0fr",
                      }}
                    >
                      <div class="overflow-hidden">
                        <div class="px-4 pb-4 pt-1">
                          <div class="pt-4">
                            <div class="grid grid-cols-2 @[600px]:grid-cols-3 @[900px]:grid-cols-4 gap-x-8 gap-y-4">
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Started
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s._formattedStarted}
                                </span>
                              </div>
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Ended
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s._formattedEnded ?? "—"}
                                </span>
                              </div>
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Duration
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s._duration}
                                </span>
                              </div>
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Files Protected
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s.file_count.toLocaleString()}
                                </span>
                              </div>
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Total Size
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s._formattedSize}
                                </span>
                              </div>
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Est. Enc. Time
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s._formattedEstTime}
                                </span>
                              </div>
                              <div class="flex flex-col gap-y-1">
                                <span class="text-xs font-mono text-annex-dark-gray uppercase tracking-wide">
                                  Actual Enc. Time
                                </span>
                                <span class="text-sm text-annex-white">
                                  {s.status === "active"
                                    ? "—"
                                    : s._formattedEncTime}
                                </span>
                              </div>
                              <Show when={s.failure_message}>
                                <div class="flex flex-col gap-y-1 col-span-full">
                                  <span class="text-xs font-mono text-annex-light-red uppercase tracking-wide">
                                    Failure
                                  </span>
                                  <span class="text-sm text-annex-light-red">
                                    {s.failure_message}
                                  </span>
                                </div>
                              </Show>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
