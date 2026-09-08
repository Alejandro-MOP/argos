import type { OpeningRangeWindow } from './OrbFvgMath';

const NEW_YORK_TIMEZONE = 'America/New_York';

export class OrbFvgSessionService {
  public getSessionWindow(sessionDate: string): OpeningRangeWindow {
    const [year, month, day] = sessionDate.split('-').map(Number);

    return {
      sessionDate,
      startsAt: zonedLocalTimeToUtc(year, month, day, 9, 30, NEW_YORK_TIMEZONE),
      endsAt: zonedLocalTimeToUtc(year, month, day, 9, 45, NEW_YORK_TIMEZONE),
      regularSessionEndsAt: zonedLocalTimeToUtc(year, month, day, 16, 0, NEW_YORK_TIMEZONE),
    };
  }

  public getCurrentSessionWindow(now = new Date()): OpeningRangeWindow | undefined {
    const parts = getZonedParts(now, NEW_YORK_TIMEZONE);

    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
      return undefined;
    }

    const sessionDate = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;

    return this.getSessionWindow(sessionDate);
  }

  public isAfterOpeningRange(window: OpeningRangeWindow, now = new Date()): boolean {
    return now.getTime() >= window.endsAt.getTime();
  }

  public isRegularSessionActive(window: OpeningRangeWindow, now = new Date()): boolean {
    const timestamp = now.getTime();
    return timestamp >= window.startsAt.getTime() && timestamp < window.regularSessionEndsAt.getTime();
  }

  public formatEt(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: NEW_YORK_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).format(date);
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '0';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  };
};

const zonedLocalTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date => {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  for (let index = 0; index < 3; index += 1) {
    const parts = getZonedParts(utc, timeZone);
    const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    const expectedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const diff = actualAsUtc - expectedAsUtc;
    if (diff === 0) {
      break;
    }
    utc = new Date(utc.getTime() - diff);
  }

  return utc;
};

const pad = (value: number): string => String(value).padStart(2, '0');
