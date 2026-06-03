import { FILE_TYPE_GROUPS } from "./consts";

export { getTimeThreshold } from "../utils/time";

export function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function getFileTypeColor(type: string | null): string {
  if (!type) return "text-annex-light-gray";
  for (const [group] of Object.entries(FILE_TYPE_GROUPS)) {
    if (FILE_TYPE_GROUPS[group].includes(type)) {
      switch (group) {
        case "Documents":
          return "text-blue-400";
        case "Images":
          return "text-annex-light-purple";
        case "Video":
          return "text-annex-light-red";
        case "Audio":
          return "text-annex-light-yellow";
        case "Archives":
          return "text-orange-400";
        case "Code / Config":
          return "text-annex-light-green";
        case "Presentations":
          return "text-pink-400";
        case "Executables / System":
          return "text-red-400";
      }
    }
  }
  return "text-annex-light-gray";
}
