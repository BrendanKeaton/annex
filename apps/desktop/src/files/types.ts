export { type TimePreset } from "../utils/time";
export { type SortDir, type SortState } from "../components/ui/sort_header";

export interface SizeFilter {
  label: string;
  min: number;
  max: number;
}

export type SortField = "name" | "type" | "size" | "created";
