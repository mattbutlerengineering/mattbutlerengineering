interface CostDisplayProps {
  readonly costUsd: number | null;
  readonly className?: string;
}

export function CostDisplay({ costUsd, className = "" }: CostDisplayProps) {
  if (costUsd === null) {
    return <span className={`text-gray-500 ${className}`}>--</span>;
  }

  return (
    <span className={`font-mono ${className}`}>
      ${costUsd.toFixed(2)}
    </span>
  );
}
