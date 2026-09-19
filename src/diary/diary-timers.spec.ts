import { preserveProcessedTimers, processOverdueTimers } from './diary-timers';

const NOW = new Date('2026-09-19T12:00:00.000Z');

const timer = (
  mode: 'timer' | 'datetime' | 'countup',
  deadlineAt: string | null,
  alertedAt: string | null = null,
) => ({
  type: 'timer',
  mode,
  deadlineAt,
  alertedAt,
  running: true,
  pause: false,
  durationMs: 1000,
});

describe('Diary timer reconciliation', () => {
  it('processes overdue Countdown and Datetime, including disabled notification candidates', () => {
    const result = processOverdueTimers(
      [
        timer('timer', '2026-09-19T11:59:00.000Z'),
        timer('datetime', NOW.toISOString()),
        timer('countup', '2026-09-19T11:00:00.000Z'),
        timer('timer', '2026-09-19T12:01:00.000Z'),
        timer('timer', 'invalid'),
        timer('timer', null),
      ],
      NOW,
    );

    expect(result.processedTimers).toHaveLength(2);
    expect(result.processedTimers.map((item) => item.decoratorIndex)).toEqual([
      0, 1,
    ]);
    expect(result.decorators[0]).toMatchObject({
      running: false,
      pause: true,
      durationMs: 0,
      alertedAt: NOW.toISOString(),
    });
    expect(result.decorators[2]).toMatchObject({ alertedAt: null });
  });

  it('returns no timers on a second pass', () => {
    const first = processOverdueTimers(
      [timer('datetime', '2026-09-19T11:00:00.000Z')],
      NOW,
    );
    expect(processOverdueTimers(first.decorators, NOW).processedTimers).toEqual(
      [],
    );
  });

  it('keeps the processed state when a stale PATCH carries the same deadline', () => {
    const deadline = '2026-09-19T11:00:00.000Z';
    const persisted = processOverdueTimers([timer('timer', deadline)], NOW);
    const merged = preserveProcessedTimers(
      [timer('timer', deadline)],
      persisted.decorators,
    );
    expect((merged as object[])[0]).toMatchObject({
      running: false,
      alertedAt: NOW.toISOString(),
    });
  });

  it('allows a newly scheduled deadline to be unalerted', () => {
    const persisted = processOverdueTimers(
      [timer('timer', '2026-09-19T11:00:00.000Z')],
      NOW,
    );
    const next = timer('timer', '2026-09-19T12:30:00.000Z');
    expect(preserveProcessedTimers([next], persisted.decorators)).toEqual([
      next,
    ]);
  });
});
