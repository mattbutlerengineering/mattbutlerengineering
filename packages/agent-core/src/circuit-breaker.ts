/**
 * packages/agent-core/src/circuit-breaker.ts
 * Circuit breaker implementation for AI API requests.
 */

export enum CircuitState {
  Closed = "CLOSED",
  Open = "OPEN",
  HalfOpen = "HALF_OPEN",
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  onStateChange?: (state: CircuitState, error?: Error) => void;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failures: number = 0;
  private lastError?: Error;
  private openedAt?: number;

  constructor(private options: CircuitBreakerOptions) {}

  public getState(): CircuitState {
    this.checkReset();
    return this.state;
  }

  public async wrap<T>(fn: () => Promise<T>): Promise<T> {
    this.checkReset();

    if (this.state === CircuitState.Open) {
      throw new Error(`Circuit breaker is OPEN. Last error: ${this.lastError?.message}`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private recordSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.transitionTo(CircuitState.Closed);
    }
    this.failures = 0;
    this.lastError = undefined;
  }

  private recordFailure(error: Error): void {
    this.failures++;
    this.lastError = error;

    if (this.state === CircuitState.HalfOpen || this.failures >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.Open, error);
    }
  }

  private transitionTo(newState: CircuitState, error?: Error): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.Open) {
      this.openedAt = Date.now();
    }

    if (this.options.onStateChange && oldState !== newState) {
      this.options.onStateChange(newState, error);
    }
  }

  private checkReset(): void {
    if (this.state === CircuitState.Open && this.openedAt) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.options.resetTimeoutMs) {
        this.transitionTo(CircuitState.HalfOpen);
      }
    }
  }
}
