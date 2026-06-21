/**
 * Generic typed state machine factory.
 *
 * Usage:
 *   const machine = createStateMachine<MyStatus>({ a: ["b"], b: [] });
 *   machine.transition("a", "b");       // ok
 *   machine.transition("b", "a");       // throws TransitionError
 *   machine.canTransition("a", "b");    // true
 *   machine.allowedTransitions("a");    // ["b"]
 */

export interface StateMachine<State extends string> {
  transition(from: State, to: State): void;
  canTransition(from: State, to: State): boolean;
  allowedTransitions(from: State): State[];
}

export class TransitionError extends Error {
  readonly from: string;
  readonly to: string;
  readonly allowed: string[];
  readonly entityType: string | undefined;

  constructor(from: string, to: string, allowed: string[], entityType?: string) {
    const label = entityType ? `${entityType} ` : "";
    super(
      `Invalid ${label}transition: cannot transition from '${from}' to '${to}'. Valid transitions from '${from}': [${allowed.join(", ") || "none"}]`
    );
    this.name = "TransitionError";
    this.from = from;
    this.to = to;
    this.allowed = allowed;
    this.entityType = entityType;
  }
}

export function createStateMachine<State extends string>(
  transitions: Partial<Record<State, State[]>>,
  entityType?: string
): StateMachine<State> {
  const allowed = (from: State): State[] => transitions[from] ?? [];

  return {
    transition(from: State, to: State): void {
      if (!allowed(from).includes(to)) {
        throw new TransitionError(from, to, allowed(from), entityType);
      }
    },
    canTransition(from: State, to: State): boolean {
      return allowed(from).includes(to);
    },
    allowedTransitions(from: State): State[] {
      return allowed(from);
    },
  };
}
