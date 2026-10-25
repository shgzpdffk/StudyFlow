export type Subject = { id: number; name: string };
export type User = { id: number; telegram_id: number; name: string };
export type Deadline = { id: number; subject_id: number; title: string; due_at: string; done: boolean };
export type DeadlineInput = Pick<Deadline, 'subject_id' | 'title' | 'due_at'>;
export type DeadlinePatch = Partial<DeadlineInput & { done: boolean }>;
export type StudySession = { id: number; subject_id: number; started_at: string; ended_at: string | null; duration_seconds: number };
export type Workspace = { user: User; subjects: Subject[] };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, initData: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}`, ...options.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Не удалось связаться с сервером. Проверь соединение и попробуй еще раз.', 0);
  }
  if (!response.ok) {
    if (response.status === 401) throw new ApiError('Сессия закончилась. Закрой Mini App и открой его заново через бота.', 401);
    if (response.status === 503) throw new ApiError('Сервер пока не готов к входу через Telegram. Попробуй позже.', 503);
    if (response.status === 409) throw new ApiError('Уже есть активное занятие. Загружаем его состояние.', 409);
    if (response.status === 404 && path.startsWith('/sessions')) throw new ApiError('Занятие или дисциплина недоступны. Обнови таймер и список предметов.', 404);
    if (response.status === 422 && path.startsWith('/sessions')) throw new ApiError('Выбери доступную дисциплину для занятия.', 422);
    if (response.status === 404) throw new ApiError('Задание или дисциплина больше не доступны. Обнови календарь.', 404);
    if (response.status === 422) throw new ApiError(path.startsWith('/deadlines') ? 'Проверь название (до 200 символов), дисциплину и дату задания.' : 'Проверь название: от 1 до 80 символов, не только пробелы.', 422);
    throw new ApiError('Не получилось выполнить запрос. Попробуй еще раз.', response.status);
  }
  // DELETE возвращает 204 без JSON в ответе.
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface DataSource {
  load(signal: AbortSignal): Promise<Workspace>;
  create(name: string): Promise<Subject>;
  listDeadlines(signal: AbortSignal): Promise<Deadline[]>;
  createDeadline(data: DeadlineInput): Promise<Deadline>;
  updateDeadline(id: number, data: DeadlinePatch): Promise<Deadline>;
  deleteDeadline(id: number): Promise<void>;
  activeSession(signal: AbortSignal): Promise<StudySession | null>;
  startSession(subjectId: number): Promise<StudySession>;
  stopSession(id: number): Promise<StudySession>;
  listSessions(offset: number, subjectId: number | undefined, signal: AbortSignal): Promise<StudySession[]>;
}

export function telegramSource(initData: string): DataSource {
  return {
    activeSession(signal) { return request<StudySession | null>('/sessions/active', initData, { signal }); },
    startSession(subjectId) { return request<StudySession>('/sessions/start', initData, { method: 'POST', body: JSON.stringify({ subject_id: subjectId }) }); },
    stopSession(id) { return request<StudySession>(`/sessions/${id}/stop`, initData, { method: 'POST' }); },
    listSessions(offset, subjectId, signal) {
      const query = new URLSearchParams({ completed: 'true', limit: '20', offset: String(offset) });
      if (subjectId !== undefined) query.set('subject_id', String(subjectId));
      return request<StudySession[]>(`/sessions?${query}`, initData, { signal });
    },
    async load(signal) {
      const [user, subjects] = await Promise.all([
        request<User>('/me', initData, { signal }), request<Subject[]>('/subjects', initData, { signal }),
      ]);
      return { user, subjects };
    },
    create(name) { return request<Subject>('/subjects', initData, { method: 'POST', body: JSON.stringify({ name }) }); },
    async listDeadlines(signal) {
      const items: Deadline[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await request<Deadline[]>(`/deadlines?limit=200&offset=${offset}`, initData, { signal });
        items.push(...page);
        if (page.length < 200) break;
      }
      return [...new Map(items.map(item => [item.id, item])).values()];
    },
    createDeadline(data) { return request<Deadline>('/deadlines', initData, { method: 'POST', body: JSON.stringify(data) }); },
    updateDeadline(id, data) { return request<Deadline>(`/deadlines/${id}`, initData, { method: 'PATCH', body: JSON.stringify(data) }); },
    deleteDeadline(id) { return request<void>(`/deadlines/${id}`, initData, { method: 'DELETE' }); },
  };
}

export function demoSource(): DataSource {
  // Демо изолировано от API: примерные данные живут только в памяти страницы.
  const subjects = ['Математический анализ', 'Программирование', 'Английский язык', 'Физика'].map((name, i) => ({ id: i + 1, name }));
  const at = (offset: number, hour: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset); date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  let deadlines: Deadline[] = [
    { id: 1, subject_id: 1, title: 'Разобрать задачи к семинару', due_at: at(0, 18), done: false },
    { id: 2, subject_id: 2, title: 'Сдать лабораторную работу', due_at: at(0, 23), done: false },
    { id: 3, subject_id: 3, title: 'Подготовить презентацию', due_at: at(3, 12), done: false },
    { id: 4, subject_id: 4, title: 'Решить задачи по механике', due_at: at(-2, 17), done: true },
    { id: 5, subject_id: 1, title: 'Повторить пределы', due_at: at(-1, 16), done: false },
  ];
  let nextDeadlineId = 6;
  // Демо-таймер хранит начало в памяти источника, а не в состоянии экрана.
  let sessions: StudySession[] = [
    { id: 1, subject_id: 1, started_at: at(-1, 15), ended_at: at(-1, 16), duration_seconds: 3600 },
    { id: 2, subject_id: 2, started_at: at(-2, 10), ended_at: at(-2, 11), duration_seconds: 3600 },
  ];
  let nextSessionId = 3;
  const elapsed = (item: StudySession): StudySession => ({ ...item, duration_seconds: Math.max(0, Math.floor(((item.ended_at ? new Date(item.ended_at).getTime() : Date.now()) - new Date(item.started_at).getTime()) / 1000)) });
  return {
    async activeSession() { const item = sessions.find(item => !item.ended_at); return item ? elapsed(item) : null; },
    async startSession(subjectId) {
      if (sessions.some(item => !item.ended_at)) throw new ApiError('Уже есть активное занятие.', 409);
      if (!subjects.some(subject => subject.id === subjectId)) throw new ApiError('Дисциплина недоступна.', 404);
      const item: StudySession = { id: nextSessionId++, subject_id: subjectId, started_at: new Date().toISOString(), ended_at: null, duration_seconds: 0 };
      sessions.unshift(item); return { ...item };
    },
    async stopSession(id) {
      const item = sessions.find(item => item.id === id);
      if (!item) throw new ApiError('Занятие недоступно.', 404);
      if (!item.ended_at) item.ended_at = new Date(Math.max(Date.now(), new Date(item.started_at).getTime())).toISOString();
      return elapsed(item);
    },
    async listSessions(offset, subjectId) {
      return sessions.filter(item => item.ended_at && (subjectId === undefined || item.subject_id === subjectId))
        .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id - a.id).slice(offset, offset + 20).map(elapsed);
    },
    async listDeadlines() { return [...deadlines]; },
    async createDeadline(data) {
      const item = { ...data, id: nextDeadlineId++, done: false };
      deadlines.push(item); return item;
    },
    async updateDeadline(id, data) {
      const old = deadlines.find(item => item.id === id);
      if (!old) throw new ApiError('Задание больше не доступно. Обнови календарь.', 404);
      const updated = { ...old, ...data };
      deadlines = deadlines.map(item => item.id === id ? updated : item);
      return updated;
    },
    async deleteDeadline(id) { deadlines = deadlines.filter(item => item.id !== id); },
    async load() { return { user: { id: 0, telegram_id: 0, name: 'Студент' }, subjects: [...subjects] }; },
    async create(name) {
      const subject = { id: subjects.length + 1, name };
      subjects.push(subject);
      return subject;
    },
  };
}
