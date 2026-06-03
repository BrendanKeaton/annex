import { SizeFilter } from "./types";

export { TIME_PRESETS } from "../utils/time";

export const FILE_TYPE_GROUPS: Record<string, string[]> = {
  Documents: ["csv", "xlsx", "xls", "pdf", "doc", "docx", "txt", "rtf"],
  Images: [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "bmp",
    "webp",
    "tiff",
    "ico",
    "heic",
  ],
  Video: ["mp4", "mov", "avi", "mkv", "wmv"],
  Audio: ["mp3", "wav", "flac", "aac", "ogg"],
  Archives: ["zip", "tar", "gz", "rar", "7z"],
  "Code / Config": [
    "json",
    "xml",
    "html",
    "css",
    "js",
    "ts",
    "py",
    "rs",
    "go",
    "java",
    "cpp",
    "c",
    "h",
    "md",
    "yaml",
    "toml",
    "sql",
  ],
  Presentations: ["ppt", "pptx"],
  "Executables / System": [
    "exe",
    "dll",
    "so",
    "dylib",
    "dmg",
    "msi",
    "deb",
    "rpm",
  ],
};

export const SIZE_FILTERS: SizeFilter[] = [
  { label: "All", min: 0, max: Infinity },
  { label: "< 1 MB", min: 0, max: 1_000_000 },
  { label: "1 - 10 MB", min: 1_000_000, max: 10_000_000 },
  { label: "10 - 100 MB", min: 10_000_000, max: 100_000_000 },
  { label: "100 MB - 1 GB", min: 100_000_000, max: 1_000_000_000 },
  { label: "> 1 GB", min: 1_000_000_000, max: Infinity },
];
