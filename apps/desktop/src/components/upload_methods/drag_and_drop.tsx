import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  Switch,
  Match,
} from "solid-js";
import ArrowRightIcon from "../icons/arrow_right";
import {
  setupDragDrop,
  openFileDialog,
  scanPaths,
  addProtectedPaths,
  type ScanResult,
} from "./use_file_upload";

type UploadStatus = "idle" | "loading" | "confirming" | "success" | "error";

export default function Drag_and_Drop() {
  const [isDragHover, setIsDragHover] = createSignal(false);
  const [status, setStatus] = createSignal<UploadStatus>("idle");
  const [pendingScan, setPendingScan] = createSignal<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = createSignal("");
  let unlistenPromise: Promise<() => void>;

  onMount(() => {
    unlistenPromise = setupDragDrop({
      onDragEnter: () => setIsDragHover(true),
      onDragLeave: () => setIsDragHover(false),
      onDrop: (paths) => processPaths(paths),
    });
  });

  onCleanup(() => {
    unlistenPromise?.then((fn) => fn());
  });

  const handleClick = async () => {
    if (status() !== "idle") return;
    const paths = await openFileDialog();
    if (paths && paths.length > 0) {
      processPaths(paths);
    }
  };

  const processPaths = async (paths: string[]) => {
    setStatus("loading");
    setErrorMsg("");

    try {
      const result = await scanPaths(paths);

      if (result.total_count === 0) {
        setStatus("idle");
        return;
      }

      if (result.total_count > 100) {
        setPendingScan(result);
        setStatus("confirming");
        return;
      }

      await submitFiles(result);
    } catch (err) {
      handleError(err);
    }
  };

  const submitFiles = async (result: ScanResult) => {
    setStatus("loading");
    try {
      await addProtectedPaths(result.files);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      handleError(err);
    }
  };

  const handleConfirm = () => {
    const scan = pendingScan();
    if (scan) {
      setPendingScan(null);
      submitFiles(scan);
    }
  };

  const handleCancel = () => {
    setPendingScan(null);
    setStatus("idle");
  };

  const handleError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setErrorMsg(message);
    setStatus("error");
    setTimeout(() => setStatus("idle"), 3000);
  };

  return (
    <div
      onClick={handleClick}
      class={`bg-annex-background flex flex-row items-center w-70 rounded-md border h-20 px-3 gap-3 transition-all duration-200 ${
        status() === "idle" || status() === "confirming" ? "cursor-pointer" : ""
      } ${
        isDragHover()
          ? "border-annex-purple bg-annex-purple/10 scale-[1.02]"
          : status() === "success"
          ? "border-annex-light-green bg-annex-dark-green"
          : status() === "error"
          ? "border-annex-light-red bg-annex-dark-red"
          : "border-annex-light-gray"
      }`}
    >
      <Switch>
        {/* Confirming state — custom in-app modal */}
        <Match when={status() === "confirming"}>
          <div
            class="flex flex-col items-center w-full gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span class="text-white font-mono text-xs text-center">
              Add {pendingScan()?.total_count} files to protection?
            </span>
            <div class="flex gap-2">
              <button
                onClick={handleCancel}
                class="px-3 py-1 text-xs font-mono rounded border border-annex-light-gray text-annex-light-gray hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                class="px-3 py-1 text-xs font-mono rounded bg-annex-purple text-white hover:bg-annex-purple/80 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </Match>

        {/* Loading state — spinner */}
        <Match when={status() === "loading"}>
          <div class="flex items-center justify-center w-10 h-10">
            <div class="w-5 h-5 border-2 border-annex-purple border-t-transparent rounded-full animate-spin" />
          </div>
          <span class="text-white font-mono text-sm">Processing...</span>
        </Match>

        {/* Success state — checkmark */}
        <Match when={status() === "success"}>
          <div class="flex items-center justify-center w-10 h-10">
            <svg
              class="w-5 h-5 text-annex-light-green"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <span class="text-annex-light-green font-mono text-sm">
            Files added!
          </span>
        </Match>

        {/* Error state */}
        <Match when={status() === "error"}>
          <div class="flex items-center justify-center w-10 h-10">
            <svg
              class="w-5 h-5 text-annex-light-red"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <div class="flex flex-col">
            <span class="text-annex-light-red font-mono text-sm">
              Failed to add
            </span>
            <Show when={errorMsg()}>
              <span class="text-red-400 font-mono text-xs truncate max-w-45">
                {errorMsg()}
              </span>
            </Show>
          </div>
        </Match>

        {/* Idle state — default */}
        <Match when={status() === "idle"}>
          <div class="flex items-center justify-center w-10 h-10 border border-dashed border-annex-light-gray rounded-md">
            <ArrowRightIcon class="w-4 h-4 -rotate-90" />
          </div>
          <div class="flex flex-col">
            <span class="text-white font-mono text-sm">
              {isDragHover() ? "Drop files here" : "Drag or Upload File"}
            </span>
            <span class="text-annex-light-gray font-mono text-xs">
              to add to session protection
            </span>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
