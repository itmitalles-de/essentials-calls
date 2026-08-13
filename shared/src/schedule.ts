import { ScheduleNode, ScheduleWeekday } from './types';

const WEEKDAY: Record<string, ScheduleWeekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function localParts(instant: Date, timezone: string): {
  date: string;
  weekday: ScheduleWeekday;
  minutes: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

/** Deterministic mirror of the generated Asterisk schedule decision. */
export function isScheduleOpen(schedule: ScheduleNode, instant: Date): boolean {
  const current = localParts(instant, schedule.properties.timezone);
  if (schedule.properties.holidays.includes(current.date)) return false;

  const previousWeekday = current.weekday === 1 ? 7 : ((current.weekday - 1) as ScheduleWeekday);
  return schedule.properties.windows.some((window) => {
    const start = minutes(window.start);
    const end = minutes(window.end);
    if (start < end) {
      return window.weekdays.includes(current.weekday) && current.minutes >= start && current.minutes < end;
    }
    return (
      (window.weekdays.includes(current.weekday) && current.minutes >= start) ||
      (window.weekdays.includes(previousWeekday) && current.minutes < end)
    );
  });
}
