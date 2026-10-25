// Ключ дня строим по местному времени: toISOString() мог бы сдвинуть дату в UTC.
export function dayKey(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localInput(iso: string) {
  const date = new Date(iso);
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function toUTC(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localInput(date.toISOString()) !== value) {
    throw new Error('Проверь дату и время. При переводе часов некоторые значения времени не существуют.');
  }
  return date.toISOString();
}

export const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const fullDate = (date: Date) => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
export const shortTime = (iso: string) => new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
