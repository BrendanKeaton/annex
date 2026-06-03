import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface DragDropCallbacks {
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (paths: string[]) => void;
}

export interface ScannedFile {
  path: string;
  file_size: number;
  file_type: string;
}

export interface ScanResult {
  files: ScannedFile[];
  total_count: number;
}

export async function setupDragDrop(callbacks: DragDropCallbacks) {
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "enter") {
      callbacks.onDragEnter();
    } else if (event.payload.type === "drop") {
      callbacks.onDrop(event.payload.paths);
      callbacks.onDragLeave();
    } else if (event.payload.type === "leave") {
      callbacks.onDragLeave();
    }
  });
  return unlisten;
}

export async function openFileDialog(): Promise<string[] | null> {
  const selected = await open({
    multiple: true,
    title: "Select files or folders to protect",
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected : [selected];
}

export async function scanPaths(paths: string[]): Promise<ScanResult> {
  return invoke("scan_paths", { paths });
}

export async function addProtectedPaths(files: ScannedFile[]): Promise<void> {
  await invoke("add_protected_paths", { files });
}
