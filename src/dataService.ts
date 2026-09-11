import peopleData from './data/people.json';
import dynastiesData from './data/dynasties.json';
import eventsData from './data/events.json';
import type { Person, Dynasty, HistoricalEvent } from './types';

const allPeople: Person[] = peopleData as Person[];
const allDynasties: Dynasty[] = dynastiesData as Dynasty[];
const allEvents: HistoricalEvent[] = eventsData as HistoricalEvent[];

export function getAllPeople(): Person[] {
  return allPeople;
}

export function getAllDynasties(): Dynasty[] {
  return allDynasties;
}

export function getAllEvents(): HistoricalEvent[] {
  return allEvents;
}

export function searchPeople(keyword: string): Person[] {
  if (!keyword.trim()) return [];
  const lower = keyword.toLowerCase().trim();
  return allPeople.filter((p) => {
    if (p.name.toLowerCase().includes(lower)) return true;
    if (p.aliases.some((a) => a.toLowerCase().includes(lower))) return true;
    if (p.dynasty.toLowerCase().includes(lower)) return true;
    if (p.field.toLowerCase().includes(lower)) return true;
    return false;
  });
}

export function searchEvents(keyword: string): HistoricalEvent[] {
  if (!keyword.trim()) return [];
  const lower = keyword.toLowerCase().trim();
  return allEvents.filter((e) => {
    if (e.name.toLowerCase().includes(lower)) return true;
    if (e.aliases.some((a) => a.toLowerCase().includes(lower))) return true;
    if (e.category.toLowerCase().includes(lower)) return true;
    if (e.location.toLowerCase().includes(lower)) return true;
    if (e.description.toLowerCase().includes(lower)) return true;
    return false;
  });
}

export function getPersonById(id: string): Person | undefined {
  return allPeople.find((p) => p.id === id);
}

export function getEventById(id: string): HistoricalEvent | undefined {
  return allEvents.find((e) => e.id === id);
}

export function formatYear(year: number, approx: boolean = false): string {
  let result = '';
  if (year < 0) {
    result = `公元前${Math.abs(year)}年`;
  } else {
    result = `公元${year}年`;
  }
  if (approx) result = '约' + result;
  return result;
}

export function getDynastyAtYear(year: number): Dynasty | null {
  for (const d of allDynasties) {
    if (year >= d.start && year <= d.end) {
      return d;
    }
  }
  return null;
}
