const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 18 18",
  fill: "currentColor",
  "aria-hidden": true,
} as const;

export function PlayIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 3v12l10-6z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 3h3.5v12H4zM10.5 3H14v12h-3.5z" />
    </svg>
  );
}
