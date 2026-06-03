import { createContext, useContext, onCleanup, JSX } from "solid-js";
import { createStore, reconcile, SetStoreFunction } from "solid-js/store";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type ProtectedState =
  | "active"
  | "inactive"
  | "in_process"
  | "ending"
  | "failed"
  | "deletion_blocked";

export interface ProtectedPath {
  path: string;
  file_type: string | null;
  file_size: number;
  created_at: string;
}

export type LogLevel = "info" | "warning" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
}

export type SessionStatus = "active" | "ended" | "failed";

export interface SessionHistory {
  id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  file_count: number;
  est_encryption_time_ms: number;
  actual_encryption_time_ms: number;
  total_size_enc_kb: number | null;
  failure_message: string | null;
}

export interface AppStatePayload {
  user_id: string | null;
  user_email: string | null;
  org_name: string | null;
  logo_path: string | null;
  protected_state: ProtectedState;
  protected_paths: ProtectedPath[];
  usage: number;
  is_authenticated: boolean;
  curr_file_count: number;
  max_file_count: number;
  info_text: string | null;
  session_history: SessionHistory[];
  session_files_processed: number;
  deletion_blocked_file: string | null;
  logs: LogEntry[];
  mid_process: boolean;
  subscription_level: string;
}

const defaultState: AppStatePayload = {
  user_id: null,
  user_email: null,
  org_name: null,
  logo_path: null,
  protected_state: "inactive",
  protected_paths: [],
  usage: 0,
  is_authenticated: false,
  curr_file_count: 0,
  max_file_count: 0,
  info_text: null,
  session_history: [],
  session_files_processed: 0,
  deletion_blocked_file: null,
  logs: [],
  mid_process: false,
  subscription_level: "free",
};

type AppStateContextValue = [
  AppStatePayload,
  SetStoreFunction<AppStatePayload>,
];

const AppStateContext = createContext<AppStateContextValue>([
  defaultState,
  () => {},
]);

export function AppStateProvider(props: { children: JSX.Element }) {
  const [state, setState] = createStore<AppStatePayload>({ ...defaultState });

  let unlisten: UnlistenFn | undefined;

  listen<AppStatePayload>("app-state-changed", (event) => {
    setState(reconcile(event.payload));
  }).then((fn) => {
    unlisten = fn;
  });

  onCleanup(() => unlisten?.());

  return (
    <AppStateContext.Provider value={[state, setState]}>
      {props.children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useResetAppState() {
  const [, setState] = useAppState();
  return () => setState(reconcile({ ...defaultState }));
}
