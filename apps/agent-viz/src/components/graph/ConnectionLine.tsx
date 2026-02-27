import type { Connection } from "./graph-layout";

interface ConnectionLineProps {
  readonly connection: Connection;
  readonly active: boolean;
}

export function ConnectionLine({ connection, active }: ConnectionLineProps) {
  return (
    <path
      d={connection.path}
      fill="none"
      stroke={active ? "#5b8def44" : "#3a3a5e33"}
      strokeWidth={active ? 2 : 1}
      strokeDasharray={active ? undefined : "4 4"}
    />
  );
}
