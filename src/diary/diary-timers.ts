type TimerRecord = Record<string, unknown> & {
  type: 'timer';
  mode: 'timer' | 'datetime' | 'countup';
  deadlineAt?: string | null;
  alertedAt?: string | null;
};

const asTimer = (value: unknown): TimerRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const timer = value as TimerRecord;
  return timer.type === 'timer' ? timer : null;
};

export type ProcessedTimer = {
  decoratorIndex: number;
  deadlineAt: string;
  alertedAt: string;
};

export type TimerReconciliationResponse = {
  affectedChatboxIds: string[];
  ringingChatboxIds: string[];
  affectedMessages: Array<{
    messageId: string;
    chatboxId: string;
    decorators: unknown[];
    processedTimers: ProcessedTimer[];
  }>;
};

export const processOverdueTimers = (
  value: unknown,
  now: Date,
): { decorators: unknown[]; processedTimers: ProcessedTimer[] } => {
  const decorators: unknown[] = Array.isArray(value)
    ? (value as unknown[])
    : [];
  const processedTimers: ProcessedTimer[] = [];
  const updated = decorators.map((decorator, decoratorIndex) => {
    const timer = asTimer(decorator);
    if (
      !timer ||
      (timer.mode !== 'timer' && timer.mode !== 'datetime') ||
      typeof timer.deadlineAt !== 'string' ||
      timer.alertedAt
    ) {
      return decorator;
    }

    const deadline = Date.parse(timer.deadlineAt);
    if (!Number.isFinite(deadline) || deadline > now.getTime()) {
      return decorator;
    }

    const alertedAt = now.toISOString();
    processedTimers.push({
      decoratorIndex,
      deadlineAt: timer.deadlineAt,
      alertedAt,
    });
    return {
      ...timer,
      running: false,
      pause: true,
      durationMs: 0,
      alertedAt,
    };
  });

  return { decorators: updated, processedTimers };
};

/** A stale PATCH must not re-arm a deadline already claimed by reconciliation. */
export const preserveProcessedTimers = (
  incoming: unknown,
  persisted: unknown,
): unknown => {
  if (!Array.isArray(incoming) || !Array.isArray(persisted)) return incoming;

  const incomingDecorators = incoming as unknown[];
  const persistedDecorators = persisted as unknown[];
  return incomingDecorators.map((value, index) => {
    const next = asTimer(value);
    const current = asTimer(persistedDecorators[index]);
    if (
      !next ||
      !current ||
      !current.alertedAt ||
      next.mode !== current.mode ||
      next.deadlineAt !== current.deadlineAt
    ) {
      return value;
    }

    return {
      ...next,
      running: false,
      pause: true,
      durationMs: 0,
      alertedAt: current.alertedAt,
    };
  });
};
