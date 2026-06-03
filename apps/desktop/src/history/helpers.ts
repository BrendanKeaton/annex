export { getTimeThreshold } from "../utils/time";

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1_000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function formatSizeKb(kb: number | null): string {
  if (kb === null || kb === 0) return "—";
  if (kb < 1_000) return `${kb} KB`;
  if (kb < 1_000_000) return `${(kb / 1_000).toFixed(1)} MB`;
  return `${(kb / 1_000_000).toFixed(2)} GB`;
}

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return `${mins}m ago`;
  }
  if (diff < 86_400_000) {
    const hrs = Math.floor(diff / 3_600_000);
    return `${hrs}h ago`;
  }
  if (diff < 604_800_000) {
    const days = Math.floor(diff / 86_400_000);
    return `${days}d ago`;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function sessionDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "ongoing";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return formatDuration(end - start);
}
