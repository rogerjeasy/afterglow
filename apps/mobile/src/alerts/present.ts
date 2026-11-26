import type { alerts } from '@afterglow/core';
import { formatClockTime, formatDuration } from '../format';

/**
 * Alerts in plain words. The core decides what needs attention and carries the
 * number; this only says it. Durations are the core's minutes, floored by
 * `formatDuration`, so an alert never shows more time than the model has.
 */

export interface AlertText {
  readonly title: string;
  readonly body: string;
}

export function alertText(a: alerts.Alert): AlertText {
  const m = a.minutes ?? 0;
  switch (a.kind) {
    case 'help':
      return {
        title: `${a.subject} sent HELP`,
        body: `Heard at ${formatClockTime(a.sinceMs)}. Go to them if you safely can. If it is an emergency, call the emergency number: Afterglow is not an emergency service.`,
      };
    case 'foodPast':
      return {
        title: `${a.subject}: past its safe window`,
        body: `${formatDuration(m)} past it. Perishables should go. Open Cold to see which foods.`,
      };
    case 'foodSoon':
      return {
        title: `${a.subject}: ${formatDuration(m)} left`,
        body: 'After that, perishables must go. Keep the door shut: every opening shortens it.',
      };
    case 'homeReached':
      return {
        title: 'Your home may already be at its line',
        body: 'The early edge of the band has been reached. If someone here is frail, warm them now or go somewhere safer.',
      };
    case 'homeSoon':
      return {
        title: `Your home may reach its line in ${formatDuration(m)}`,
        body: 'That is the early edge of the band, not the average. Plan where to go before then.',
      };
    case 'outage':
      return {
        title: `Power out since ${formatClockTime(a.sinceMs)}`,
        body: 'I am watching your fridge, your home and your people, and I will say here when something needs you.',
      };
    case 'missedCheckIn':
      return m >= 2
        ? {
            title: `${a.subject} has missed ${m} check-ins`,
            body: `Nothing heard since the first one was due at ${formatClockTime(a.sinceMs)}. Go to them or send someone you trust, if you safely can. If it is an emergency, call the emergency number.`,
          }
        : {
            title: `${a.subject} is due to check in`,
            body: `Their check-in was due at ${formatClockTime(a.sinceMs)}. Send them a code, or mark them safe when you hear from them another way.`,
          };
    case 'comingBack':
      return {
        title: 'Power is coming back in your area',
        body: 'Phones nearby are charging again. Yours may follow soon.',
      };
  }
}
