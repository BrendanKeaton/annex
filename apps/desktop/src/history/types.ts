export { type TimePreset } from "../utils/time";
export { type SortDir, type SortState } from "../components/ui/sort_header";

export type SortField =
  | "started"
  | "ended"
  | "status"
  | "files"
  | "size"
  | "enc_time";

export type StatusFilter = "all" | "active" | "ended" | "failed";
