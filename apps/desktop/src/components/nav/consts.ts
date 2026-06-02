import type { ProtectedState } from "../../context/app_state";

export const PROTECTED_LABEL: Record<ProtectedState, string> = {
  active: "Protection On",
  inactive: "Protection Off",
  in_process: "Activating Protection...",
  failed: "Protection Failed",
  ending: "Deactivating Protection...",
  deletion_blocked: "File Access Blocked",
};

export const PROTECTED_COLOR_LIGHT: Record<ProtectedState, string> = {
  active: "text-annex-light-green! border-annex-light-green!",
  inactive: "text-annex-light-red! border-annex-light-red!",
  in_process: "text-annex-light-yellow! border-annex-light-yellow!",
  failed: "text-annex-white border-annex-light-white",
  ending: "text-annex-light-yellow! border-annex-light-yellow!",
  deletion_blocked: "text-annex-light-yellow! border-annex-light-yellow!",
};

export const PROTECTED_COLOR_DARK: Record<ProtectedState, string> = {
  active: "bg-annex-dark-green",
  inactive: "bg-annex-dark-red",
  in_process: "bg-annex-dark-yellow",
  failed: "bg-annex-black",
  ending: "bg-annex-dark-yellow",
  deletion_blocked: "bg-annex-dark-yellow",
};
