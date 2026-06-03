import type { ProtectedState } from "../../context/app_state";

const COLOR_MAP = {
  inactive: { main: "#ff696c", dark: "#141315" },
  in_process: { main: "#ffec87", dark: "#554400" },
  ending: { main: "#ffec87", dark: "#554400" },
  active: { main: "#91ff87", dark: "#005503" },
  failed: { main: "#7a7a7a", dark: "#1e1c1f" },
  deletion_blocked: { main: "#ffec87", dark: "#554400" },
};

export default function SessionRing(props: { progress: number; state: ProtectedState }) {
  const size = 380;
  const strokeWidth = 38;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const colors = () => COLOR_MAP[props.state] ?? COLOR_MAP.inactive;

  const offset = () => {
    const p = Math.max(0, Math.min(1, props.progress));
    return circumference * (1 - p);
  };

  return (
    <div class="relative" style={{ width: `${size}px`, height: `${size}px` }}>
      <svg width={size} height={size} class="animate-ring-spin">
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stop-color={colors().main} stop-opacity="1" />
            <stop offset="10%" stop-color={colors().main} stop-opacity="0.6" />
            <stop offset="100%" stop-color={colors().dark} stop-opacity="0" />
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          stroke-width={strokeWidth}
          stroke-linecap="round"
          stroke-dasharray={`${circumference}`}
          stroke-dashoffset={offset()}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          class="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
    </div>
  );
}
