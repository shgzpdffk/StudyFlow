import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ApiError, type DataSource, type Deadline, type DeadlineInput, type Subject } from './api';
import { dayKey, deviceTimezone, fullDate, shortTime } from './dates';
import DeadlineDialog from './DeadlineDialog';

type Props = {
  source: DataSource;
  subjects: Subject[];
  demo: boolean;
  onExpired: (message: string) => void;
  onSubjects: () => void;
  onNotice: (message: string) => void;
};

export default function CalendarView({ source, subjects, demo, onExpired, onSubjects, onNotice }: Props) {
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [items, setItems] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [status, setStatus] = useState('all');
  const [editor, setEditor] = useState<{ item: Deadline | null } | null>(null);
  const [deleting, setDeleting] = useState<Deadline | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const expiryHandler = useRef(onExpired);
  expiryHandler.current = onExpired;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setActionError('');
    // API отдает страницы по 200 записей. Загружаем все, чтобы календарь не скрывал остальные.
    source.listDeadlines(controller.signal).then(data => {
      if (!controller.signal.aborted) setItems(data);
    }).catch(err => {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) expiryHandler.current(err.message);
      else setError(err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source, attempt]);

  function rememberFocus() { opener.current = document.activeElement as HTMLElement; }
  function restoreFocus() {
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else addButton.current?.focus();
    });
  }
  function closeEditor() { setEditor(null); restoreFocus(); }
  function pickDay(date: Date) {
    setSelected(dayKey(date));
    const firstDay = new Date(date);
    firstDay.setDate(1);
    setMonth(firstDay);
  }
  function moveMonth(delta: number) {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
    pickDay(next);
  }
  function handleFailure(err: unknown) {
    const message = err instanceof Error ? err.message : 'Не удалось сохранить изменения.';
    if (err instanceof ApiError && err.status === 401) onExpired(message);
    return message;
  }

  async function save(data: DeadlineInput) {
    try {
      const item = editor?.item
        ? await source.updateDeadline(editor.item.id, data)
        : await source.createDeadline(data);
      if (!mounted.current) return;
      setItems(current => [...current.filter(old => old.id !== item.id), item]);
      pickDay(new Date(item.due_at));
      setSubjectFilter('all'); setStatus('all'); setActionError('');
      onNotice(editor?.item ? 'Дедлайн обновлен' : 'Дедлайн добавлен');
    } catch (err) { if (mounted.current) setActionError(handleFailure(err)); throw err; }
  }

  async function mutate(item: Deadline, remove: boolean) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setActionError('');
    try {
      if (remove) {
        await source.deleteDeadline(item.id);
        if (!mounted.current) return;
        setItems(current => current.filter(old => old.id !== item.id));
        setDeleting(null); restoreFocus(); onNotice('Дедлайн удален');
      } else {
        const updated = await source.updateDeadline(item.id, { done: !item.done });
        if (!mounted.current) return;
        setItems(current => current.map(old => old.id === updated.id ? updated : old));
        onNotice(updated.done ? 'Задание выполнено. Отличная работа!' : 'Задание возвращено в работу');
      }
    } catch (err) { if (mounted.current) setActionError(handleFailure(err)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }

  const filtered = items.filter(item => (subjectFilter === 'all' || item.subject_id === Number(subjectFilter))
    && (status === 'all' || (status === 'done' ? item.done : status === 'overdue' ? !item.done && new Date(item.due_at).getTime() < now : !item.done)));
  const selectedItems = filtered.filter(item => dayKey(new Date(item.due_at)) === selected)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime() || a.id - b.id);
  const byDay = new Map<string, Deadline[]>();
  for (const item of filtered) {
    const key = dayKey(new Date(item.due_at));
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  const start = new Date(month);
  start.setDate(1 - (month.getDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; });
  const today = dayKey(new Date(now));
  const ready = !loading && !error;
  const hasFilters = subjectFilter !== 'all' || status !== 'all';
  const add = () => { rememberFocus(); setEditor({ item: null }); };

  return <section className="calendar-page" aria-label="Календарь дедлайнов" aria-busy={loading}>
    <div className="page-heading">
      <div><p className="eyebrow">ПЛАН НА СПОКОЙНЫЙ СЕМЕСТР</p><h1>Все успеется.</h1><p className="subtitle">Дедлайны на виду. В голове — чуть свободнее.</p></div>
      <button ref={addButton} className="button primary" disabled={!ready || !subjects.length} onClick={add}><Plus size={18} />Добавить дедлайн</button>
    </div>
    {!subjects.length && <div className="calendar-note"><BookHint /><div><strong>Сначала добавь дисциплину</strong><p>Каждое задание связано с одним из твоих предметов.</p></div><button className="button secondary" onClick={onSubjects}>К дисциплинам</button></div>}
    <div className="calendar-toolbar">
      <div><label htmlFor="filter-subject">Дисциплина</label><select id="filter-subject" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)} disabled={!ready}>
        <option value="all">Все дисциплины</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
      </select></div>
      <div><label htmlFor="filter-status">Статус</label><select id="filter-status" value={status} onChange={event => setStatus(event.target.value)} disabled={!ready}>
        <option value="all">Все задания</option><option value="pending">В работе</option><option value="done">Выполненные</option><option value="overdue">Просроченные</option>
      </select></div>
      <p className="timezone-note">Местное время<br /><strong>{deviceTimezone}</strong></p>
    </div>
    {loading ? <div className="calendar-loading skeleton" role="status">Загружаем дедлайны…</div>
      : error ? <div className="empty-state error-state" role="alert"><CalendarDays size={28} /><h3>Не удалось загрузить календарь</h3><p>{error}</p><button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Попробовать снова</button></div>
      : <>
        <div className="calendar-layout">
          <div className="month-panel">
            <div className="month-heading"><h2 aria-live="polite">{new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(month)}</h2><div className="month-controls">
              <button className="today-button" onClick={() => pickDay(new Date())}>Сегодня</button>
              <button className="icon-button" aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}><ChevronLeft size={20} /></button>
              <button className="icon-button" aria-label="Следующий месяц" onClick={() => moveMonth(1)}><ChevronRight size={20} /></button>
            </div></div>
            <div className="weekdays" aria-hidden="true">{['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(day => <span key={day}>{day}</span>)}</div>
            <div className="month-grid" role="group" aria-label="Дни месяца">
              {days.map(date => {
                const key = dayKey(date);
                const list = byDay.get(key) ?? [];
                const overdue = list.some(item => !item.done && new Date(item.due_at).getTime() < now);
                return <button key={key} aria-label={`${fullDate(date)}; заданий: ${list.length}`} aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined}
                  className={`day-cell ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === selected ? 'selected' : ''} ${key === today ? 'is-today' : ''}`}
                  disabled={date.getFullYear() < 1 || date.getFullYear() > 9999} onClick={() => pickDay(date)}>
                  <span className="day-number">{date.getDate()}</span>
                  {list.length > 0 && <span className={`day-count ${overdue ? 'overdue' : list.every(item => item.done) ? 'all-done' : ''}`}><span />{list.length}<span className="day-count-label"> задан.</span></span>}
                </button>;
              })}
            </div>
            <div className="calendar-legend"><span><i />В работе</span><span><i className="overdue" />Просрочено</span><span><i className="all-done" />Выполнено</span></div>
          </div>
          <aside className="agenda-panel" aria-label="Задания на выбранный день">
            <p className="eyebrow">{selected === today ? 'СЕГОДНЯ' : 'ВЫБРАННЫЙ ДЕНЬ'}</p>
            <h2>{fullDate(new Date(`${selected}T12:00`))}</h2>
            <p className="agenda-count">Заданий: {selectedItems.length}</p>
            {!selectedItems.length ? <div className="agenda-empty"><CalendarDays size={32} /><h3>{hasFilters ? 'Нет подходящих заданий' : 'День без дедлайнов'}</h3><p>{hasFilters ? 'Измени фильтры или выбери другую дату.' : 'Можно выдохнуть — или запланировать следующий шаг.'}</p>{hasFilters ? <button className="text-button" onClick={() => { setSubjectFilter('all'); setStatus('all'); }}>Сбросить фильтры</button> : subjects.length > 0 && <button className="text-button" onClick={add}>Добавить задание <Plus size={16} /></button>}</div>
              : <div className="agenda-list">{selectedItems.map(item => {
                const overdue = !item.done && new Date(item.due_at).getTime() < now;
                return <article key={item.id} className={`deadline-card ${item.done ? 'completed' : ''}`}>
                  <div className="deadline-meta"><time dateTime={item.due_at}>{shortTime(item.due_at)}</time><span className={`deadline-status ${overdue ? 'late' : ''}`}>{item.done ? 'Выполнено' : overdue ? 'Просрочено' : 'В работе'}</span></div>
                  <h3>{item.title}</h3><p className="deadline-subject">{subjects.find(subject => subject.id === item.subject_id)?.name ?? 'Дисциплина недоступна'}</p>
                  <div className="deadline-actions">
                    <button className="completion-button" disabled={busy} aria-label={`${item.done ? 'Вернуть в работу' : 'Выполнить'}: ${item.title}`} onClick={() => void mutate(item, false)}>{item.done ? <RotateCcw size={15} /> : <Check size={16} />}{item.done ? 'Вернуть' : 'Готово'}</button>
                    <button className="icon-button" disabled={busy} aria-label={`Изменить: ${item.title}`} onClick={() => { rememberFocus(); setEditor({ item }); }}><Pencil size={16} /></button>
                    <button className="icon-button" disabled={busy} aria-label={`Удалить: ${item.title}`} onClick={() => { rememberFocus(); setActionError(''); setDeleting(item); }}><Trash2 size={16} /></button>
                  </div>
                </article>;
              })}</div>}
          </aside>
        </div>
        {actionError && !deleting && <div className="calendar-action-error" role="alert">{actionError}<button className="text-button" onClick={() => setAttempt(value => value + 1)}>Обновить календарь</button></div>}
      </>}
    {editor && <DeadlineDialog item={editor.item} day={selected} subjects={subjects} demo={demo} onSave={save} onClose={closeEditor} />}
    {deleting && <DeleteDialog item={deleting} busy={busy} error={actionError} onClose={() => { setDeleting(null); setActionError(''); restoreFocus(); }} onDelete={() => void mutate(deleting, true)} />}
  </section>;
}

function BookHint() { return <CalendarDays size={24} />; }

function DeleteDialog({ item, busy, error, onClose, onDelete }: { item: Deadline; busy: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); cancel.current?.focus(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="subject-dialog" aria-labelledby="delete-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><span className="eyebrow">УДАЛЕНИЕ ЗАДАНИЯ</span><button className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <h2 id="delete-title">Удалить дедлайн?</h2><p className="delete-description">«{item.title}» исчезнет из календаря. Отменить удаление не получится.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="confirm-actions"><button ref={cancel} className="button secondary" disabled={busy} onClick={onClose}>Оставить</button><button className="button danger" disabled={busy} onClick={onDelete}>{busy ? 'Удаляем…' : 'Удалить дедлайн'}</button></div>
  </dialog>;
}
