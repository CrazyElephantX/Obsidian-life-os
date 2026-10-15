/** Канонические пути vault (PARA). */

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function dailyNotePath(d: Date): string {
  return `1. Проекты/diary/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${d.getFullYear()}-${pad(
    d.getMonth() + 1
  )}-${pad(d.getDate())}.md`;
}

export function monthlyNotePath(d: Date): string {
  const m = pad(d.getMonth() + 1);
  return `1. Проекты/diary/${d.getFullYear()}/${m}/${d.getFullYear()}-${m} ${MONTH_NAMES[d.getMonth()]}.md`;
}

export function todayStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sessionIdFor(agent: string, d: Date): string {
  return `lifeos-${todayStr(d)}-${agent}`;
}