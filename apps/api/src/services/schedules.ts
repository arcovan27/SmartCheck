const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function buildScheduleInterval(date: string, startTime: string, endTime: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data de escala invalida");
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) throw new Error("Horario de escala invalido");
  const startAt = new Date(`${date}T${startTime}:00-03:00`);
  const endAt = new Date(`${date}T${endTime}:00-03:00`);
  const crossesMidnight = endAt <= startAt;
  if (crossesMidnight) endAt.setUTCDate(endAt.getUTCDate() + 1);
  return { startAt, endAt, crossesMidnight };
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export function enumerateScheduleDates(startDate: string, endDate: string, weekdays?: number[]) {
  const start = new Date(`${startDate}T12:00:00-03:00`);
  const end = new Date(`${endDate}T12:00:00-03:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    throw new Error("Periodo de recorrencia invalido");
  }
  const daySpan = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (daySpan > 366) throw new Error("A recorrencia nao pode ultrapassar 366 dias");
  const allowed = weekdays?.length ? new Set(weekdays) : null;
  const dates: string[] = [];
  for (let offset = 0; offset <= daySpan; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const dateKey = date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const weekday = new Date(`${dateKey}T12:00:00-03:00`).getDay();
    if (!allowed || allowed.has(weekday)) dates.push(dateKey);
  }
  return dates;
}
