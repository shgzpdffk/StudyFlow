import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, GraduationCap, Layers3, Plus, Search, Send, Signal, Sparkles, X, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { ApiError, demoSource, telegramSource, type Workspace } from './api';
import { initializeTelegram } from './telegram';
import SubjectDialog from './SubjectDialog';
import CalendarView from './CalendarView';
import FocusView from './FocusView';

const colors = ['mint', 'lilac', 'peach', 'blue', 'yellow', 'rose'];
const initials = (name: string) => Array.from(name.trim())[0]?.toLocaleUpperCase('ru') || 'С';

export default function App() {
  const [initData] = useState(initializeTelegram);
  const [mode, setMode] = useState<'welcome' | 'demo' | 'telegram'>(initData ? 'telegram' : 'welcome');
  const [page, setPage] = useState<'subjects' | 'calendar' | 'focus'>('subjects');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const source = useMemo(() => mode === 'demo' ? demoSource() : telegramSource(initData), [mode, initData]);

  useEffect(() => {
    if (mode === 'welcome') { setWorkspace(null); setError(''); setLoading(false); setExpired(false); setNotice(''); return; }
    // Отменяем старую загрузку при смене режима или размонтировании экрана.
    const controller = new AbortController();
    setLoading(true); setError(''); setWorkspace(null); setExpired(false);
    source.load(controller.signal).then(data => { if (!controller.signal.aborted) setWorkspace(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(err.message); setExpired(err instanceof ApiError && err.status === 401); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, source, attempt]);

  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(id); }, [notice]);

  async function createSubject(name: string) {
    try {
      const subject = await source.create(name);
      setWorkspace(current => current && ({ ...current, subjects: [...current.subjects, subject] }));
      setSearch(''); setNotice(`«${subject.name}» добавлена`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setWorkspace(null); setExpired(true); setError(err.message); setDialog(false); }
      throw err;
    }
  }
  function closeDialog() { setDialog(false); requestAnimationFrame(() => addButton.current?.focus()); }
  const subjects = workspace?.subjects ?? [];
  const visible = subjects.filter(s => s.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  const today = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());

  return <div className="app-shell">
    <a className="skip-link" href="#main">К содержимому</a>
    <aside className="sidebar">
      <a className="brand" href="#main" aria-label="StudyFlow, главная"><span className="brand-mark"><Layers3 size={23} /></span>Study<span>Flow</span><span className="brand-dot">.</span></a>
      <p className="sidebar-label">МОЯ УЧЕБА</p>
      <nav aria-label="Основная навигация">
        <button className={`nav-item ${page === 'subjects' ? 'active' : ''}`} aria-current={page === 'subjects' ? 'page' : undefined} onClick={() => setPage('subjects')}><BookOpen size={20} /><span>Дисциплины</span><ChevronRight size={16} /></button>
        <button className={`nav-item ${page === 'calendar' ? 'active' : ''}`} aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => setPage('calendar')}><CalendarDays size={20} /><span>Календарь</span><ChevronRight size={16} /></button>
        <button className={`nav-item ${page === 'focus' ? 'active' : ''}`} aria-current={page === 'focus' ? 'page' : undefined} onClick={() => setPage('focus')}><Clock3 size={20} /><span>Фокус</span><ChevronRight size={16} /></button>
        <div className="nav-item upcoming" aria-disabled="true"><ChartNoAxesColumnIncreasing size={20} /><span>Статистика</span><small>Скоро</small></div>
      </nav>
      <div className="sidebar-bottom"><div className="small-note"><Sparkles size={20} /><p>Большие результаты<br /><strong>начинаются с малого.</strong></p></div><div className="profile"><div className="avatar">{initials(workspace?.user.name || 'Студент')}</div><div><strong>{workspace?.user.name || 'Твое пространство'}</strong><small>{mode === 'demo' ? 'Демонстрация' : workspace ? 'Аккаунт Telegram' : 'Для твоей учебы'}</small></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Моя учеба <ChevronRight size={14} /><strong>{page === 'calendar' ? 'Календарь' : page === 'focus' ? 'Фокус' : 'Дисциплины'}</strong></div><time>{today}</time><span className="mobile-brand"><Layers3 size={20} /> StudyFlow</span></header>
      <main id="main">
        <nav className="mobile-navigation" aria-label="Разделы приложения">
          <button aria-current={page === 'subjects' ? 'page' : undefined} onClick={() => setPage('subjects')}><BookOpen size={17} />Дисциплины</button>
          <button aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => setPage('calendar')}><CalendarDays size={17} />Календарь</button>
          <button aria-current={page === 'focus' ? 'page' : undefined} onClick={() => setPage('focus')}><Clock3 size={17} />Фокус</button>
        </nav>
        {mode === 'demo' && <div className="demo-banner"><span><Sparkles size={16} /> Демо-режим. Изменения не сохраняются на сервере.</span><button onClick={() => { setMode(initData ? 'telegram' : 'welcome'); setSearch(''); setDialog(false); setPage('subjects'); }}>Выйти из демо <X size={15} /></button></div>}
        {(page === 'subjects' || !workspace) && <><section className="page-heading"><div><p className="eyebrow">МЕНЬШЕ ХАОСА. БОЛЬШЕ ЯСНОСТИ.</p><h1>Твоя учеба —<br className="mobile-break" /> по полочкам.</h1><p className="subtitle">Все дисциплины в одном месте. Начни с первого предмета.</p></div><span className="edition">STUDYFLOW / 01</span></section>
        <section className="hero" aria-label="Начало работы"><div className="hero-copy"><span className="pill"><span /> ТВОЙ УЧЕБНЫЙ РИТМ</span><h2>Небольшой шаг.<br /><em>Хорошее начало.</em></h2><p>Собери предметы этого семестра.<br />Дальше — дедлайны, время для фокуса<br className="desktop-only" /> и больше спокойствия.</p><a href="#subjects" className="hero-link">К моим дисциплинам <ArrowDown size={17} /></a></div><div className="notebooks" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="floating-star">✦</span><div className="notebook notebook-back"><span>STUDY NOTES</span></div><div className="notebook notebook-front"><div className="binding" /><span className="notebook-top">ONE THING<br />AT A TIME.</span><div className="notebook-symbol"><GraduationCap size={45} strokeWidth={1.3}/></div><span className="notebook-footer">ТВОЙ НОВЫЙ СЕМЕСТР<br /><b>StudyFlow</b></span></div><div className="check-sticker"><Check size={24} /> Начало положено</div></div></section></>}
        {mode === 'welcome' && <section className="welcome-panel"><span className="telegram-icon"><Send size={23}/></span><div><h2>Твое пространство — в Telegram</h2><p>Открой Mini App через бота, чтобы работать со своими предметами. Или посмотри, как все устроено, на примере.</p></div><button className="button secondary" onClick={() => setMode('demo')}>Посмотреть демо <ArrowUpRight size={17}/></button></section>}
        {(page === 'subjects' || !workspace) && <section id="subjects" className="subjects-section" aria-busy={loading}>
          <div className="section-heading"><div><h2>Мои дисциплины {workspace && <span className="count">{subjects.length}</span>}</h2><p>Предметы, которым ты уделяешь время.</p></div><button ref={addButton} className="button primary" onClick={() => setDialog(true)} disabled={!workspace || loading}><Plus size={18}/>Добавить дисциплину</button></div>
          {error ? <div className="empty-state error-state" role="alert"><Signal size={30}/><h3>{expired ? 'Нужно войти заново' : 'Не удалось загрузить дисциплины'}</h3><p>{error}</p>{!expired && <button className="button secondary" onClick={() => setAttempt(n => n + 1)}>Попробовать снова</button>}</div>
          : loading ? <div className="subject-grid" aria-label="Загружаем дисциплины">{[0,1,2].map(i => <div key={i} className="skeleton" />)}</div>
          : !workspace ? <div className="locked-state"><BookOpen size={22}/><p>Здесь будут твои предметы — после входа через Telegram.</p></div>
          : subjects.length === 0 ? <div className="empty-state"><span className="empty-icon"><BookOpen size={32}/></span><h3>С чего начнем?</h3><p>Добавь первую дисциплину. Например,<br />математику, программирование или английский.</p><button className="text-button" onClick={() => setDialog(true)}>Добавить первый предмет <ArrowUpRight size={17}/></button></div>
          : <><div className="list-toolbar"><div className="search-field"><Search size={18}/><input aria-label="Найти дисциплину" placeholder="Найти дисциплину" value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="icon-button" aria-label="Очистить поиск" onClick={() => setSearch('')}><X size={16}/></button>}</div><span>{search ? `Найдено: ${visible.length}` : 'Твой учебный план'}</span></div>{visible.length === 0 ? <div className="empty-state compact"><Search size={28}/><h3>Ничего не нашлось</h3><p>Попробуй другое название.</p><button className="text-button" onClick={() => setSearch('')}>Сбросить поиск</button></div> : <div className="subject-grid">{visible.map(subject => <article className="subject-card" key={subject.id}><div className="card-top"><span className={`subject-icon ${colors[(subject.id - 1) % colors.length]}`}><BookOpen size={22}/></span><span className="card-category">ДИСЦИПЛИНА</span></div><h3>{subject.name}</h3><div className="card-footer"><span className="saved-dot"/>В учебном плане</div></article>)}<button className="add-card" onClick={() => setDialog(true)}><span><Plus size={24}/></span><strong>Еще один предмет</strong><small>Расширь свой учебный план</small></button></div>}</>}
        </section>}
        {page === 'calendar' && workspace && <CalendarView source={source} subjects={subjects} demo={mode === 'demo'}
          onSubjects={() => setPage('subjects')} onNotice={setNotice}
          onExpired={message => { setWorkspace(null); setExpired(true); setError(message); setPage('subjects'); }} />}
        {page === 'focus' && workspace && <FocusView source={source} subjects={subjects}
          onSubjects={() => setPage('subjects')}
          onExpired={message => { setWorkspace(null); setExpired(true); setError(message); setPage('subjects'); }} />}
        <footer className="page-footer"><span><Layers3 size={14}/> Учись в своем ритме.</span><span>Сначала один маленький шаг.</span></footer>
      </main>
    </div>
    {dialog && <SubjectDialog onClose={closeDialog} onCreate={createSubject} demo={mode === 'demo'}/>}
    <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={18}/><span>{notice}</span></>}</div>
  </div>;
}
