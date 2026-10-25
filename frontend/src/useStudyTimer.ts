import { useEffect, useRef, useState } from 'react';
import { ApiError, type DataSource, type StudySession } from './api';

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export default function useStudyTimer(source: DataSource, onExpired: (message: string) => void, onHistoryRefresh: () => void) {
  const [active, setActive] = useState<StudySession | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [verified, setVerified] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const callbacks = useRef({ onExpired, onHistoryRefresh });
  callbacks.current = { onExpired, onHistoryRefresh };
  const actions = useRef({ refresh: () => {}, start: (_id: number) => {}, stop: () => {} });

  useEffect(() => {
    let alive = true;
    let writing = false;
    let current: StudySession | null = null;
    let confirmed = false;
    let request: AbortController | null = null;
    let version = 0;
    let anchor = { seconds: 0, at: performance.now() };
    setActive(null); setSeconds(0); setVerified(false); setError(''); setBusy(false);

    function accept(item: StudySession | null) {
      if (current && current.id !== item?.id) callbacks.current.onHistoryRefresh();
      current = item;
      anchor = { seconds: item?.duration_seconds ?? 0, at: performance.now() };
      setActive(item); setSeconds(anchor.seconds); setVerified(true); confirmed = true;
    }
    function fail(err: unknown) {
      if (err instanceof ApiError && err.status === 401) callbacks.current.onExpired(err.message);
      return err instanceof Error ? err.message : 'Не удалось связаться с сервером.';
    }
    async function read(afterWrite = false, keepError = false) {
      if (!alive || (writing && !afterWrite) || (request && !afterWrite)) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const ownVersion = ++version;
      setSyncing(true);
      try {
        const item = await source.activeSession(controller.signal);
        if (!alive || ownVersion !== version) return;
        accept(item);
        if (!keepError) setError('');
      } catch (err) {
        if (!alive || controller.signal.aborted || ownVersion !== version) return;
        confirmed = false; setVerified(false);
        setError(`${fail(err)} Состояние таймера не подтверждено. Обнови его перед следующим действием.`);
      } finally {
        if (alive && ownVersion === version) { request = null; setSyncing(false); }
      }
    }
    async function mutate(subjectId?: number) {
      if (!alive || writing || !confirmed || (subjectId === undefined && !current) || (subjectId !== undefined && current)) return;
      writing = true; setBusy(true); setError('');
      // Отменяем старое чтение, чтобы оно не перезаписало результат запуска или остановки.
      request?.abort(); request = null; ++version;
      let failed = false;
      try {
        if (subjectId !== undefined) {
          const item = await source.startSession(subjectId);
          if (!alive) return;
          accept(item);
        } else {
          await source.stopSession(current!.id);
          if (!alive) return;
          accept(null);
        }
      } catch (err) {
        if (!alive) return;
        failed = true; confirmed = false; setVerified(false);
        setError(fail(err));
      } finally {
        if (alive) {
          // Даже при потере ответа сервер мог сохранить действие. Не повторяем POST автоматически.
          callbacks.current.onHistoryRefresh();
          await read(true, failed);
          if (alive) { writing = false; setBusy(false); }
        }
      }
    }
    actions.current = { refresh: () => void read(), start: id => void mutate(id), stop: () => void mutate() };
    void read();
    const tick = setInterval(() => {
      if (current) setSeconds(anchor.seconds + Math.max(0, Math.floor((performance.now() - anchor.at) / 1000)));
    }, 250);
    const poll = setInterval(() => { if (!document.hidden) void read(); }, 30000);
    const wake = () => { if (!document.hidden) void read(); };
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive = false; request?.abort(); clearInterval(tick); clearInterval(poll);
      window.removeEventListener('focus', wake); window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [source]);

  return { active, seconds, verified, syncing, busy, error,
    refresh: () => actions.current.refresh(), start: (id: number) => actions.current.start(id), stop: () => actions.current.stop() };
}
