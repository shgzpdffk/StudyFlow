import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { Deadline, DeadlineInput, Subject } from './api';
import { deviceTimezone, localInput, toUTC } from './dates';

type Props = {
  item: Deadline | null;
  day: string;
  subjects: Subject[];
  demo: boolean;
  onSave: (data: DeadlineInput) => Promise<void>;
  onClose: () => void;
};

export default function DeadlineDialog({ item, day, subjects, demo, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [title, setTitle] = useState(item?.title ?? '');
  const [subjectId, setSubjectId] = useState(item?.subject_id ?? subjects[0]?.id ?? 0);
  const [dueAt, setDueAt] = useState(item ? localInput(item.due_at) : `${day}T18:00`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.focus();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (!title.trim()) { setError('Напиши название задания.'); return; }
    if (!subjects.some(subject => subject.id === subjectId)) { setError('Выбери дисциплину.'); return; }
    let utc: string;
    try {
      // Не меняем секунды исходной записи, если пользователь меняет только название.
      utc = item && dueAt === localInput(item.due_at) ? item.due_at : toUTC(dueAt);
    } catch (err) { setError((err as Error).message); return; }
    submitting.current = true;
    setBusy(true);
    try {
      await onSave({ title: title.trim(), subject_id: subjectId, due_at: utc });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить дедлайн.');
    } finally { submitting.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} className="subject-dialog deadline-dialog" aria-labelledby="deadline-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading">
      <span className="eyebrow">ВСЕМУ СВОЕ ВРЕМЯ</span>
      <button className="icon-button" aria-label="Закрыть" onClick={onClose} disabled={busy}><X size={20} /></button>
    </div>
    <h2 id="deadline-dialog-title">{item ? 'Изменить дедлайн' : 'Новый дедлайн'}</h2>
    <p className="muted">Один понятный шаг к готовой работе.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="deadline-title">Название задания</label>
        <input ref={input} id="deadline-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Например, сдать лабораторную" />
        <div className="field-hint"><span>До 200 символов</span><span>{title.length}/200</span></div>
        <label htmlFor="deadline-subject">Дисциплина</label>
        <select id="deadline-subject" value={subjectId} onChange={event => setSubjectId(Number(event.target.value))}>
          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <label htmlFor="deadline-date">Дата и время</label>
        <input id="deadline-date" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} required min="0001-01-01T00:00" max="9999-12-31T23:59" />
        <p className="field-hint">Часовой пояс: {deviceTimezone}. Можно указать прошедшую дату.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {demo && <p className="demo-note">Демо: изменения останутся только в этом примере.</p>}
        <button className="button primary wide">{busy ? 'Сохраняем…' : item ? 'Сохранить изменения' : 'Добавить дедлайн'}<Check size={17} /></button>
      </fieldset>
    </form>
  </dialog>;
}
