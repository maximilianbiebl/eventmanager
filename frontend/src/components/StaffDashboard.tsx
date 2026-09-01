import React, { useState, useEffect } from 'react';
import { tasksApi, TaskAssignment } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { useSSE } from '../hooks/useSSE';
import { StaffSettings } from './StaffSettings';
import { ChangePasswordDialog } from './admin/ChangePasswordDialog';
import { DescriptionModal } from './DescriptionModal';
import { ThemeSwitch } from './ThemeSwitch';
import client from '../api/client';
import styles from './StaffDashboard.module.css';
import { toLocalDate } from '../utils/date';
import { DaySelection, resolveInitialDay, storeDay } from '../utils/dayPreference';
import {
  cacheTasks, readCachedTasks, enqueue, flushQueue, pendingTaskIds,
  queueLength, istNetzfehler,
} from '../utils/offlineStore';

export const StaffDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'standard' | 'event-day' | 'event' | 'date'>('standard');
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  /*
   * Gespeichert werden die AUSGEBLENDETEN Veranstaltungen, nicht die
   * ausgewaehlten. Vorher hielt der Speicher die Auswahl - dabei zaehlte der
   * Zaehler auch laengst verschwundene Veranstaltungen mit, und eine neu
   * hinzugekommene Veranstaltung war unsichtbar, weil sie nicht in der alten
   * Auswahl stand. Mit der umgekehrten Logik ist der Zaehler immer stimmig
   * und Neues ist standardmaessig sichtbar.
   */
  const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());
  const [showEventFilter, setShowEventFilter] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DaySelection>('all');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Offline-Zustand: Stand des letzten erfolgreichen Ladens und die Zahl
  // der noch nicht gesendeten Änderungen.
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [standVon, setStandVon] = useState<number | null>(null);
  const [ausstehend, setAusstehend] = useState<Set<number>>(() => pendingTaskIds());
  const { user, logout } = useAuth();
  const notifications = useNotifications();
  // Tagesauswahl nur beim ersten Laden setzen - sonst würde jede
  // SSE-Aktualisierung die gerade getroffene Wahl überschreiben.
  const dayInitRef = React.useRef(false);

  // SSE for real-time updates
  useSSE({
    enabled: true,
    onTaskUpdate: (data) => {
      console.log('SSE: Task update received', data);
      // Reload tasks in background when update is received
      loadTasks(false);
    },
    onConnected: () => {
      console.log('SSE: Connected to real-time updates');
    },
    onError: (error) => {
      console.error('SSE: Connection error', error);
    }
  });

  useEffect(() => {
    loadUserSettings();
    loadTasks();

    // SSE handles live updates, no need for polling fallback
    // selectedEvents are loaded inside loadTasks on first load only
  }, []);

  /*
   * Liest die ausgeblendeten Veranstaltungen. Wer den Filter noch im alten
   * Format ("selectedEvents") gespeichert hat, behält seine Einstellung:
   * ausgeblendet ist dann alles, was damals nicht ausgewählt war.
   */
  const readHiddenEvents = (list: TaskAssignment[]): Set<string> => {
    try {
      const stored = localStorage.getItem('hiddenEvents');
      if (stored) return new Set<string>(JSON.parse(stored));

      const legacy = localStorage.getItem('selectedEvents');
      if (legacy) {
        const selected = new Set<string>(JSON.parse(legacy));
        const all = list.map(t => `${t.event_name}#${t.instance_start_date}`);
        const hidden = new Set(all.filter(k => !selected.has(k)));
        localStorage.setItem('hiddenEvents', JSON.stringify(Array.from(hidden)));
        localStorage.removeItem('selectedEvents');
        return hidden;
      }
    } catch (error) {
      console.error('Load event filter error:', error);
    }
    return new Set<string>();
  };

  const saveHiddenEventsToStorage = (events: Set<string>) => {
    try {
      localStorage.setItem('hiddenEvents', JSON.stringify(Array.from(events)));
    } catch (error) {
      console.error('Save hidden events to storage error:', error);
    }
  };

  const loadUserSettings = async () => {
    try {
      const response = await client.get('/users/me/settings');
      if (response.data.default_view) {
        setViewMode(response.data.default_view);
      }
    } catch (error) {
      console.error('Load user settings error:', error);
    }
  };

  // Schlüssel für die gemerkte Tagesauswahl - pro Konto, damit ein
  // Kontowechsel im selben Browser nicht den fremden Tag erbt.
  const dayScope = `staff:${user?.id ?? 'anon'}`;

  /*
   * Welcher Veranstaltungstag ist heute? Im Mitarbeiterbereich gibt es kein
   * einzelnes Event - der Tag ergibt sich aus den Aufgaben selbst: fällt das
   * Datum einer Aufgabe (Startdatum der Durchführung + Tagnummer - 1) auf
   * heute, ist das der aktuelle Tag. Bei parallelen Veranstaltungen gewinnt
   * die kleinste Tagnummer.
   */
  const todayDayNumber = (list: TaskAssignment[]): number | null => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let match: number | null = null;

    for (const task of list) {
      const start = toLocalDate(task.instance_start_date);
      if (!start) continue;
      start.setDate(start.getDate() + task.day_number - 1);
      if (start.getTime() !== today) continue;
      if (match === null || task.day_number < match) match = task.day_number;
    }

    return match;
  };

  const handleDayChange = (day: DaySelection) => {
    setSelectedDay(day);
    storeDay(dayScope, day);
  };

  const isTaskOverdue = (task: TaskAssignment): boolean => {
    if (!task.end_time || !task.instance_start_date || task.status === 'completed') return false;

    const now = new Date();
    const taskDate = toLocalDate(task.instance_start_date);
    if (!taskDate) return false;
    taskDate.setDate(taskDate.getDate() + task.day_number - 1);

    // Parse end time (format: "HH:MM")
    const [hours, minutes] = task.end_time.split(':').map(Number);
    taskDate.setHours(hours, minutes, 0, 0);

    return now > taskDate;
  };

  const loadTasks = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const data = await tasksApi.getMyTasks();
      // Erfolgreich geladen: Stand für den Offline-Fall sichern
      cacheTasks(data);
      setStandVon(Date.now());
      setOffline(false);

      // Only update state if data has actually changed (prevent flicker)
      setTasks(prevTasks => {
        // Compare by creating a simple signature
        const prevSignature = prevTasks.map(t => `${t.id}-${t.status}-${t.assignment_id}`).sort().join(',');
        const newSignature = data.map(t => `${t.id}-${t.status}-${t.assignment_id}`).sort().join(',');

        // Only update if something changed
        if (prevSignature !== newSignature) {
          console.log('Tasks changed, updating state');
          return data;
        }
        console.log('Tasks unchanged, skipping update (prevent flicker)');
        return prevTasks;
      });

      // Nur beim ersten Laden - sonst würde jede SSE-Aktualisierung den
      // gerade gesetzten Filter zurücksetzen.
      if (!filtersInitialized && data.length > 0) {
        setHiddenEvents(readHiddenEvents(data));
        setFiltersInitialized(true);
      }

      // Zuletzt angesehener Tag bzw. der heutige Veranstaltungstag.
      if (!dayInitRef.current && data.length > 0) {
        dayInitRef.current = true;
        setSelectedDay(resolveInitialDay(dayScope, todayDayNumber(data)));
      }
    } catch (error) {
      console.error('Load tasks error:', error);

      /*
       * Kein Netz: den zuletzt gesicherten Stand zeigen statt einer leeren
       * Seite. Genau der Fall auf einer Freizeit ohne Empfang - man will
       * wenigstens sehen, was zu tun ist.
       */
      if (istNetzfehler(error)) {
        setOffline(true);
        const gesichert = readCachedTasks();
        if (gesichert) {
          setTasks(prev => (prev.length === 0 ? gesichert.tasks : prev));
          setStandVon(gesichert.savedAt);
          if (!filtersInitialized && gesichert.tasks.length > 0) {
            setHiddenEvents(readHiddenEvents(gesichert.tasks));
            setFiltersInitialized(true);
          }
          if (!dayInitRef.current && gesichert.tasks.length > 0) {
            dayInitRef.current = true;
            setSelectedDay(resolveInitialDay(dayScope, todayDayNumber(gesichert.tasks)));
          }
        }
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  /*
   * Ohne Netz getätigte Änderung vormerken. Die Anzeige bleibt auf dem neuen
   * Stand (die Handler haben schon optimistisch gesetzt), die Karte bekommt
   * zusätzlich den Hinweis "wird gesendet".
   */
  const merkeVor = (action: Parameters<typeof enqueue>[0]) => {
    enqueue(action);
    setAusstehend(pendingTaskIds());
    setOffline(true);
  };

  /*
   * Warteschlange abarbeiten, sobald wieder Verbindung besteht. Läuft auch
   * beim Start, denn die App wird oft erst wieder geöffnet, wenn man zurück
   * im Empfangsbereich ist.
   */
  const sendeAusstehende = async () => {
    if (queueLength() === 0) return;

    const { gesendet, verworfen } = await flushQueue({
      complete: (id) => tasksApi.complete(id),
      completePublic: (id) => tasksApi.completePublic(id),
      status: (id, status) => tasksApi.updateStatus(id, status),
    });

    setAusstehend(pendingTaskIds());
    if (gesendet > 0 || verworfen > 0) {
      await loadTasks(false);
    }
    if (verworfen > 0) {
      alert(`${verworfen} Änderung${verworfen === 1 ? '' : 'en'} konnte${verworfen === 1 ? '' : 'n'} nicht übernommen werden - die Aufgabe gibt es nicht mehr oder sie ist nicht mehr dir zugewiesen.`);
    }
  };

  useEffect(() => {
    const wiederOnline = () => {
      setOffline(false);
      sendeAusstehende();
    };
    const jetztOffline = () => setOffline(true);

    window.addEventListener('online', wiederOnline);
    window.addEventListener('offline', jetztOffline);
    // Beim Start einmal versuchen - der Browser meldet "online" nicht, wenn
    // die App im Empfangsbereich frisch geöffnet wird.
    sendeAusstehende();

    return () => {
      window.removeEventListener('online', wiederOnline);
      window.removeEventListener('offline', jetztOffline);
    };
  }, []);

  const handleComplete = async (assignmentId: number) => {
    try {
      // Optimistic update: update UI immediately
      setTasks(prevTasks => prevTasks.map(task =>
        task.assignment_id === assignmentId
          ? { ...task, status: 'completed' }
          : task
      ));

      await tasksApi.complete(assignmentId);

      // Reload in background to sync with server
      loadTasks(false);
    } catch (error) {
      console.error('Complete task error:', error);
      const task = tasks.find(t => t.assignment_id === assignmentId);
      if (istNetzfehler(error) && task) {
        // Ohne Netz nicht zurücknehmen, sondern vormerken - die Änderung
        // geht raus, sobald wieder Verbindung besteht.
        merkeVor({ kind: 'complete', assignmentId, taskId: task.id, queuedAt: Date.now() });
        return;
      }
      loadTasks(false);
      alert('Fehler beim Markieren der Aufgabe');
    }
  };

  const handleCompletePublic = async (taskId: number) => {
    try {
      // Optimistic update: update UI immediately
      setTasks(prevTasks => prevTasks.map(task =>
        task.id === taskId && !task.assignment_id
          ? { ...task, status: 'completed' }
          : task
      ));

      await tasksApi.completePublic(taskId);

      // Reload in background to sync with server
      loadTasks(false);
    } catch (error) {
      console.error('Complete public task error:', error);
      if (istNetzfehler(error)) {
        merkeVor({ kind: 'completePublic', taskId, queuedAt: Date.now() });
        return;
      }
      loadTasks(false);
      alert('Fehler beim Markieren der öffentlichen Aufgabe');
    }
  };

  const handleStatusUpdate = async (taskId: number, newStatus: string) => {
    try {
      // Optimistic update: update UI immediately
      setTasks(prevTasks => prevTasks.map(task =>
        task.id === taskId
          ? { ...task, status: newStatus }
          : task
      ));

      await tasksApi.updateStatus(taskId, newStatus);

      // Reload in background to sync with server
      loadTasks(false);
    } catch (error) {
      console.error('Update status error:', error);
      if (istNetzfehler(error)) {
        merkeVor({ kind: 'status', taskId, status: newStatus, queuedAt: Date.now() });
        return;
      }
      loadTasks(false);
      alert('Fehler beim Aktualisieren des Status');
    }
  };

  const handleEnableNotifications = async () => {
    const success = await notifications.subscribe();
    if (success) {
      alert('Benachrichtigungen aktiviert!');
    } else {
      alert('Benachrichtigungen konnten nicht aktiviert werden. Bitte prüfen Sie die Browser-Einstellungen.');
    }
  };

  const applyHidden = (next: Set<string>) => {
    setHiddenEvents(next);
    saveHiddenEventsToStorage(next);
  };

  const handleToggleEvent = (eventKey: string) => {
    const next = new Set(hiddenEvents);
    if (next.has(eventKey)) {
      next.delete(eventKey);
    } else {
      next.add(eventKey);
    }
    applyHidden(next);
  };

  const handleSelectAllEvents = () => applyHidden(new Set<string>());

  const handleDeselectAllEvents = () =>
    applyHidden(new Set(tasks.map(t => `${t.event_name}#${t.instance_start_date}`)));

  // Get unique events for the filter
  const uniqueEvents = Array.from(new Set(tasks.map(t => `${t.event_name}#${t.instance_start_date}`))).sort();

  // Create display names for events (show date only if multiple instances exist)
  const eventDisplayNames: { [key: string]: string } = {};
  const eventNameCounts: { [name: string]: number } = {};

  // Count how many instances of each event name exist
  uniqueEvents.forEach(key => {
    const name = key.split('#')[0];
    eventNameCounts[name] = (eventNameCounts[name] || 0) + 1;
  });

  // Create display names
  uniqueEvents.forEach(key => {
    const [name, date] = key.split('#');
    if (eventNameCounts[name] > 1) {
      // Multiple instances - show date
      const formattedDate = new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      eventDisplayNames[key] = `${name} (${formattedDate})`;
    } else {
      // Single instance - show only name
      eventDisplayNames[key] = name;
    }
  });

  const visibleEvents = uniqueEvents.filter(k => !hiddenEvents.has(k));

  // Filter tasks based on hideCompleted and hiddenEvents
  const filteredTasks = React.useMemo(() => {
    return tasks.filter(t => {
      // Filter by completed status - check both status field and completed flag
      if (hideCompleted && (t.status === 'completed' || t.completed === true)) {
        return false;
      }

      // Ausgeblendete Veranstaltungen. Vorher stand hier eine Bedingung auf
      // die Größe der Auswahl - war nichts ausgewählt, wurde der Filter
      // übersprungen und es kam wieder alles durch.
      if (hiddenEvents.has(`${t.event_name}#${t.instance_start_date}`)) {
        return false;
      }

      return true;
    });
  }, [tasks, hideCompleted, hiddenEvents]);

  /*
   * Die Tagesauswahl gilt für beide Ansichten. Die Tag-Leiste selbst wird
   * weiterhin aus `filteredTasks` gebaut - sonst bliebe nach dem Filtern nur
   * noch der gewählte Tag als Reiter übrig und man käme nicht mehr zurück.
   */
  const dayFilteredTasks = React.useMemo(() => {
    if (selectedDay === 'all') return filteredTasks;
    return filteredTasks.filter(t => t.day_number === selectedDay);
  }, [filteredTasks, selectedDay]);

  // Gruppierungs-Funktionen - arbeiten mit gefilterten Tasks
  const groupedTasks = React.useMemo(() => {
    const result = groupTasksByEventDay(dayFilteredTasks);
    const tasksInGroups = Object.values(result).flat().length;
    if (tasksInGroups !== dayFilteredTasks.length) {
      console.warn('Event-Day Gruppierung: Fehlende Tasks!', {
        filtered: dayFilteredTasks.length,
        inGroups: tasksInGroups,
        groups: Object.keys(result)
      });
    }
    return result;
  }, [dayFilteredTasks]);

  const eventGroups = React.useMemo(() => {
    const result = groupTasksByEvent(dayFilteredTasks);
    const tasksInGroups = Object.values(result).flat().length;
    if (tasksInGroups !== dayFilteredTasks.length) {
      console.warn('Event Gruppierung: Fehlende Tasks!', {
        filtered: dayFilteredTasks.length,
        inGroups: tasksInGroups,
        groups: Object.keys(result)
      });
    }
    return result;
  }, [dayFilteredTasks]);

  const dateGroups = React.useMemo(() => {
    const result = groupTasksByDate(dayFilteredTasks);
    const tasksInGroups = Object.values(result).flat().length;
    if (tasksInGroups !== dayFilteredTasks.length) {
      console.warn('Datum Gruppierung: Fehlende Tasks!', {
        filtered: dayFilteredTasks.length,
        inGroups: tasksInGroups,
        groups: Object.keys(result)
      });
    }
    return result;
  }, [dayFilteredTasks]);

  // Standard-Ansicht: einfach sortierte Liste
  const sortedTasks = React.useMemo(() => {
    return [...dayFilteredTasks].sort((a, b) => {
      const orderA = a.sort_order ?? 999999;
      const orderB = b.sort_order ?? 999999;
      return orderA - orderB;
    });
  }, [dayFilteredTasks]);

  if (loading) {
    return <div className={styles.loading}>Lade Aufgaben...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Meine Aufgaben</h1>
          <p className={styles.subtitle}>Willkommen, {user?.name}!</p>
        </div>

        {/* Desktop buttons */}
        <div className={styles.headerButtons}>
          <button onClick={() => setShowSettings(true)} className={styles.settingsButton}>
            Einstellungen
          </button>
          <button onClick={() => setShowChangePassword(true)} className={styles.settingsButton}>
            Passwort ändern
          </button>
          <button onClick={logout} className={styles.logoutButton}>
            Abmelden
          </button>
        </div>

        {/* Mobile hamburger menu */}
        <div className={styles.mobileMenuContainer}>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className={styles.hamburgerButton}
            aria-label="Menu"
          >
            <div className={styles.hamburgerIcon}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          {showMobileMenu && (
            <>
              <div
                className={styles.mobileMenuOverlay}
                onClick={() => setShowMobileMenu(false)}
              />
              <div className={styles.mobileMenu}>
                <ThemeSwitch />
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowMobileMenu(false);
                  }}
                  className={styles.mobileMenuItem}
                >
                  Einstellungen
                </button>
                <button
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowMobileMenu(false);
                  }}
                  className={styles.mobileMenuItem}
                >
                  Passwort ändern
                </button>
                <button
                  onClick={() => {
                    logout();
                    setShowMobileMenu(false);
                  }}
                  className={styles.mobileMenuItemLogout}
                >
                  Abmelden
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Benachrichtigungen - Banner nur wenn nicht aktiviert */}
      {notifications.isSupported && !notifications.isSubscribed && (
        <div className={styles.notificationBanner}>
          <p>Aktiviere Benachrichtigungen um an deine Aufgaben erinnert zu werden!</p>
          <button onClick={handleEnableNotifications} className={styles.enableButton}>
            Benachrichtigungen aktivieren
          </button>
        </div>
      )}

      {/* Drei verschiedene Funktionen - deshalb drei sichtbar getrennte Gruppen:
          Ansicht ist ein Segment-Umschalter, Sortierung sind beschriftete
          Filter-Pillen, Aktualisieren ist eine eigenständige Aktion. */}
      <div className={styles.viewControls}>
        {/* Ansicht und Aktualisieren in EINEM Segment - wie im Admin-Bereich,
            wo Liste/Tabelle/Aktualisieren ebenfalls eine Leiste bilden. */}
        <div className={styles.segmented} role="group" aria-label="Ansicht">
          <button
            onClick={() => setViewMode('cards')}
            className={viewMode === 'cards' ? styles.segmentActive : styles.segment}
            aria-pressed={viewMode === 'cards'}
          >
            Karten
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={viewMode === 'table' ? styles.segmentActive : styles.segment}
            aria-pressed={viewMode === 'table'}
          >
            Tabelle
          </button>
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await loadTasks(false);
              } finally {
                setRefreshing(false);
              }
            }}
            className={refreshing ? `${styles.segment} ${styles.refreshing}` : styles.segment}
            title="Daten aktualisieren"
            disabled={refreshing}
          >
            {/* eigenes Element, damit die Füllung dahinter liegen kann */}
            <span>{refreshing ? 'Aktualisiere…' : 'Aktualisieren'}</span>
          </button>
        </div>

        {/* Sortierung - nur für Karten-Ansicht */}
        {viewMode === 'cards' && (
          <div className={styles.sortGroup}>
            <span className={styles.groupLabel}>Sortieren</span>
            {([
              ['standard', 'Standard'],
              ['event-day', 'Event-Tag'],
              ['event', 'Veranstaltung'],
              ['date', 'Datum'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={sortBy === key ? styles.sortPillActive : styles.sortPill}
                aria-pressed={sortBy === key}
              >
                {label}
              </button>
            ))}
          </div>
        )}

      </div>

      {/*
        Offline-Hinweis. Nennt den Stand, damit klar ist, wie alt die
        Anzeige ist - "offline" allein sagt nicht, ob die Daten von vor
        fünf Minuten oder von gestern sind.
      */}
      {(offline || ausstehend.size > 0) && (
        <div className={styles.offlineBar} role="status">
          {offline && (
            <span>
              <strong>Offline.</strong>{' '}
              {standVon
                ? `Angezeigt wird der Stand von ${new Date(standVon).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.`
                : 'Es liegt noch kein gespeicherter Stand vor.'}
            </span>
          )}
          {ausstehend.size > 0 && (
            <span>
              {ausstehend.size === 1
                ? '1 Änderung wird gesendet, sobald du wieder Empfang hast.'
                : `${ausstehend.size} Änderungen werden gesendet, sobald du wieder Empfang hast.`}
            </span>
          )}
        </div>
      )}

      {/*
        Tage und Filter bilden EINE Leiste - vorher standen sie in drei
        Zeilen mit drei verschiedenen Erscheinungen untereinander (Karte mit
        Schatten, nackte Pillen, nackter Chip).
      */}
      <div className={styles.filterBar}>
        {filteredTasks.length > 0 && (
          <>
            <span className={styles.groupLabel}>Tage</span>
            <div className={styles.dayTabsContainer}>
              <button
                onClick={() => handleDayChange('all')}
                className={selectedDay === 'all' ? styles.dayTabActive : styles.dayTab}
              >
                Alle
              </button>
              {Array.from(new Set(filteredTasks.map(t => t.day_number))).sort((a, b) => a - b).map(day => (
                <button
                  key={day}
                  onClick={() => handleDayChange(day)}
                  className={selectedDay === day ? styles.dayTabActive : styles.dayTab}
                >
                  {day}
                </button>
              ))}
            </div>
            <span className={styles.barDivider} aria-hidden="true" />
          </>
        )}

        <button
          type="button"
          onClick={() => setHideCompleted(!hideCompleted)}
          className={hideCompleted ? styles.filterChipActive : styles.filterChip}
          aria-pressed={hideCompleted}
        >
          Erledigte ausblenden
        </button>

        {uniqueEvents.length > 1 && (
          <div className="tv-dropdown">
            <button
              type="button"
              onClick={() => setShowEventFilter(!showEventFilter)}
              className={hiddenEvents.size > 0 ? styles.filterChipActive : styles.filterChip}
              aria-haspopup="true"
              aria-expanded={showEventFilter}
            >
              Veranstaltungen {visibleEvents.length}/{uniqueEvents.length}
              <span className="status-caret" aria-hidden="true">▾</span>
            </button>

            {showEventFilter && (
              <>
                <div className="tv-backdrop" onClick={() => setShowEventFilter(false)} />
                <div className={styles.eventFilterMenu}>
                  <div className={styles.eventFilterActions}>
                    <button onClick={handleSelectAllEvents} className={styles.filterActionButton}>
                      Alle
                    </button>
                    <button onClick={handleDeselectAllEvents} className={styles.filterActionButton}>
                      Keine
                    </button>
                  </div>
                  {uniqueEvents.map(eventKey => (
                    <label key={eventKey} className={styles.filterLabel}>
                      <input
                        type="checkbox"
                        checked={!hiddenEvents.has(eventKey)}
                        onChange={() => handleToggleEvent(eventKey)}
                        className={styles.filterCheckbox}
                      />
                      <span>{eventDisplayNames[eventKey]}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Aufgabenliste */}
      {tasks.length === 0 ? (
        <div className={styles.empty}>Keine Aufgaben vorhanden</div>
      ) : dayFilteredTasks.length === 0 ? (
        /* Tag- und Filterleiste oben bleiben sichtbar - sonst käme man aus
           der leeren Auswahl nicht mehr heraus. */
        <div className={styles.empty}>
          {hiddenEvents.size >= uniqueEvents.length && uniqueEvents.length > 0
            ? 'Alle Veranstaltungen ausgeblendet'
            : selectedDay === 'all'
              ? 'Keine Aufgaben für die aktuelle Auswahl'
              : `Keine Aufgaben für Tag ${selectedDay}`}
        </div>
      ) : viewMode === 'table' ? (
        <StaffTableView
          tasks={filteredTasks}
          allTasks={tasks}
          selectedDay={selectedDay}
          onComplete={handleComplete}
          onCompletePublic={handleCompletePublic}
          onStatusUpdate={handleStatusUpdate}
          onReload={loadTasks}
          isTaskOverdue={isTaskOverdue}
        />
      ) : sortBy === 'standard' ? (
        <div key="standard-view" className={styles.taskList}>
          {sortedTasks.map((task) => (
            <TaskCard
              key={`${task.assignment_id || 'task'}-${task.id}`}
              task={task}
              onComplete={handleComplete}
              onCompletePublic={handleCompletePublic}
              onStatusUpdate={handleStatusUpdate}
              onReminderUpdate={() => loadTasks(false)}
              isOverdue={isTaskOverdue(task)}
              pending={ausstehend.has(task.id)}
            />
          ))}
        </div>
      ) : sortBy === 'event-day' ? (
        <div key="event-day-view" className={styles.groupedView}>
          {Object.entries(groupedTasks).map(([groupKey, groupTasks]) => (
            <div key={groupKey} className={styles.group}>
              <h2 className={styles.groupTitle}>{groupKey}</h2>
              <div className={styles.taskList}>
                {groupTasks.map((task) => (
                  <TaskCard
                    key={`${task.assignment_id || 'task'}-${task.id}`}
                    task={task}
                    onComplete={handleComplete}
                    onCompletePublic={handleCompletePublic}
                    onStatusUpdate={handleStatusUpdate}
                    onReminderUpdate={() => loadTasks(false)}
                    isOverdue={isTaskOverdue(task)}
                    pending={ausstehend.has(task.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sortBy === 'event' ? (
        <div key="event-view" className={styles.groupedView}>
          {Object.entries(eventGroups).map(([groupKey, groupTasks]) => (
            <div key={groupKey} className={styles.group}>
              <h2 className={styles.groupTitle}>{groupKey}</h2>
              <div className={styles.taskList}>
                {groupTasks.map((task) => (
                  <TaskCard
                    key={`${task.assignment_id || 'task'}-${task.id}`}
                    task={task}
                    onComplete={handleComplete}
                    onCompletePublic={handleCompletePublic}
                    onStatusUpdate={handleStatusUpdate}
                    onReminderUpdate={() => loadTasks(false)}
                    isOverdue={isTaskOverdue(task)}
                    pending={ausstehend.has(task.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div key="date-view" className={styles.groupedView}>
          {Object.entries(dateGroups).map(([groupKey, groupTasks]) => (
            <div key={groupKey} className={styles.group}>
              <h2 className={styles.groupTitle}>{groupKey}</h2>
              <div className={styles.taskList}>
                {groupTasks.map((task) => (
                  <TaskCard
                    key={`${task.assignment_id || 'task'}-${task.id}`}
                    task={task}
                    onComplete={handleComplete}
                    onCompletePublic={handleCompletePublic}
                    onStatusUpdate={handleStatusUpdate}
                    onReminderUpdate={() => loadTasks(false)}
                    isOverdue={isTaskOverdue(task)}
                    pending={ausstehend.has(task.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSettings && <StaffSettings onClose={() => setShowSettings(false)} />}
      {showChangePassword && <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />}
    </div>
  );
};

const TaskCard: React.FC<{
  task: TaskAssignment;
  onComplete: (id: number) => void;
  onCompletePublic: (taskId: number) => void;
  onStatusUpdate: (taskId: number, newStatus: string) => void;
  onReminderUpdate: () => void;
  isOverdue: boolean;
  /** Änderung liegt in der Warteschlange und ist noch nicht beim Server */
  pending?: boolean;
}> = ({ task, onComplete, onCompletePublic, onStatusUpdate, onReminderUpdate, isOverdue, pending }) => {
  const [showReminderEdit, setShowReminderEdit] = React.useState(false);
  const [reminderMinutes, setReminderMinutes] = React.useState(task.reminder_minutes || 15);
  const [saving, setSaving] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = React.useState(false);
  const [showFullDescription, setShowFullDescription] = React.useState(false);

  // Update reminder state when task prop changes
  React.useEffect(() => {
    setReminderMinutes(task.reminder_minutes || 15);
  }, [task.reminder_minutes]);

  const getEventDate = () => {
    const startDate = toLocalDate(task.instance_start_date) ?? new Date();
    startDate.setDate(startDate.getDate() + task.day_number - 1);
    return startDate.toLocaleDateString('de-DE');
  };

  const handleSaveReminder = async () => {
    setSaving(true);
    try {
      await tasksApi.updateReminder(task.assignment_id, reminderMinutes);
      setShowReminderEdit(false);
      onReminderUpdate(); // Reload tasks to get updated value
    } catch (error) {
      console.error('Update reminder error:', error);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleSetInProgress = async () => {
    setUpdatingStatus(true);
    setShowStatusDropdown(false);
    try {
      await onStatusUpdate(task.id, 'in_progress');
    } catch (error) {
      console.error('Update status error:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setShowStatusDropdown(false);
    try {
      await onStatusUpdate(task.id, newStatus);
    } catch (error) {
      console.error('Status change error:', error);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      not_started: 'Nicht gestartet',
      in_progress: 'In Arbeit',
      completed: 'Erledigt',
      overdue: 'Überfällig',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    // Show red if task is actually overdue (by time), regardless of status
    if (isOverdue) return 'var(--c-danger)';

    const colors: { [key: string]: string } = {
      not_started: 'var(--c-text-muted)',
      in_progress: 'var(--c-accent)',
      completed: 'var(--c-success)',
      overdue: 'var(--c-danger)',
    };
    return colors[status] || 'var(--c-text-muted)';
  };

  // Check if task is completed (either assignment-specific or global status)
  const isCompleted = task.status === 'completed';

  // Get border color based on status
  const getBorderColor = () => {
    // Show red if task is actually overdue (by time), regardless of status
    if (isOverdue) return 'var(--c-danger)'; // red
    if (task.status === 'in_progress') return 'var(--c-accent)'; // blue
    if (task.status === 'completed') return 'var(--c-success)'; // green
    return 'var(--c-accent)'; // default purple
  };

  return (
    <div
      className={isCompleted ? styles.taskCardCompleted : styles.taskCard}
      style={{ borderLeftColor: getBorderColor() }}
    >
      <div className={styles.taskContent}>
        <div className={styles.taskHeader}>
          <h3 className={styles.taskTitle}>{task.title}</h3>
        </div>

        {/* Zeitinformationen */}
        <div style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--c-text-muted)' }}>
          {task.scheduled_time && (
            <div>Geplante Zeit: {task.scheduled_time.slice(0, 5)} Uhr</div>
          )}
          {task.start_time && (
            <div>Startzeit: {task.start_time.slice(0, 5)} Uhr</div>
          )}
          {task.end_time && (
            <div>Endzeit: {task.end_time.slice(0, 5)} Uhr</div>
          )}
        </div>

        {task.description && (
          <>
            <div className={styles.taskDescription}>
              {!showFullDescription && task.description.length > 150 ? (
                <>{task.description.substring(0, 150)}...</>
              ) : (
                <>{task.description}</>
              )}
            </div>
            {task.description.length > 150 && (
              <button
                onClick={() => setShowFullDescription(!showFullDescription)}
                className={styles.moreButton}
                style={{ marginTop: '0.25rem', display: 'inline-block' }}
              >
                {showFullDescription ? 'weniger' : 'mehr'}
              </button>
            )}
          </>
        )}

        <div className={styles.taskMeta} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {pending && (
            <span className={styles.pendingBadge} title="Die Änderung wird gesendet, sobald wieder Empfang besteht">
              wird gesendet
            </span>
          )}
        <span className={styles.taskEvent}>{task.event_name}</span>
        <span className={styles.taskDay}>
          Tag {task.day_number} · {getEventDate()}
        </span>
        {task.is_public && (
          <span style={{
            fontSize: '0.7rem',
            padding: '0.125rem 0.5rem',
            backgroundColor: 'var(--c-accent-soft)',
            color: 'var(--c-accent-text)',
            borderRadius: '9999px',
            fontWeight: '500'
          }}>Öffentlich</span>
        )}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* Nur Dropdown anzeigen wenn es Optionen gibt */}
          {task.status === 'not_started' || task.status === 'in_progress' ? (
            <>
              <span
                className={styles.taskStatus}
                style={{
                  backgroundColor: getStatusColor(task.status),
                  color: 'var(--c-text-inverse)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              >
                {getStatusLabel(task.status)} ▼
              </span>
              {showStatusDropdown && (
                <>
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 9998,
                    }}
                    onClick={() => setShowStatusDropdown(false)}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    backgroundColor: 'var(--c-surface)',
                    border: '1px solid var(--c-border-strong)',
                    borderRadius: '4px',
                    boxShadow: 'var(--shadow-md)',
                    marginTop: '4px',
                    minWidth: '180px',
                    zIndex: 9999
                  }}>
                    {task.status === 'not_started' && (
                      <div
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                        onClick={() => handleStatusChange('in_progress')}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--c-surface-muted)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        In Arbeit setzen
                      </div>
                    )}
                    {task.status === 'in_progress' && (
                      <div
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={() => handleStatusChange('not_started')}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--c-surface-muted)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        Nicht gestartet
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            /* Kein Dropdown für completed/overdue - nur Badge */
            <span
              className={styles.taskStatus}
              style={{
                backgroundColor: getStatusColor(task.status),
                color: 'var(--c-text-inverse)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              {getStatusLabel(task.status)}
            </span>
          )}
        </div>
      </div>

      </div>

      {!isCompleted ? (
        <>
          {/*
            Die drei Knöpfe gehören in EINE Zeile. Damit das ohne Quetschen
            aufgeht, sind die Beschriftungen kurz - "Erledigt" heisst der
            Knopf in der Tabellenansicht ohnehin schon. Umbruch bleibt als
            Notausgang erlaubt, greift aber erst bei sehr schmalen Geräten.
          */}
          <div className={styles.taskActions} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {task.assignment_id && !showReminderEdit && task.status !== 'in_progress' && (
              <button
                onClick={() => setShowReminderEdit(true)}
                className={styles.reminderButton}
                style={{
                  flex: '1 1 auto',
                  fontSize: '0.875rem',
                  padding: '10px 16px'
                }}
              >
                Erinnerung
              </button>
            )}
            {(task.status === 'not_started' || task.status === 'overdue') && (
              <button
                onClick={handleSetInProgress}
                disabled={updatingStatus}
                className={styles.inProgressButton}
                style={{
                  backgroundColor: 'var(--c-accent)',
                  color: 'var(--c-text-inverse)',
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: updatingStatus ? 'not-allowed' : 'pointer',
                  opacity: updatingStatus ? 0.6 : 1,
                  flex: '1 1 auto',
                  fontSize: '0.875rem'
                }}
              >
                {updatingStatus ? '…' : 'In Arbeit'}
              </button>
            )}
            {task.assignment_id ? (
              <button
                onClick={() => onComplete(task.assignment_id)}
                className={styles.completeButton}
                style={{
                  flex: '1 1 auto',
                  fontSize: '0.875rem',
                  padding: '10px 16px'
                }}
              >
                Erledigt
              </button>
            ) : (
              <button
                onClick={() => onCompletePublic(task.id)}
                className={styles.completeButton}
                style={{
                  flex: '1 1 auto',
                  fontSize: '0.875rem',
                  padding: '10px 16px'
                }}
              >
                Erledigt
              </button>
            )}
          </div>
          {/* Erinnerung bearbeiten - nur für zugewiesene Aufgaben */}
          {task.assignment_id && showReminderEdit && (
            <div className={styles.reminderEdit} style={{ marginTop: '0.5rem' }}>
              <label className={styles.reminderLabel}>
                Erinnerungszeit (Minuten vorher):
              </label>
              <div className={styles.reminderControls}>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(parseInt(e.target.value))}
                  className={styles.reminderInput}
                />
                <button
                  onClick={handleSaveReminder}
                  disabled={saving}
                  className={styles.reminderSave}
                >
                  {saving ? '...' : '✓'}
                </button>
                <button
                  onClick={() => setShowReminderEdit(false)}
                  className={styles.reminderCancel}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.completedBadge}>Erledigt</div>
      )}
    </div>
  );
};

// Staff Table View Komponente
const StaffTableView: React.FC<{
  tasks: TaskAssignment[];
  allTasks: TaskAssignment[];
  selectedDay: number | 'all';
  onComplete: (id: number) => void;
  onCompletePublic: (taskId: number) => void;
  onStatusUpdate: (taskId: number, newStatus: string) => void;
  onReload: () => void;
  isTaskOverdue: (task: TaskAssignment) => boolean;
}> = ({ tasks, allTasks, selectedDay, onComplete, onCompletePublic, onStatusUpdate, onReload: _onReload, isTaskOverdue }) => {
  const [showStatusDropdown, setShowStatusDropdown] = React.useState<string | null>(null);
  const [sortColumn, setSortColumn] = React.useState<string>('manual');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [descriptionModal, setDescriptionModal] = React.useState<{ title: string; description: string } | null>(null);

  // Filter tasks by selected day
  const dayFilteredTasks = selectedDay === 'all'
    ? tasks
    : tasks.filter(t => t.day_number === selectedDay);

  // Check if only one unique event in ALL tasks (not just filtered)
  const uniqueEventsInAll = new Set(allTasks.map(t => `${t.event_name}#${t.instance_start_date}`));
  const showEventColumn = uniqueEventsInAll.size > 1;

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort tasks based on selected column and direction
  const sortedTasks = [...dayFilteredTasks].sort((a, b) => {
    let compareResult = 0;

    switch (sortColumn) {
      case 'manual':
        // Sort by admin's manual sort order
        const orderA = a.sort_order ?? 999999;
        const orderB = b.sort_order ?? 999999;
        compareResult = orderA - orderB;
        break;
      case 'event':
        compareResult = a.event_name.localeCompare(b.event_name);
        break;
      case 'day':
        compareResult = a.day_number - b.day_number;
        break;
      case 'date':
        const dateA = toLocalDate(a.instance_start_date) ?? new Date(0);
        dateA.setDate(dateA.getDate() + a.day_number - 1);
        const dateB = toLocalDate(b.instance_start_date) ?? new Date(0);
        dateB.setDate(dateB.getDate() + b.day_number - 1);
        compareResult = dateA.getTime() - dateB.getTime();
        break;
      case 'title':
        compareResult = a.title.localeCompare(b.title);
        break;
      case 'scheduled':
        const schedA = a.scheduled_time || '99:99';
        const schedB = b.scheduled_time || '99:99';
        compareResult = schedA.localeCompare(schedB);
        break;
      case 'start':
        const startA = a.start_time || '99:99';
        const startB = b.start_time || '99:99';
        compareResult = startA.localeCompare(startB);
        break;
      case 'end':
        const endA = a.end_time || '99:99';
        const endB = b.end_time || '99:99';
        compareResult = endA.localeCompare(endB);
        break;
      case 'status':
        compareResult = a.status.localeCompare(b.status);
        break;
      default:
        compareResult = 0;
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

  const getStatusColor = (task: TaskAssignment) => {
    // Show red if task is actually overdue (by time), regardless of status
    if (isTaskOverdue(task)) return 'var(--c-danger)';

    const colors: { [key: string]: string } = {
      not_started: 'var(--c-text-muted)',
      in_progress: 'var(--c-accent)',
      completed: 'var(--c-success)',
      overdue: 'var(--c-danger)',
    };
    return colors[task.status] || 'var(--c-text-muted)';
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      not_started: 'Nicht gestartet',
      in_progress: 'In Arbeit',
      completed: 'Erledigt',
      overdue: 'Überfällig',
    };
    return labels[status] || status;
  };

  const getEventDate = (task: TaskAssignment) => {
    const startDate = toLocalDate(task.instance_start_date) ?? new Date();
    startDate.setDate(startDate.getDate() + task.day_number - 1);
    return startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  const handleStatusChange = async (task: TaskAssignment, newStatus: string) => {
    setShowStatusDropdown(null);
    try {
      await onStatusUpdate(task.id, newStatus);
    } catch (error) {
      console.error('Status change error:', error);
    }
  };

  if (sortedTasks.length === 0) {
    return <div className={styles.empty}>Keine Aufgaben für den ausgewählten Tag</div>;
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className={styles.tableContainer}>
      {/* Sort mode indicator */}
      <div style={{
        padding: '0.75rem',
        marginBottom: '1rem',
        backgroundColor: 'var(--c-surface-muted)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--c-text)', fontWeight: '500' }}>
          {sortColumn === 'manual' ? 'Standard-Sortierung aktiv' : '⚠️ Spalten-Sortierung aktiv'}
        </span>
        {sortColumn !== 'manual' && (
          <button
            onClick={() => setSortColumn('manual')}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              backgroundColor: 'var(--c-accent)',
              color: 'var(--c-text-inverse)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Zurück zur Standard-Sortierung
          </button>
        )}
      </div>
      <table className={styles.taskTable}>
        <thead>
          <tr>
            {showEventColumn && (
              <th
                className={styles.hideOnMobile}
                onClick={() => handleSort('event')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Veranstaltung{getSortIcon('event')}
              </th>
            )}
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('day')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Tag{getSortIcon('day')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('date')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Datum{getSortIcon('date')}
            </th>
            <th
              onClick={() => handleSort('title')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Aufgabe{getSortIcon('title')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('scheduled')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Geplante Zeit{getSortIcon('scheduled')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('start')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Start{getSortIcon('start')}
            </th>
            <th
              className={styles.hideOnMobile}
              onClick={() => handleSort('end')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Ende{getSortIcon('end')}
            </th>
            <th
              onClick={() => handleSort('status')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Status{getSortIcon('status')}
            </th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const taskKey = task.assignment_id ? `a-${task.assignment_id}` : `p-${task.id}`;
            return (
              <tr key={taskKey} className={isCompleted ? styles.completedRow : ''}  style={{ position: 'relative', zIndex: showStatusDropdown === taskKey ? 200 : 1 }}>
                {showEventColumn && <td className={styles.hideOnMobile}>{task.event_name}</td>}
                <td className={styles.hideOnMobile}>{task.day_number}</td>
                <td className={styles.hideOnMobile}>{getEventDate(task)}</td>
                <td>
                  <div className={styles.taskTitleCell}>
                    <strong>{task.title}</strong>
                    {task.is_public && <span className={styles.publicBadge}>Öffentlich</span>}
                  </div>
                  {task.description && (
                    <>
                      <div className={styles.taskDescCell}>
                        {task.description.length > 25 ? `${task.description.substring(0, 25)}...` : task.description}
                      </div>
                      {task.description.length > 25 && (
                        <button
                          onClick={() => setDescriptionModal({ title: task.title, description: task.description! })}
                          className={styles.moreButton}
                          style={{ marginTop: '0.25rem', display: 'block' }}
                        >
                          mehr
                        </button>
                      )}
                    </>
                  )}
                  <div className={styles.showOnMobile}>
                    <div className={styles.mobileMeta}>
                      {showEventColumn && <div>{task.event_name}</div>}
                      <div>Tag {task.day_number} · {getEventDate(task)}</div>
                      {task.scheduled_time && <div>{task.scheduled_time.slice(0, 5)} Uhr</div>}
                      {task.start_time && <div>{task.start_time.slice(0, 5)} Uhr</div>}
                      {task.end_time && <div>{task.end_time.slice(0, 5)} Uhr</div>}
                    </div>
                  </div>
                </td>
                <td className={styles.hideOnMobile}>{task.scheduled_time ? task.scheduled_time.slice(0, 5) : '-'}</td>
                <td className={styles.hideOnMobile}>{task.start_time ? task.start_time.slice(0, 5) : '-'}</td>
                <td className={styles.hideOnMobile}>{task.end_time ? task.end_time.slice(0, 5) : '-'}</td>
                <td>
                  <div className={styles.statusDropdownContainer}>
                    {task.status !== 'completed' ? (
                      <>
                        <span
                          className={styles.statusBadgeClickable}
                          style={{ backgroundColor: getStatusColor(task) }}
                          onClick={() => setShowStatusDropdown(showStatusDropdown === taskKey ? null : taskKey)}
                        >
                          {getStatusLabel(task.status)} ▼
                        </span>
                        {showStatusDropdown === taskKey && (
                          <>
                          {/* Klick ins Leere schliesst das Menü */}
                          <div
                            className={styles.dropdownBackdrop}
                            onClick={() => setShowStatusDropdown(null)}
                          />
                          <div className={styles.statusDropdown}>
                            {task.status !== 'not_started' && (
                              <div
                                className={styles.statusOption}
                                onClick={() => handleStatusChange(task, 'not_started')}
                              >
                                Nicht gestartet
                              </div>
                            )}
                            {task.status !== 'in_progress' && (
                              <div
                                className={styles.statusOption}
                                onClick={() => handleStatusChange(task, 'in_progress')}
                              >
                                In Arbeit
                              </div>
                            )}
                            {task.status !== 'completed' && (
                              <div
                                className={styles.statusOption}
                                onClick={() => handleStatusChange(task, 'completed')}
                              >
                                Erledigt
                              </div>
                            )}
                          </div>
                          </>
                        )}
                      </>
                    ) : (
                      /* Kein Dropdown für completed - nur Badge */
                      <span
                        className={styles.statusBadge}
                        style={{ backgroundColor: getStatusColor(task) }}
                      >
                        {getStatusLabel(task.status)}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {!isCompleted && (
                    task.assignment_id ? (
                      <button
                        onClick={() => onComplete(task.assignment_id)}
                        className={styles.tableCompleteButton}
                      >
                        Erledigt
                      </button>
                    ) : (
                      <button
                        onClick={() => onCompletePublic(task.id)}
                        className={styles.tableCompleteButton}
                      >
                        Erledigt
                      </button>
                    )
                  )}
                  {isCompleted && (
                    <span className={styles.completedText}>✓ Erledigt</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {descriptionModal && (
        <DescriptionModal
          title={descriptionModal.title}
          description={descriptionModal.description}
          onClose={() => setDescriptionModal(null)}
        />
      )}
    </div>
  );
};

// Helper Funktionen für Gruppierungen - arbeiten mit gefilterten Tasks
function groupTasksByEventDay(tasks: TaskAssignment[]): { [key: string]: TaskAssignment[] } {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    // Stelle sicher dass JEDE Task eine Gruppe bekommt
    const eventName = task.event_name || 'Unbekanntes Event';
    const dayNumber = task.day_number ?? 1; // Use nullish coalescing to catch 0
    const instanceNumber = task.instance_number ?? 1;
    const key = `${eventName} ${instanceNumber > 1 ? `(#${instanceNumber})` : ''} - Tag ${dayNumber}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  });

  // Sortiere Gruppen nach Event, Instanz und Tag
  return Object.keys(grouped)
    .sort((a, b) => {
      const taskA = grouped[a][0];
      const taskB = grouped[b][0];

      const eventCompare = (taskA.event_name || '').localeCompare(taskB.event_name || '');
      if (eventCompare !== 0) return eventCompare;

      const instanceCompare = (taskA.instance_number || 0) - (taskB.instance_number || 0);
      if (instanceCompare !== 0) return instanceCompare;

      return (taskA.day_number || 0) - (taskB.day_number || 0);
    })
    .reduce((acc, key) => {
      // Sortiere Tasks innerhalb jeder Gruppe nach sort_order
      acc[key] = grouped[key].sort((a, b) => {
        const orderA = a.sort_order ?? 999999;
        const orderB = b.sort_order ?? 999999;
        return orderA - orderB;
      });
      return acc;
    }, {} as { [key: string]: TaskAssignment[] });
}

function groupTasksByEvent(tasks: TaskAssignment[]): { [key: string]: TaskAssignment[] } {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    // Stelle sicher dass JEDE Task eine Gruppe bekommt
    const eventName = task.event_name || 'Unbekanntes Event';
    const instanceNumber = task.instance_number ?? 1;
    const key = instanceNumber > 1 ? `${eventName} (#${instanceNumber})` : eventName;

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  });

  // Sortiere Tasks innerhalb jeder Gruppe nach Tag und sort_order
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => {
      const dayCompare = (a.day_number || 0) - (b.day_number || 0);
      if (dayCompare !== 0) return dayCompare;

      const orderA = a.sort_order ?? 999999;
      const orderB = b.sort_order ?? 999999;
      return orderA - orderB;
    });
  });

  return grouped;
}

function groupTasksByDate(tasks: TaskAssignment[]): { [key: string]: TaskAssignment[] } {
  const grouped: { [key: string]: TaskAssignment[] } = {};

  tasks.forEach((task) => {
    try {
      // Stelle sicher dass JEDE Task eine Gruppe bekommt
      if (!task.instance_start_date) {
        throw new Error('Kein Startdatum');
      }
      const startDate = toLocalDate(task.instance_start_date) ?? new Date();
      if (isNaN(startDate.getTime())) {
        throw new Error('Ungültiges Datum');
      }

      const dayNumber = task.day_number ?? 1;
      startDate.setDate(startDate.getDate() + dayNumber - 1);

      const dateStr = startDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }
      grouped[dateStr].push(task);
    } catch (error) {
      // Fallback für Tasks ohne gültiges Datum
      const eventName = task.event_name || 'Unbekanntes Event';
      const fallbackKey = `${eventName} - Unbekanntes Datum`;
      if (!grouped[fallbackKey]) {
        grouped[fallbackKey] = [];
      }
      grouped[fallbackKey].push(task);
    }
  });

  // Sortiere nach tatsächlichem Datum
  return Object.keys(grouped)
    .sort((a, b) => {
      // "Unbekanntes Datum" Gruppen ans Ende
      if (a.includes('Unbekanntes Datum')) return 1;
      if (b.includes('Unbekanntes Datum')) return -1;

      const taskA = grouped[a][0];
      const taskB = grouped[b][0];

      try {
        const dateA = toLocalDate(taskA.instance_start_date) ?? new Date();
        dateA.setDate(dateA.getDate() + (taskA.day_number ?? 1) - 1);

        const dateB = toLocalDate(taskB.instance_start_date) ?? new Date();
        dateB.setDate(dateB.getDate() + (taskB.day_number ?? 1) - 1);

        return dateA.getTime() - dateB.getTime();
      } catch (error) {
        return 0; // Fallback: keine Sortierung
      }
    })
    .reduce((acc, key) => {
      // Sortiere Tasks innerhalb jeder Gruppe nach sort_order
      acc[key] = grouped[key].sort((a, b) => {
        const orderA = a.sort_order ?? 999999;
        const orderB = b.sort_order ?? 999999;
        return orderA - orderB;
      });
      return acc;
    }, {} as { [key: string]: TaskAssignment[] });
}
