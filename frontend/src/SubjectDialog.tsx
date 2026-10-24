import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, X } from 'lucide-react';

export default function SubjectDialog({ onClose, onCreate, demo }: {
  onClose: () => void; onCreate: (name: string) => Promise<void>; demo: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    // Фокус ставим после открытия: при повторном эффекте React autofocus недостаточно.
    input.current?.focus();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim()) { setError('Напиши название дисциплины.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { await onCreate(name.trim()); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить дисциплину.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="subject-dialog" aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><span className="eyebrow">ТВОЙ УЧЕБНЫЙ ПЛАН</span><button className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <h2 id="dialog-title">Новая дисциплина</h2>
    <p className="muted">Добавь предмет, который изучаешь сейчас.</p>
    <form onSubmit={submit}>
      <label htmlFor="subject-name">Название</label>
      <input ref={input} id="subject-name" autoFocus value={name} onChange={e => { setName(e.target.value); setError(''); }} maxLength={80} placeholder="Например, линейная алгебра" aria-invalid={!!error} aria-describedby={error ? 'form-error' : 'name-hint'} disabled={busy} />
      <div id="name-hint" className="field-hint"><span>До 80 символов</span><span>{name.length}/80</span></div>
      {error && <p id="form-error" className="form-error" role="alert">{error}</p>}
      {demo && <p className="demo-note">Демо: предмет добавится только в этот пример.</p>}
      <button className="button primary wide" disabled={busy}>{busy ? 'Сохраняем…' : 'Добавить дисциплину'}<ArrowUpRight size={18} /></button>
    </form>
  </dialog>;
}
