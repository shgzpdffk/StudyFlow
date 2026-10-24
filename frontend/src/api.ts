export type Subject = { id: number; name: string };
export type User = { id: number; telegram_id: number; name: string };
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
    if (response.status === 422) throw new ApiError('Проверь название: от 1 до 80 символов, не только пробелы.', 422);
    throw new ApiError('Не получилось выполнить запрос. Попробуй еще раз.', response.status);
  }
  return response.json() as Promise<T>;
}

export interface DataSource {
  load(signal: AbortSignal): Promise<Workspace>;
  create(name: string): Promise<Subject>;
}

export function telegramSource(initData: string): DataSource {
  return {
    async load(signal) {
      const [user, subjects] = await Promise.all([
        request<User>('/me', initData, { signal }), request<Subject[]>('/subjects', initData, { signal }),
      ]);
      return { user, subjects };
    },
    create(name) { return request<Subject>('/subjects', initData, { method: 'POST', body: JSON.stringify({ name }) }); },
  };
}

export function demoSource(): DataSource {
  // Демо изолировано от API: примерные данные живут только в памяти страницы.
  const subjects = ['Математический анализ', 'Программирование', 'Английский язык', 'Физика'].map((name, i) => ({ id: i + 1, name }));
  return {
    async load() { return { user: { id: 0, telegram_id: 0, name: 'Студент' }, subjects: [...subjects] }; },
    async create(name) {
      const subject = { id: subjects.length + 1, name };
      subjects.push(subject);
      return subject;
    },
  };
}
