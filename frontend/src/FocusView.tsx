import { useEffect, useRef, useState } from 'react';
import { ArrowDown, BookOpen, Clock3, Play, RefreshCw, Square } from 'lucide-react';
import { ApiError, type DataSource, type StudySession, type Subject } from './api';
import { deviceTimezone, fullDate, shortTime } from './dates';
import useStudyTimer, { formatDuration } from './useStudyTimer';

type Props = { source: DataSource; subjects: Subject[]; onExpired: (message: string) => void; onSubjects: () => void };

export default function FocusView({ source, subjects, onExpired, onSubjects }: Props) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? 0);
  const [revision, setRevision] = useState(0);
  const timer = useStudyTimer(source, onExpired, () => setRevision(value => value + 1));
  const activeName = subjects.find(subject => subject.id === timer.active?.subject_id)?.name ?? 'Дисциплина недоступна';
  const selectedId = subjects.some(subject => subject.id === subjectId) ? subjectId : subjects[0]?.id ?? 0;

  return <section className="focus-page" aria-label="Учебный таймер">
    <div className="page-heading"><div><p className="eyebrow">ОДНО ДЕЛО. ПОЛНОЕ ВНИМАНИЕ.</p><h1>Время сосредоточиться.</h1><p className="subtitle">Выбери предмет. Остальное подождет.</p></div><span className="edition">ТВОЙ УЧЕБНЫЙ РИТМ</span></div>
    <div className="focus-layout">
      <section className={`timer-panel ${timer.active ? 'running' : ''}`} aria-label="Таймер занятия">
        <div className="timer-top"><span className="pill"><span />{timer.active ? 'ЗАНЯТИЕ ИДЕТ' : 'ВРЕМЯ ДЛЯ ФОКУСА'}</span><Clock3 size={24} strokeWidth={1.3} /></div>
        <p className="timer-subject">{timer.active ? activeName : 'Твой следующий маленький шаг'}</p>
        <div className="timer-digits" role="timer" aria-label="Длительность занятия" aria-live="off">{formatDuration(timer.seconds)}</div>
        <p className="timer-caption">{timer.active ? `Начало: ${fullDate(new Date(timer.active.started_at))}, ${shortTime(timer.active.started_at)}` : timer.verified ? 'Начни, когда будешь готов' : 'Проверяем активное занятие'}</p>
        {timer.active ? <button className="button timer-button" disabled={timer.busy || !timer.verified || timer.syncing} onClick={timer.stop}><Square size={15} fill="currentColor" />{timer.busy ? 'Сохраняем…' : 'Завершить занятие'}</button>
          : <div className="timer-start"><label htmlFor="focus-subject">Чему уделим время?</label><select id="focus-subject" value={selectedId} onChange={event => setSubjectId(Number(event.target.value))} disabled={timer.busy || !subjects.length}>
            {!subjects.length && <option value={0}>Сначала добавь дисциплину</option>}
            {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select><button className="button timer-button" disabled={!timer.verified || timer.syncing || timer.busy || !selectedId} onClick={() => timer.start(selectedId)}><Play size={17} fill="currentColor" />{timer.busy ? 'Запускаем…' : 'Начать занятие'}</button></div>}
        <p className="timer-sync" role="status">{timer.busy ? 'Подтверждаем действие на сервере' : timer.syncing ? 'Сверяем таймер с сервером…' : timer.verified ? timer.active ? 'Можно закрыть приложение — занятие продолжится' : 'Все готово к началу' : 'Нет подтверждения от сервера'}</p>
      </section>
      <aside className="focus-guide"><span className="focus-guide-icon"><BookOpen size={25} /></span><p className="eyebrow">В СВОЕМ РИТМЕ</p><h2>Меньше переключений.<br />Больше внимания.</h2><p>Одна дисциплина и одно занятие за раз. Даже двадцать минут — уже время, вложенное в себя.</p><div className="focus-guide-rule" /><strong>Закончил? Останови таймер.</strong><p>Закрытие приложения не завершает занятие. После остановки оно появится в истории ниже.</p><a href="#session-history">К истории занятий <ArrowDown size={15} /></a></aside>
    </div>
    {!subjects.length && !timer.active && <div className="calendar-note focus-note"><BookOpen size={24} /><div><strong>Сначала добавь дисциплину</strong><p>Занятие должно быть связано с предметом.</p></div><button className="button secondary" onClick={onSubjects}>К дисциплинам</button></div>}
    {timer.error && <div className="focus-error" role="alert"><p>{timer.error}</p><p>Если ответ потерялся, действие могло сохраниться. На экране показано последнее подтвержденное состояние; сверить его можно кнопкой.</p></div>}
    <div className="timer-refresh"><span>Для перерыва заверши занятие. Паузы пока нет.</span><button className="text-button" disabled={timer.syncing || timer.busy} onClick={timer.refresh}><RefreshCw size={14} />Обновить таймер</button></div>
    <SessionHistory key={revision} source={source} subjects={subjects} onExpired={onExpired} />
  </section>;
}

function SessionHistory({ source, subjects, onExpired }: Omit<Props, 'onSubjects'>) {
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<StudySession[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const expiry = useRef(onExpired);
  expiry.current = onExpired;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    source.listSessions(offset, filter === 'all' ? undefined : Number(filter), controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(current => [...new Map([...(offset ? current : []), ...page].map(item => [item.id, item])).values()]);
        setMore(page.length === 20);
      }).catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) expiry.current(err.message);
        else setError(err.message);
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [source, filter, offset, attempt]);

  return <section id="session-history" className="session-history" aria-busy={loading}>
    <div className="section-heading"><div><h2>История занятий</h2><p>Завершенные занятия, от новых к старым. Время: {deviceTimezone}.</p></div><button className="text-button" disabled={loading} onClick={() => { setOffset(0); setAttempt(value => value + 1); }}><RefreshCw size={14} />Обновить историю</button></div>
    <div className="history-filter"><label htmlFor="history-subject">Дисциплина в истории</label><select id="history-subject" value={filter} onChange={event => { setFilter(event.target.value); setOffset(0); setItems([]); setMore(false); }}><option value="all">Все дисциплины</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div>
    {items.length > 0 && <div className="history-list">{items.map(item => <article className="session-row" key={item.id}><span className="session-icon"><BookOpen size={20} /></span><div className="session-description"><h3>{subjects.find(subject => subject.id === item.subject_id)?.name ?? 'Дисциплина недоступна'}</h3><p><time dateTime={item.started_at}>{fullDate(new Date(item.started_at))}, {shortTime(item.started_at)}</time><span> → </span><time dateTime={item.ended_at!}>{fullDate(new Date(item.ended_at!))}, {shortTime(item.ended_at!)}</time></p></div><div className="session-duration"><strong>{formatDuration(item.duration_seconds)}</strong><span>время занятия</span></div></article>)}</div>}
    {loading && <p className="history-loading" role="status">Загружаем занятия…</p>}
    {error && <div className="focus-error" role="alert"><p>{error}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>Повторить загрузку истории</button></div>}
    {!loading && !error && !items.length && <div className="empty-state"><Clock3 size={30} /><h3>{filter === 'all' ? 'Здесь начнется твоя история' : 'По этому предмету пока пусто'}</h3><p>Заверши первое занятие — сохраним его длительность здесь.</p></div>}
    {!loading && !error && more && <button className="button secondary history-more" onClick={() => setOffset(value => value + 20)}>Показать еще</button>}
  </section>;
}
