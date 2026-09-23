import React, { useState, useEffect, useRef } from 'react';
import { eventsApi } from '../../api/events';
import { tasksApi, Task } from '../../api/tasks';
import { usersApi, User } from '../../api/users';
import { programApi, TaskGroup } from '../../api/program';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { useSSE } from '../../hooks/useSSE';
import { useAuth } from '../../context/AuthContext';
import { TaskFormModal } from './TaskFormModal';
import { TaskAssignmentModal } from './TaskAssignmentModal';
import { TaskTableView, TaskTableViewHandle } from './TaskTableView';
import { TaskSeriesModal } from './TaskSeriesModal';
import { GruppeBearbeitenModal } from './GruppeBearbeitenModal';
import { gruppenLeisteStil } from '../../utils/gruppenFarben';
import { Rangzeile } from '../../api/tasks';
import { DuplicateEventModal } from './DuplicateEventModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { EventEditModal } from './EventEditModal';
import { EventStaffPool } from './EventStaffPool';
import { StatusFilter } from './StatusFilter';
import { DeaktiviertFilter, DeaktiviertWahl } from './DeaktiviertFilter';
import { StatusCell } from './StatusCell';
import { Toast } from '../Toast';
import client from '../../api/client';
import { toLocalDate } from '../../utils/date';
import { eventBadgeColors, eventRolleVon, eventAssignmentTitle } from '../../utils/roleBadge';
import { BedarfBadge, hatBedarf, bedarfGesamt } from './BedarfBadge';
import { NotizKnopf, NotizText, NotizVorschau } from './Notiz';
import { DaySelection, resolveInitialDayForEvent, storeDay } from '../../utils/dayPreference';
import { zeilenMitGruppen, zugeklappteGruppen, merkeZugeklappt, gruppenZeit, Sortierung } from '../../utils/taskGroups';
import styles from './EventDetail.module.css';

const STATUS_LABELS: { [key: string]: string } = {
  not_started: 'Offen',
  in_progress: 'In Arbeit',
  completed: 'Erledigt',
  overdue: 'Überfällig',
};

interface Props {
  eventId: number;
  onBack: () => void;
}

export const EventDetail: React.FC<Props> = ({ eventId, onBack }) => {
  const { isAdmin, isTeamleiter } = useAuth();
  const [event, setEvent] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Aufgabengruppen der Veranstaltung - Zwischenueberschriften in beiden
  // Ansichten. Wurden hier schon geladen, aber nie benutzt.
  const [gruppen, setGruppen] = useState<TaskGroup[]>([]);
  const [_users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  /*
   * Ohne diesen Zustand rannte die Ansicht nach einem fehlgeschlagenen Laden
   * in "event.name" - und riss mit "Cannot read properties of null" die
   * ganze Seite mit. Genau das passiert einer Teamleitung, die in einer
   * fremden Veranstaltung nur mithilft: der Server antwortet mit 403.
   */
  const [ladeFehler, setLadeFehler] = useState<'keine-berechtigung' | 'weg' | 'fehler' | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<number | null>(null);
  // "cards" statt "list" - dieselbe Benennung wie in den Einstellungen und
  // im Mitarbeiterbereich, damit die gespeicherte Standardansicht überhaupt
  // zugeordnet werden kann. Der Startwert wird in loadData überschrieben.
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DaySelection>('all');
  const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // Beschreibungen sind oft lang - eingeklappt starten, damit Aufgaben
  // und Mitarbeiterpool ohne Scrollen erreichbar sind.
  const [showDescription, setShowDescription] = useState(false);
  /*
   * Ist die Notiz der Veranstaltung gerade aufgeklappt? Bewusst nicht
   * gemerkt: die Notiz soll beim naechsten Besuch wieder als kurze
   * Plakette in der Kopfzeile stehen, nicht als Block ueber der Liste.
   */
  const [notizOffen, setNotizOffen] = useState(false);
  const scrollPositionRef = useRef<number>(0);
  const tableRef = useRef<TaskTableViewHandle>(null);
  // Standardansicht und Tagesauswahl nur beim ersten Laden setzen - sonst
  // würde jedes Hintergrund-Reload eine gerade getroffene Wahl überschreiben.
  const viewInitRef = useRef(false);
  const dayInitRef = useRef<string>('');

  useEffect(() => {
    viewInitRef.current = false;
    dayInitRef.current = '';
    loadData();

    // SSE handles live updates, no need for polling fallback
    // The 30-second interval was causing unnecessary reloads
  }, [eventId]);

  /*
   * Standardansicht aus den Einstellungen. Der Admin-Bereich hat diese
   * Einstellung bisher schlicht ignoriert und immer die Tabelle gezeigt.
   * Gespeichert wird "cards" oder "table" - dieselben Werte wie im
   * Mitarbeiterbereich.
   */
  const loadDefaultView = async () => {
    try {
      const response = await client.get('/users/me/settings');
      const value = response.data?.default_view;
      if (value === 'cards' || value === 'table') {
        setViewMode(value);
      }
    } catch (error) {
      console.error('Load default view error:', error);
    }
  };

  const handleDayChange = (day: DaySelection) => {
    setSelectedDay(day);
    if (dayInitRef.current) storeDay(dayInitRef.current, day);
  };

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setLadeFehler(null);
      const [eventData, tasksData, programData, usersData] = await Promise.all([
        eventsApi.getById(eventId),
        tasksApi.getByEvent(eventId),
        programApi.getByEvent(eventId),
        usersApi.getAll(),
      ]);

      setEvent(eventData);
      setTasks(tasksData);
      setGruppen(programData);
      setUsers(usersData);

      const instance = eventData.instances.find((i: any) => i.id === selectedInstance)
        ?? eventData.instances[0];
      if (eventData.instances.length > 0 && !selectedInstance) {
        setSelectedInstance(eventData.instances[0].id);
      }

      // Zuletzt angesehener Tag bzw. der heutige Veranstaltungstag.
      // Der Schlüssel hängt an der Durchführung, weil deren Startdatum die
      // Tagesnummern bestimmt.
      if (instance) {
        const scope = `event:${eventId}:${instance.id}`;
        if (dayInitRef.current !== scope) {
          dayInitRef.current = scope;
          setSelectedDay(resolveInitialDayForEvent(scope, instance.start_date, Number(eventData.days)));
        }
      }

      if (!viewInitRef.current) {
        viewInitRef.current = true;
        loadDefaultView();
      }
    } catch (error: any) {
      console.error('Load event detail error:', error);
      const status = error?.response?.status;
      setLadeFehler(status === 403 ? 'keine-berechtigung' : status === 404 ? 'weg' : 'fehler');

      /*
       * Die zuletzt geoeffnete Veranstaltung wird gemerkt und beim naechsten
       * Start wieder geoeffnet. Wenn man sie nicht (mehr) oeffnen darf, muss
       * die Merkung weg - sonst landet man bei jedem Start wieder hier.
       */
      if (status === 403 || status === 404) {
        try { localStorage.removeItem('adminSelectedEventId'); } catch { /* egal */ }
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreateTask = () => {
    setEditTask(null);
    setShowTaskForm(true);
  };

  const handleEditTask = (taskOrId: Task | number) => {
    if (typeof taskOrId === 'number') {
      const task = tasks.find(t => t.id === taskOrId);
      if (task) {
        setEditTask(task);
        setShowTaskForm(true);
      }
    } else {
      setEditTask(taskOrId);
      setShowTaskForm(true);
    }
  };

  const handleAssignTask = (taskId: number) => {
    if (!selectedInstance) {
      alert('Bitte wähle eine Durchführung aus');
      return;
    }
    setAssignTaskId(taskId);
    setShowAssignModal(true);
  };

  const handleToggleTemplate = async () => {
    if (!isAdmin) return;

    const newTemplateStatus = !event.is_template;
    const confirmMessage = newTemplateStatus
      ? 'Dieses Event als Vorlage markieren?'
      : 'Vorlage-Status entfernen und zu normalem Event machen?';

    if (!confirm(confirmMessage)) return;

    try {
      await eventsApi.toggleTemplate(eventId, newTemplateStatus);
      setEvent({ ...event, is_template: newTemplateStatus });
      alert(newTemplateStatus ? 'Event wurde als Vorlage markiert' : 'Vorlage-Status wurde entfernt');
    } catch (error) {
      console.error('Toggle template error:', error);
      alert('Fehler beim Ändern des Template-Status');
    }
  };

  const handleCopyToTemplate = async () => {
    if (!confirm('Veranstaltung als Vorlage kopieren? (ohne Zuweisungen und Datum)')) return;

    try {
      await eventsApi.copyToTemplate(eventId);
      alert('Vorlage erfolgreich erstellt');
      // Reload data to show the new template
      await loadData(false);
    } catch (error: any) {
      console.error('Copy to template error:', error);
      const errorMsg = error.response?.data?.details || error.response?.data?.error || 'Fehler beim Erstellen der Vorlage';
      alert(errorMsg);
    }
  };

  const handleApproveSuggestion = async () => {
    if (!confirm('Vorschlag als Vorlage annehmen? Eine neue Vorlage wird erstellt.')) return;

    try {
      const response = await eventsApi.approveSuggestion(eventId);
      const debugInfo = response.debug ? `\n\nKopiert: ${response.debug.copiedTasks} Aufgaben, ${response.debug.copiedProgram} Programmpunkte` : '';
      alert('Vorschlag wurde angenommen und als Vorlage erstellt' + debugInfo);
      // Reload data to update the suggestion flag
      await loadData(false);
    } catch (error: any) {
      console.error('Approve suggestion error:', error);
      const errorMsg = error.response?.data?.details || error.response?.data?.error || 'Fehler beim Annehmen des Vorschlags';
      alert(errorMsg);
    }
  };

  const handleViewModeChange = (newMode: 'cards' | 'table') => {
    // Save current scroll position
    scrollPositionRef.current = window.scrollY;

    // Change view mode
    setViewMode(newMode);

    // Restore scroll position after React finishes rendering
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositionRef.current);
    });

    // "Alle Tage" ist jetzt auch in der Listenansicht gültig - kein
    // erzwungener Sprung auf Tag 1 mehr.
  };

  // Zeitraum der gewählten Durchführung. Die Aufgaben rechnen mit dem
  // Startdatum der INSTANZ, nicht dem des Events - deshalb hier dieselbe
  // Quelle, damit die Anzeige zu den Aufgabenterminen passt.
  const currentInstance = event?.instances?.find((i: any) => i.id === selectedInstance)
    ?? event?.instances?.[0];
  const rangeStart = toLocalDate(currentInstance?.start_date);
  const rangeValid = rangeStart && !isNaN(rangeStart.getTime()) && rangeStart.getFullYear() >= 2000;
  const rangeEnd = rangeValid ? new Date(rangeStart) : null;
  if (rangeEnd) rangeEnd.setDate(rangeEnd.getDate() + Number(event.days) - 1);
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const eventRange = rangeValid && rangeEnd
    ? (Number(event.days) === 1 ? fmt(rangeStart) : `${fmt(rangeStart)} – ${fmt(rangeEnd)}`)
    : null;

  /*
   * Notiz der Veranstaltung - dieselbe Regel wie fuers Bearbeiten: Admin
   * immer, Teamleitung ausser an Vorlagen.
   */
  const darfNotizSchreiben = !!event && (isAdmin || (isTeamleiter && !event.is_template));

  const notizSpeichern = async (text: string) => {
    try {
      const antwort = await eventsApi.setzeNotiz(event.id, text);
      setEvent((alt: any) => ({ ...alt, note: antwort.note }));
      // Geloescht? Dann gibt es nichts mehr aufzuklappen.
      if (!antwort.note) setNotizOffen(false);
    } catch (error) {
      console.error('Save event note error:', error);
      alert('Notiz konnte nicht gespeichert werden');
    }
  };

  if (loading) {
    return <div>Lade Details...</div>;
  }

  if (ladeFehler || !event) {
    const text = ladeFehler === 'keine-berechtigung'
      ? 'Diese Veranstaltung wird von jemand anderem geleitet. Du kannst sie deshalb nicht öffnen - deine Aufgaben darin findest du unter "Meine Aufgaben".'
      : ladeFehler === 'weg'
        ? 'Diese Veranstaltung gibt es nicht mehr.'
        : 'Die Veranstaltung konnte nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.';

    return (
      <div className={styles.ladeFehler} role="alert">
        <p className={styles.ladeFehlerText}>{text}</p>
        <div className={styles.ladeFehlerAktionen}>
          <button onClick={onBack} className={styles.backButton} type="button">
            Zurück zur Übersicht
          </button>
          {ladeFehler === 'fehler' && (
            <button onClick={() => { setLadeFehler(null); loadData(); }} className={styles.secondaryButton} type="button">
              Erneut versuchen
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Titelzeile: Zurück, Name, Info-Button und Aktionen teilen sich eine
          Zeile. Die Beschreibung hängt am "i" statt eine eigene Zeile zu
          belegen. */}
      <div className={styles.titleRow}>
        <button onClick={onBack} className={styles.backButton} type="button">
          Zurück
        </button>
        {/* title-Attribut: am Handy wird der Name gekuerzt (siehe CSS). */}
        <h2 className={styles.title} title={event.name}>{event.name}</h2>

        {/*
          Notiz zur Veranstaltung. Nur fuer die Leitung; im
          Mitarbeiterbereich gibt es sie nicht.

          Sie steht LINKS vom "i" - dort stand sie von Anfang an, und der
          Platz gehoert dem, was zur Veranstaltung selbst gehoert.

          Ohne Notiz steht hier das ✎, rund wie das "i" daneben. Gibt es
          eine, tritt das Zeichen zurueck und an seiner Stelle steht der
          ANFANG DES TEXTES - in der Kopfzeile ist kein Platz fuer beides,
          und von beidem ist der Text das Wichtigere. Ein Klick darauf
          klappt die ganze Notiz unter der Zeile auf; das Aendern sitzt
          dann als "Bearbeiten" am Kasten (siehe unten).
        */}
        {darfNotizSchreiben && (
          event.note && !notizOffen
            ? (
              <NotizVorschau
                notiz={event.note}
                className={styles.notizVorschau}
                oeffnen={() => setNotizOffen(true)}
              />
            )
            : !event.note
              ? (
                <NotizKnopf
                  titel={event.name}
                  notiz={event.note}
                  className={styles.infoButton}
                  speichern={notizSpeichern}
                />
              )
              : null
        )}

        {(
          <button
            onClick={() => setShowDescription(v => !v)}
            className={showDescription ? styles.infoButtonActive : styles.infoButton}
            aria-expanded={showDescription}
            aria-label="Beschreibung anzeigen"
            title="Beschreibung anzeigen"
            type="button"
          >
            i
          </button>
        )}

        <div className={styles.titleRowActions}>
          {event.is_template_suggestion && isAdmin && (
            <button
              onClick={handleApproveSuggestion}
              className={styles.approveButton}
              title="Vorschlag als Vorlage annehmen"
            >
              Annehmen
            </button>
          )}

          <div className={styles.actionMenu}>
            <button
              onClick={() => setShowActions(v => !v)}
              className={styles.actionMenuToggle}
              aria-expanded={showActions}
              aria-haspopup="true"
              type="button"
            >
              Aktionen
            </button>
            {showActions && (
              <>
                <div className={styles.menuBackdrop} onClick={() => setShowActions(false)} />
                <div className={styles.actionMenuList} role="menu">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => { setShowActions(false); handleToggleTemplate(); }}
                        className={styles.actionMenuItem}
                        role="menuitem"
                      >
                        {event.is_template ? 'Vorlage → Event' : 'Als Vorlage'}
                      </button>
                      {!event.is_template && (
                        <button
                          onClick={() => { setShowActions(false); handleCopyToTemplate(); }}
                          className={styles.actionMenuItem}
                          role="menuitem"
                        >
                          Kopie als Vorlage
                        </button>
                      )}
                    </>
                  )}
                  {(isAdmin || (isTeamleiter && !event.is_template)) && (
                    <button
                      onClick={() => { setShowActions(false); setShowEditModal(true); }}
                      className={styles.actionMenuItem}
                      role="menuitem"
                    >
                      Bearbeiten
                    </button>
                  )}
                  {event.is_template && (
                    <button
                      onClick={() => { setShowActions(false); setShowTemplateModal(true); }}
                      className={styles.actionMenuItem}
                      role="menuitem"
                    >
                      Vorlage verwenden
                    </button>
                  )}
                  {(isAdmin || (isTeamleiter && !event.is_template)) && (
                    <button
                      onClick={() => { setShowActions(false); setShowDuplicateModal(true); }}
                      className={styles.actionMenuItem}
                      role="menuitem"
                    >
                      Duplizieren
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showDescription && (
        <div className={styles.description}>
          <dl className={styles.factList}>
            <dt>Dauer</dt>
            <dd>{event.days} {event.days === 1 ? 'Tag' : 'Tage'}</dd>
            {eventRange && (
              <>
                <dt>Zeitraum</dt>
                <dd>{eventRange}</dd>
              </>
            )}
          </dl>
          {event.description && <p className={styles.descriptionText}>{event.description}</p>}
        </div>
      )}

      {/*
        Die aufgeklappte Notiz - nur solange man sie aufhat; beim naechsten
        Oeffnen der Veranstaltung steht wieder die Plakette in der
        Kopfzeile. Zugeklappt wird durch einen Klick auf den Text, genau
        wie in Tabelle und Karten. Daneben "Bearbeiten": das ✎ waere neben
        dem gelben Kasten nicht mehr zu unterscheiden von dem Zeichen im
        Kasten selbst.
      */}
      {darfNotizSchreiben && event.note && notizOffen && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
          margin: '-0.25rem 0 1rem',
        }}>
          <NotizText
            notiz={event.note}
            offen
            onUmschalten={() => setNotizOffen(false)}
            style={{ flex: '1 1 auto', fontSize: '0.8125rem' }}
          />
          <NotizKnopf
            titel={event.name}
            notiz={event.note}
            beschriftung="Bearbeiten"
            speichern={notizSpeichern}
          />
        </div>
      )}


      {/* Durchführungen nur zeigen, wenn es wirklich mehrere gibt - bei
          einer einzigen ist die Auswahl reine Platzverschwendung. */}
      {(event as any).instances.length > 1 && (
        <div className={styles.section}>
          <h3>Durchführungen</h3>
          <div className={styles.instances}>
            {(event as any).instances.map((instance: any) => {
              const date = toLocalDate(instance.start_date);
              const isValidDate = date && !isNaN(date.getTime()) && date.getFullYear() >= 2000;
              return (
                <button
                  key={instance.id}
                  onClick={() => setSelectedInstance(instance.id)}
                  className={selectedInstance === instance.id ? styles.instanceActive : styles.instance}
                >
                  #{instance.instance_number}
                  {isValidDate ? ` - ${date.toLocaleDateString('de-DE')}` : ' - Vorlage'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Teamleiter sehen Mitarbeiterpool bei Vorlagen nicht */}
      {(isAdmin || !event.is_template) && (
        <div className={styles.section}>
          <EventStaffPool eventId={eventId} leitung={event?.teamleiter} />
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleRow}>
            <h3>Aufgaben</h3>
            {/* Nur in der Tabellenansicht: die CSV-Modals leben in
                TaskTableView, und dessen Container ist in der Listenansicht
                display:none - die Popups wären unsichtbar aufgegangen. Zum
                Exportieren einzelner Aufgaben braucht es ausserdem die
                Auswahlkästchen, die nur die Tabelle hat. */}
            {viewMode === 'table' && (isAdmin || (isTeamleiter && !event.is_template)) && (
              <div className={styles.csvGroup}>
                <button onClick={() => tableRef.current?.openImport()} className={styles.csvButton} type="button">
                  Importieren
                </button>
                <span className={styles.csvDivider} aria-hidden="true" />
                <button onClick={() => tableRef.current?.openExport()} className={styles.csvButton} type="button">
                  Exportieren
                </button>
              </div>
            )}
          </div>
          <div className={styles.headerActions}>
            <div className={styles.viewToggle}>
              <button
                onClick={() => handleViewModeChange('cards')}
                className={viewMode === 'cards' ? styles.viewButtonActive : styles.viewButton}
                type="button"
              >
                Karten
              </button>
              <button
                onClick={() => handleViewModeChange('table')}
                className={viewMode === 'table' ? styles.viewButtonActive : styles.viewButton}
                type="button"
              >
                Tabelle
              </button>
              <button
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await loadData(false);
                    setManualRefreshTrigger(prev => prev + 1);
                  } finally {
                    setRefreshing(false);
                  }
                }}
                className={refreshing ? `${styles.viewButton} ${styles.refreshing}` : styles.viewButton}
                title="Daten aktualisieren"
                type="button"
                disabled={refreshing}
              >
                {/* eigenes Element, damit die Füllung dahinter liegen kann */}
                <span>{refreshing ? 'Aktualisiere…' : 'Aktualisieren'}</span>
              </button>
            </div>
            {/* Nur Admins und Teamleiter können Aufgaben erstellen, Teamleiter aber nicht bei Vorlagen */}
            {(isAdmin || (isTeamleiter && !event.is_template)) && (
              /* Eigene Zeile: im gemeinsamen Container mit dem 100% breiten
                 Umschalter brach der Flex-Umbruch die beiden auseinander. */
              <div className={styles.taskActions}>
                <button
                  onClick={() => setShowSeriesModal(true)}
                  className={styles.secondaryButton}
                  type="button"
                >
                  Serien &amp; Gruppen
                </button>
                <button onClick={handleCreateTask} className={styles.addButton}>
                  Neue Aufgabe
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Beide Ansichten bleiben eingehaengt (Zustand, Verweise), aber die
            unsichtbare laedt nichts nach - siehe "aktiv". */}
        <div style={{ display: viewMode === 'cards' ? 'block' : 'none' }}>
          <TaskListView
            aktiv={viewMode === 'cards'}
            selectedDay={selectedDay}
            eventDays={event?.days}
            onDayChange={handleDayChange}
            selectedInstance={selectedInstance}
            onEditTask={handleEditTask}
            onAssignTask={handleAssignTask}
            gruppen={gruppen}
            eventId={eventId}
            onGruppenRaenge={(raenge) => setGruppen((alt) => alt.map((g) =>
              raenge.has(g.id) ? { ...g, sort_order: raenge.get(g.id) } : g))}
            onGruppenGeaendert={() => loadData(false)}
            event={event}
            manualRefreshTrigger={manualRefreshTrigger}
            readOnly={isTeamleiter && event.is_template}
          />
        </div>
        {selectedInstance && (
          <div style={{ display: viewMode === 'table' ? 'block' : 'none' }}>
            <TaskTableView
              aktiv={viewMode === 'table'}
              leitung={event?.teamleiter}
              ref={tableRef}
              eventInstanceId={selectedInstance}
              onEditTask={handleEditTask}
              onAssignTask={handleAssignTask}
              onTasksChanged={() => loadData(false)}
              gruppen={gruppen}
              /* Neue Gruppenraenge nach einem Verschieben direkt eintragen -
                 die Liste der Gruppen liegt hier, nicht in der Tabelle. */
              onGruppenRaenge={(raenge) => setGruppen((alt) => alt.map((g) =>
                raenge.has(g.id) ? { ...g, sort_order: raenge.get(g.id) } : g))}
              eventDays={event?.days}
              selectedDay={selectedDay}
              onSelectedDayChange={handleDayChange}
              instanceStartDate={(event as any)?.instances.find((i: any) => i.id === selectedInstance)?.start_date}
              manualRefreshTrigger={manualRefreshTrigger}
              readOnly={isTeamleiter && event.is_template}
              eventId={event.id}
            />
          </div>
        )}
      </div>

      {showTaskForm && (
        <TaskFormModal
          eventId={eventId}
          task={editTask}
          eventInstances={(event as any)?.instances}
          defaultDay={typeof selectedDay === 'number' ? selectedDay : 1}
          onClose={() => {
            setShowTaskForm(false);
            setEditTask(null);
          }}
          onSuccess={() => {
            setShowTaskForm(false);
            setEditTask(null);
            loadData(false); // Update without loading indicator
            setManualRefreshTrigger(prev => prev + 1); // Trigger refresh in TaskListView
          }}
        />
      )}

      {showAssignModal && assignTaskId && selectedInstance && (
        <TaskAssignmentModal
          taskId={assignTaskId}
          eventId={eventId}
          eventInstanceId={selectedInstance}
          onClose={() => {
            setShowAssignModal(false);
            setAssignTaskId(null);
          }}
          onSuccess={() => {
            setShowAssignModal(false);
            setAssignTaskId(null);
            loadData(false); // Update without loading indicator
          }}
        />
      )}

      {showDuplicateModal && (
        <DuplicateEventModal
          event={event}
          onClose={() => setShowDuplicateModal(false)}
          onSuccess={() => {
            setShowDuplicateModal(false);
            onBack(); // Zurück zur Event-Liste nach erfolgreichem Duplizieren
          }}
        />
      )}

      {showEditModal && (
        <EventEditModal
          event={event}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            loadData(false); // Reload event data after edit
          }}
          onDelete={() => {
            setShowEditModal(false);
            onBack(); // Zurück zur Liste nach Löschen
          }}
        />
      )}

      {showTemplateModal && (
        <CreateFromTemplateModal
          templates={[event]}
          onClose={() => setShowTemplateModal(false)}
          onSuccess={() => {
            setShowTemplateModal(false);
            onBack(); // Zurück zur Event-Liste nach erfolgreichem Erstellen
          }}
        />
      )}

      {showSeriesModal && (
        <TaskSeriesModal
          eventId={eventId}
          eventDays={event.days}
          onClose={() => setShowSeriesModal(false)}
          onSeriesCreated={() => {
            // Beide Ansichten neu laden, damit Serien-Zuweisungen sofort sichtbar sind
            loadData(false);
            setManualRefreshTrigger(prev => prev + 1);
          }}
          onGruppenGeaendert={() => {
            loadData(false);
            setManualRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
};

// Erweiterte Listen-Ansicht mit Zeiten, MAs und Status
interface TaskListViewProps {
  /**
   * Ist diese Ansicht gerade sichtbar? Die andere bleibt eingehaengt, soll
   * aber nichts nachladen - sonst holt bei jeder Meldung auch die Ansicht
   * Daten, die niemand sieht.
   */
  aktiv?: boolean;
  /** Aufgabengruppen - Zwischenueberschriften ueber ihren Aufgaben. */
  gruppen?: TaskGroup[];
  /** Fuer den Bearbeiten-Dialog einer Gruppe. */
  eventId?: number;
  /** Neue Raenge der Gruppen nach einem Verschieben - siehe Tabellenansicht. */
  onGruppenRaenge?: (raenge: Map<number, number>) => void;
  /** Nach Umbenennen/Loeschen einer Gruppe: Elternansicht nachladen. */
  onGruppenGeaendert?: () => void;
  selectedDay: number | 'all';
  selectedInstance: number | null;
  onEditTask: (task: Task) => void;
  onAssignTask: (taskId: number) => void;
  event?: any; // Für overdue check
  manualRefreshTrigger?: number;
  readOnly?: boolean;
  eventDays?: number;
  onDayChange?: (day: number | 'all') => void;
}

const TaskListView: React.FC<TaskListViewProps> = ({
  aktiv = true,
  gruppen = [],
  eventId,
  onGruppenRaenge,
  onGruppenGeaendert,
  selectedDay,
  selectedInstance,
  onEditTask,
  onAssignTask,
  event,
  manualRefreshTrigger,
  readOnly = false,
  eventDays,
  onDayChange,
}) => {
  const [gruppeInBearbeitung, setGruppeInBearbeitung] = useState<TaskGroup | null>(null);
  /** Zuletzt verschobene Aufgabe - wird kurz hervorgehoben. */
  const [zuletztVerschoben, setZuletztVerschoben] = React.useState<number | null>(null);
  const verschobenRef = React.useRef<number | undefined>(undefined);
  /** Was ich selbst ausgeloest habe - um die eigene SSE-Meldung zu erkennen. */
  const eigeneAktionRef = React.useRef<{ art: 'aufgabe' | 'gruppe'; id: number } | null>(null);
  const verpasstRef = React.useRef<any[]>([]);
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'manual' | 'time' | 'title' | 'status'>('manual');
  // Gleicher Filter wie in der Tabellenansicht, damit beide gleich bedienbar sind.
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  /** Nur Aufgaben, fuer die noch Leute fehlen - wie in der Tabelle. */
  const [nurNichtEingeteilt, setNurNichtEingeteilt] = React.useState(false);
  /** Deaktivierte: ausblenden, mit anzeigen oder nur diese - wie in der Tabelle. */
  const [deaktiviertFilter, setDeaktiviertFilter] = React.useState<DeaktiviertWahl>('aus');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<Set<number>>(new Set());
  const pendingActionsRef = React.useRef<number>(0);
  const [taskSeries, setTaskSeries] = React.useState<TaskSeries[]>([]);
  const [seriesMembers, setSeriesMembers] = React.useState<{ [seriesId: number]: { id: number; name: string }[] }>({});

  // SSE for real-time updates
  useSSE({
    enabled: true,
    onTaskUpdate: (data) => {
      /*
       * Waehrend einer eigenen Aktion nicht nachladen - siehe die gleich
       * lautende Stelle in der Tabellenansicht. Die Meldung wird gemerkt
       * und danach geprueft, damit eine fremde Aenderung nicht verloren
       * geht, die in dieses Fenster fiel.
       */
      if (pendingActionsRef.current > 0 || !aktiv) {
        verpasstRef.current.push(data);
        return;
      }

      if (selectedInstance) {
        loadAssignments(false);
      }
    },
    onConnected: () => {
      console.log('SSE: TaskListView connected');
    },
    onError: (error) => {
      console.error('SSE: TaskListView error', error);
    }
  });

  React.useEffect(() => {
    if (selectedInstance) {
      loadAssignments(false); // Load silently on mount - parent already shows loading
    }
  }, [selectedInstance]);

  // Load series data for the event
  React.useEffect(() => {
    const loadSeriesData = async () => {
      if (!event?.id) return;
      try {
        const seriesData = await taskSeriesApi.getByEvent(event.id);
        setTaskSeries(seriesData);
        // Load members for each series
        const membersMap: { [seriesId: number]: { id: number; name: string }[] } = {};
        for (const s of seriesData) {
          try {
            const details = await taskSeriesApi.getById(s.id);
            membersMap[s.id] = details.members || [];
          } catch (err) {
            membersMap[s.id] = [];
          }
        }
        setSeriesMembers(membersMap);
      } catch (error) {
        console.error('Load series error:', error);
      }
    };
    loadSeriesData();
  }, [event?.id, manualRefreshTrigger]);

  // React to manual refresh from parent
  React.useEffect(() => {
    if (manualRefreshTrigger !== undefined && manualRefreshTrigger > 0 && selectedInstance) {
      loadAssignments(false);
    }
  }, [manualRefreshTrigger]);

  const isTaskOverdue = (task: any, instance: any): boolean => {
    if (!task.end_time || !instance || task.status === 'completed') return false;

    // Vorlagen oder Events ohne Startdatum sind nie überfällig
    if (!instance.start_date) return false;
    const taskDate = toLocalDate(instance.start_date);
    if (!taskDate) return false;
    if (isNaN(taskDate.getTime()) || taskDate.getFullYear() < 2000) return false;

    const now = new Date();
    taskDate.setDate(taskDate.getDate() + task.day_number - 1);

    // Parse end time (format: "HH:MM")
    const [hours, minutes] = task.end_time.split(':').map(Number);
    taskDate.setHours(hours, minutes, 0, 0);

    return now > taskDate;
  };

  const loadAssignments = async (showLoading = true) => {
    if (!selectedInstance) return;

    try {
      if (showLoading) {
        setLoading(true);
      }
      const client = (await import('../../api/client')).default;
      const response = await client.get(`/tasks/instance/${selectedInstance}/assignments`);
      const data = response.data;

      setAssignments(data);
    } catch (error) {
      console.error('Load assignments error:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const getAssignmentsForTask = (taskId: number) => {
    return assignments.filter(a => a.id === taskId && a.user_name);
  };

  /*
   * Notiz speichern und sofort in die Karte eintragen - die SSE-Meldung
   * bringt den Text absichtlich nicht mit (sie geht auch an Mitarbeiter).
   */
  const notizSpeichern = async (taskId: number, text: string) => {
    try {
      const antwort = await tasksApi.setzeNotiz(taskId, text);
      setAssignments((prev) => prev.map((a) => (a.id === taskId ? { ...a, note: antwort.note } : a)));
    } catch (error) {
      console.error('Save task note error:', error);
      alert('Notiz konnte nicht gespeichert werden');
    }
  };

  const gruppenNotizSpeichern = async (gruppenId: number, text: string) => {
    try {
      await programApi.setzeNotiz(gruppenId, text);
      // Die Liste der Gruppen fuehrt die Elternansicht.
      onGruppenGeaendert?.();
    } catch (error) {
      console.error('Save group note error:', error);
      alert('Notiz konnte nicht gespeichert werden');
    }
  };

  /*
   * "Überfällig" ist KEIN eigener Status, sondern eine zusätzliche
   * Eigenschaft - eine Aufgabe kann gleichzeitig "Nicht gestartet" UND
   * überfällig sein. Die Beschriftung bleibt der echte Status, nur die
   * Farbe wird rot.
   */
  const isOverdue = (task: any): boolean => {
    const currentInstance = event && (event as any).instances
      ? (event as any).instances.find((i: any) => i.id === selectedInstance)
      : null;
    return !!currentInstance && isTaskOverdue(task, currentInstance);
  };

  const getStatusColor = (task: any) => {
    const colors: { [key: string]: string } = {
      not_started: 'var(--c-text-muted)',
      in_progress: 'var(--c-accent)',
      completed: 'var(--c-success)',
      overdue: 'var(--c-danger)',
    };
    if (isOverdue(task)) return colors.overdue;
    return colors[task.status] || 'var(--c-text-muted)';
  };

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      // Optimistic update
      setAssignments(prevAssignments =>
        prevAssignments.map(a =>
          a.id === taskId ? { ...a, status: newStatus } : a
        )
      );

      const client = (await import('../../api/client')).default;
      await client.put(`/tasks/${taskId}`, { status: newStatus });
      setSuccessMessage(`Status wurde geändert`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Change status error:', error);
      // Reload to revert optimistic update
      loadAssignments(false);
      alert('Fehler beim Ändern des Status');
    } finally {
      pendingActionsRef.current--; // Decrement when done
      if (pendingActionsRef.current === 0) {
        setTimeout(() => loadAssignments(false), 50);
      }
    }
  };

  /*
   * Die vom Server zurueckgegebene Reihenfolge anwenden - wie in der
   * Tabellenansicht. Eine Anfrage statt fuenf, und nichts geraten.
   */
  const wendeReihenfolgeAn = (reihenfolge?: Rangzeile[]) => {
    if (!reihenfolge || reihenfolge.length === 0) return false;
    const aufgaben = new Map<number, number>();
    const gruppenRaenge = new Map<number, number>();
    for (const z of reihenfolge) {
      (z.art === 'gruppe' ? gruppenRaenge : aufgaben).set(z.id, z.rang);
    }
    setAssignments((alt: any[]) => alt.map((a) =>
      aufgaben.has(a.id) ? { ...a, sort_order: aufgaben.get(a.id) } : a
    ));
    if (gruppenRaenge.size > 0) onGruppenRaenge?.(gruppenRaenge);
    return true;
  };

  /*
   * Wird die Ansicht wieder sichtbar, wird einmal nachgeladen, falls
   * waehrenddessen etwas hereinkam. So bleibt sie aktuell, ohne im
   * Verborgenen bei jeder Meldung Daten zu holen.
   */
  React.useEffect(() => {
    if (aktiv && verpasstRef.current.length > 0 && selectedInstance) {
      verpasstRef.current = [];
      loadAssignments(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);

  /** Nach der eigenen Aktion: kam in der Zwischenzeit etwas Fremdes? */
  const nachholenWennFremd = () => {
    const eigene = eigeneAktionRef.current;
    const fremd = verpasstRef.current.some((d: any) => {
      if (!eigene) return true;
      if (eigene.art === 'aufgabe') return !(d?.action === 'move' && Number(d?.taskId) === eigene.id);
      return d?.action !== 'group_moved';
    });
    verpasstRef.current = [];
    eigeneAktionRef.current = null;
    if (fremd && selectedInstance) loadAssignments(false);
  };

  /** Kurz hervorheben, damit das Auge der verschobenen Karte folgt. */
  const merkeVerschoben = (taskId: number) => {
    setZuletztVerschoben(taskId);
    window.clearTimeout(verschobenRef.current);
    verschobenRef.current = window.setTimeout(() => setZuletztVerschoben(null), 1600);
  };

  const handleMoveUp = async (taskId: number) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      const { tasksApi } = await import('../../api/tasks');

      /*
       * Kein vorgezogenes Umsortieren: es tauschte die Nachbarn in der
       * ROHEN Liste, die weder sortiert noch gruppiert ist. Mit Gruppen ist
       * das ein anderer Nachbar als in der Anzeige - es sprang kurz ein
       * falsches Bild auf. Ausserdem nummeriert der Server beim Verschieben
       * den ganzen Tag neu, das laesst sich hier nicht nachbilden.
       */
      eigeneAktionRef.current = { art: 'aufgabe', id: taskId };
      const antwort = await tasksApi.moveUp(taskId);
      const angewandt = wendeReihenfolgeAn(antwort?.reihenfolge);
      /*
       * Nur melden, wenn sich wirklich etwas bewegt hat. Am Rand des Tages
       * passiert nichts - die Aufgabe wechselt nicht den Tag -, und eine
       * Erfolgsmeldung dazu waere schlicht falsch.
       */
      if (antwort?.bewegt !== false) {
        merkeVerschoben(taskId);
        setSuccessMessage('Aufgabe wurde nach oben verschoben');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
      if (!angewandt) { loadAssignments(false); onGruppenGeaendert?.(); }
    } catch (error: any) {
      console.error('Move up error:', error);
      loadAssignments(false);
      alert(error.response?.data?.error || 'Fehler beim Verschieben der Aufgabe');
    } finally {
      pendingActionsRef.current--; // Decrement when done
      // SSE updates will now be processed if no more actions are pending
      /* Kein Nachladen fuer den eigenen Zug - nachgeholt wird nur, was in
         der Zwischenzeit von jemand anderem hereinkam. */
      if (pendingActionsRef.current === 0) nachholenWennFremd();
    }
  };

  const handleMoveDown = async (taskId: number) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      const { tasksApi } = await import('../../api/tasks');

      // Kein vorgezogenes Umsortieren - siehe handleMoveUp.
      eigeneAktionRef.current = { art: 'aufgabe', id: taskId };
      const antwort = await tasksApi.moveDown(taskId);
      const angewandt = wendeReihenfolgeAn(antwort?.reihenfolge);
      /*
       * Nur melden, wenn sich wirklich etwas bewegt hat. Am Rand des Tages
       * passiert nichts - die Aufgabe wechselt nicht den Tag -, und eine
       * Erfolgsmeldung dazu waere schlicht falsch.
       */
      if (antwort?.bewegt !== false) {
        merkeVerschoben(taskId);
        setSuccessMessage('Aufgabe wurde nach unten verschoben');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
      if (!angewandt) { loadAssignments(false); onGruppenGeaendert?.(); }
    } catch (error: any) {
      console.error('Move down error:', error);
      loadAssignments(false);
      alert(error.response?.data?.error || 'Fehler beim Verschieben der Aufgabe');
    } finally {
      pendingActionsRef.current--; // Decrement when done
      // SSE updates will now be processed if no more actions are pending
      /* Kein Nachladen fuer den eigenen Zug - nachgeholt wird nur, was in
         der Zwischenzeit von jemand anderem hereinkam. */
      if (pendingActionsRef.current === 0) nachholenWennFremd();
    }
  };

  // Group assignments by task ID and get unique tasks
  const alleAufgaben = React.useMemo(() => {
    const taskMap = new Map<number, any>();
    assignments.forEach(a => {
      if (!taskMap.has(a.id)) {
        taskMap.set(a.id, a);
      }
    });
    return Array.from(taskMap.values());
  }, [assignments]);

  /*
   * Deaktivierte vor allen anderen Filtern heraus - sie sind aus dem
   * Betrieb genommen und sollen weder die Liste fuellen noch in den
   * Zaehlern stehen. Das Menue holt sie bei Bedarf dazu oder zeigt nur
   * noch sie.
   */
  const uniqueTasks = React.useMemo(() => {
    if (deaktiviertFilter === 'mit') return alleAufgaben;
    if (deaktiviertFilter === 'nur') return alleAufgaben.filter((t) => t.is_active === false);
    return alleAufgaben.filter((t) => t.is_active !== false);
  }, [alleAufgaben, deaktiviertFilter]);

  /*
   * Dieselbe Regel wie in der Tabelle und dieselbe, nach der sich die
   * Plakette faerbt: weniger Leute eingeteilt als benoetigt - ohne
   * hinterlegten Bedarf: niemand eingeteilt. Oeffentliche Aufgaben zaehlen
   * normal mit; sie sind an ihrer Plakette erkennbar.
   */
  const nichtEingeteilt = (t: any): boolean => {
    const gesamt = bedarfGesamt(t);
    const wie_viele = getAssignmentsForTask(t.id).length;
    return gesamt !== null ? wie_viele < gesamt : wie_viele === 0;
  };

  /*
   * Tag und Status - die beiden Filter, die fuer JEDE Zahl in der Leiste
   * gelten. Einmal hier, damit die Zaehler nicht auseinanderlaufen: die
   * Zahl der deaktivierten stand vorher fuer alle Tage, obwohl daneben ein
   * einzelner Tag gewaehlt war.
   */
  const nachTagUndStatus = React.useCallback((liste: any[]) => {
    const byDay = selectedDay === 'all'
      ? liste
      : liste.filter(t => t.day_number === selectedDay);
    return statusFilter === 'all'
      ? byDay
      // "Überfällig" greift quer über alle Status
      : statusFilter === 'overdue'
        ? byDay.filter(t => isOverdue(t))
        : byDay.filter(t => t.status === statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, statusFilter]);

  // Filter by selected day
  const filteredTasks = React.useMemo(() => {
    const nachStatus = nachTagUndStatus(uniqueTasks);
    return nurNichtEingeteilt ? nachStatus.filter(nichtEingeteilt) : nachStatus;
    // getAssignmentsForTask haengt an assignments, die uniqueTasks speisen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueTasks, nachTagUndStatus, nurNichtEingeteilt, assignments]);

  /*
   * Zahl auf der Plakette: wie viele der gerade gezeigten Aufgaben offen
   * sind - ohne den Filter selbst, sonst zeigte sie immer die Gesamtzahl
   * des eigenen Ergebnisses.
   */
  const offeneStellen = React.useMemo(() => {
    return nachTagUndStatus(uniqueTasks).filter(nichtEingeteilt).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueTasks, nachTagUndStatus, assignments]);

  /*
   * Zahl am Menue der deaktivierten: wie viele in der aktuellen Auswahl
   * stecken - unabhaengig davon, ob sie gerade gezeigt werden. Deshalb
   * aus alleAufgaben und nicht aus uniqueTasks.
   */
  const deaktivierteAnzahl = React.useMemo(
    () => nachTagUndStatus(alleAufgaben.filter((t) => t.is_active === false)).length,
    [alleAufgaben, nachTagUndStatus]);

  const sortedTasks = React.useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let compareResult = 0;

      switch (sortBy) {
        case 'manual':
          // Sort by day first, then by sort_order within each day
          const dayCompare = a.day_number - b.day_number;
          if (dayCompare !== 0) {
            compareResult = dayCompare;
          } else {
            const orderA = a.sort_order ?? 999999;
            const orderB = b.sort_order ?? 999999;
            compareResult = orderA - orderB;
          }
          break;
        case 'time':
          const timeA = a.start_time || a.scheduled_time || '00:00';
          const timeB = b.start_time || b.scheduled_time || '00:00';
          compareResult = timeA.localeCompare(timeB);
          break;
        case 'title':
          compareResult = a.title.localeCompare(b.title);
          break;
        case 'status':
          compareResult = a.status.localeCompare(b.status);
          break;
      }

      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [filteredTasks, sortBy, sortDirection]);

  // Bewusst KEIN vorzeitiges return mehr: die Abbrüche standen vor der
  // Werkzeugleiste, dadurch verschwand sie mitsamt Filter, sobald ein Filter
  // nichts traf - und man kam nicht mehr an ihn heran, um ihn zurückzusetzen.
  // Der Hinweis steht jetzt nur an der Stelle der Liste.
  const leerHinweis = loading
    ? 'Lade Zuweisungen...'
    : uniqueTasks.length === 0
      ? 'Keine Aufgaben vorhanden'
      : filteredTasks.length === 0
        ? (nurNichtEingeteilt
            ? 'Keine Aufgaben ohne Einteilung - es fehlt niemand'
            : statusFilter !== 'all'
            ? 'Keine Aufgaben mit diesem Status'
            : selectedDay === 'all'
              ? 'Keine Aufgaben vorhanden'
              : `Keine Aufgaben für Tag ${selectedDay} vorhanden`)
        : null;

  /*
   * Zugeklappte Gruppen. Gemerkt werden nur diese - offen ist der Normalfall.
   */
  const eventIdFuerGruppen = event?.id ?? 0;
  const [zugeklappt, setZugeklappt] = React.useState<Set<number>>(() => zugeklappteGruppen(eventIdFuerGruppen));
  React.useEffect(() => { setZugeklappt(zugeklappteGruppen(eventIdFuerGruppen)); }, [eventIdFuerGruppen]);

  const klappe = (id: number) => {
    setZugeklappt(prev => {
      const neu = new Set(prev);
      if (neu.has(id)) neu.delete(id); else neu.add(id);
      merkeZugeklappt(eventIdFuerGruppen, neu);
      return neu;
    });
  };

  /*
   * Die Ueberschrift einer Gruppe. Fasst zusammen, was darunter steht -
   * damit man eine zugeklappte Gruppe nicht oeffnen muss, um es zu sehen.
   * Umbenennen und Loeschen sitzen hier, weil die Gruppe hier "wohnt";
   * Loeschen nimmt nur die Ueberschrift, die Aufgaben bleiben.
   */
  const gruppenKarte = (gruppe: TaskGroup, eintraege: any[]) => {
    const zu = zugeklappt.has(gruppe.id);
    const eingeteilt = eintraege.reduce((n, t) => n + getAssignmentsForTask(t.id).length, 0);
    const zeit = gruppenZeit(gruppe);

    const verschieben = async (richtung: 'hoch' | 'runter') => {
      try {
        const antwort = richtung === 'hoch'
          ? await programApi.moveUp(gruppe.id)
          : await programApi.moveDown(gruppe.id);
        if (!wendeReihenfolgeAn(antwort?.reihenfolge)) onGruppenGeaendert?.();
      } catch (error) {
        console.error('Move task group error:', error);
      }
    };

    return (
      <React.Fragment key={`gruppe-${gruppe.id}`}>
      <div className={styles.gruppenKarte} style={gruppenLeisteStil(gruppe.color)}>
        <button
          type="button"
          onClick={() => klappe(gruppe.id)}
          className={styles.gruppenKnopf}
          aria-expanded={!zu}
        >
          <span className={styles.gruppenPfeil} style={{ transform: zu ? 'none' : 'rotate(90deg)' }} aria-hidden="true">›</span>
          <span className={styles.gruppenTitel}>{gruppe.title}</span>
          {zeit && <span className={styles.gruppenZeit}>{zeit} Uhr</span>}
          {/*
            Am Handy bleibt von "2 Aufgaben · 1 eingeteilt" nur "2 · 1" -
            sonst frisst die Zeile den Platz, den der Gruppenname braucht.
            Der volle Wortlaut steht im title-Attribut.
          */}
          <span
            className={styles.gruppenZahl}
            title={`${eintraege.length} ${eintraege.length === 1 ? 'Aufgabe' : 'Aufgaben'}`
              + (eingeteilt > 0 ? `, ${eingeteilt} eingeteilt` : '')}
          >
            {/* Trennpunkt, damit die Zahl nicht als Teil der Uhrzeit gelesen wird. */}
            {zeit && <span aria-hidden="true">· </span>}
            {eintraege.length}<span className={styles.knopfWort}>
              {' '}{eintraege.length === 1 ? 'Aufgabe' : 'Aufgaben'}</span>
            {eingeteilt > 0 && (
              <>{' · '}{eingeteilt}<span className={styles.knopfWort}> eingeteilt</span></>
            )}
          </span>
        </button>
        {!readOnly && (
          /*
            Am Handy tragen die beiden Knoepfe nur ein Zeichen - ausgeschrieben
            passten sie nicht neben den Namen, und die Ueberschrift brauchte
            eine zweite Zeile. Das Wort bleibt im Titel und als aria-label,
            fuer die Vorlesehilfe aendert sich also nichts.
          */
          <div className={styles.gruppenAktionen}>
            {/* Die Zahl sagt, wie viele Aufgaben DARIN eine Notiz haben -
                auch bei zugeklappter Gruppe. */}
            <NotizKnopf
              titel={gruppe.title}
              notiz={gruppe.note}
              className={styles.gruppenAktion}
              zahl={eintraege.filter((t: any) => t?.note && String(t.note).trim() !== '').length}
              speichern={(text) => gruppenNotizSpeichern(gruppe.id, text)}
            />
            {/*
              Zahnrad statt Stift: der Stift steht seit den Notizen fuer
              "Notiz" - zwei gleiche Zeichen nebeneinander mit
              verschiedener Bedeutung waeren nicht zu unterscheiden.
            */}
            <button type="button" onClick={() => setGruppeInBearbeitung(gruppe)}
              className={styles.gruppenAktion} title="Gruppe bearbeiten" aria-label="Gruppe bearbeiten">
              <span className={styles.knopfWort}>Bearbeiten</span>
              <span className={styles.knopfZeichen} aria-hidden="true">⚙</span>
            </button>
            {/* Pfeile nur bei "Manuell" - in einer Sortierung nach Zeit oder
                Titel haetten sie keine sichtbare Wirkung und wuerden nur
                verwirren. Genauso wie bei den Aufgaben. */}
            {sortBy === 'manual' && (
              <>
                <button type="button" onClick={() => verschieben('hoch')} className={styles.gruppenPfeil2} title="Gruppe nach oben">▲</button>
                <button type="button" onClick={() => verschieben('runter')} className={styles.gruppenPfeil2} title="Gruppe nach unten">▼</button>
              </>
            )}
          </div>
        )}
      </div>
      {/* Notiz der Gruppe unter ihrer Leiste - sie gilt fuer alles, was
          darunter steht, auch zugeklappt. */}
      {gruppe.note && (
        <NotizText notiz={gruppe.note} style={{ margin: '0 0 0.5rem 1.25rem' }} />
      )}
      </React.Fragment>
    );
  };

  /*
   * Wie die Gruppen einsortiert werden, haengt an der gewaehlten Sortierung:
   * "Manuell" nach ihrer eigenen Reihenfolge (die Pfeile am Kopf), "Zeit"
   * nach ihrer Zeit bzw. der fruehesten ihrer Aufgaben.
   */
  const gruppenSortierung: Sortierung =
    sortBy === 'manual' ? 'manuell' : sortBy === 'time' ? 'zeit' : 'sonst';

  const zeilen = zeilenMitGruppen(sortedTasks as any[], gruppen, gruppenSortierung);

  /*
   * Eine Aufgabenkarte. Als Funktion, weil sie einzeln und - eingerueckt -
   * unter einer Gruppenueberschrift gebraucht wird.
   */
  const aufgabenKarte = (task: any, inGruppe: boolean = false) => {
        const taskAssignments = getAssignmentsForTask(task.id);
        const maxLength = 100;
        const isExpanded = expandedDescriptions.has(task.id);
        const truncatedDesc = task.description && task.description.length > maxLength
          ? task.description.substring(0, maxLength) + '...'
          : task.description;

        const toggleDescription = () => {
          const newExpanded = new Set(expandedDescriptions);
          if (isExpanded) {
            newExpanded.delete(task.id);
          } else {
            newExpanded.add(task.id);
          }
          setExpandedDescriptions(newExpanded);
        };

        return (
          <div
            key={task.id}
            className={styles.taskItemExtended}
            style={{
              borderLeft: `4px solid ${getStatusColor(task)}`,
              // Eingerueckt unter der Gruppenueberschrift - so sieht man, was
              // zusammengehoert, ohne die Karte anders aussehen zu lassen.
              ...(inGruppe ? { marginLeft: '1.25rem' } : {}),
              /* Die eben verschobene Karte bleibt anderthalb Sekunden
                 hervorgehoben - sonst sieht man nur, dass sich Text
                 verschoben hat, und muss die Karte wiederfinden. */
              ...(zuletztVerschoben === task.id ? {
                backgroundColor: 'var(--c-accent-soft)',
                outline: '2px solid var(--c-accent-border)',
                outlineOffset: '-2px',
                transition: 'background-color 0.25s ease, outline-color 0.25s ease',
              } : {}),
            }}
          >
            <div className={styles.taskMainInfo}>
              <div className={styles.taskHeader}>
                <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Bei "Alle Tage" war auf der Karte nicht zu erkennen,
                        zu welchem Tag eine Aufgabe gehört. */}
                    <span className={styles.dayBadge}>Tag {task.day_number}</span>
                    <strong className={styles.taskTitle}>{task.title}</strong>
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
                    {task.auto_complete && (
                      <span
                        title="Diese Aufgabe hakt sich zum Ende ihres Zeitfensters selbst ab."
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.125rem 0.5rem',
                          backgroundColor: 'var(--c-surface-muted)',
                          color: 'var(--c-text-muted)',
                          border: '1px solid var(--c-border)',
                          borderRadius: '9999px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                        }}
                      >automatisch</span>
                    )}
                    {task.is_active === false && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: 'var(--c-danger-soft)',
                        color: 'var(--c-danger-strong)',
                        borderRadius: '9999px',
                        fontWeight: '500'
                      }}>Deaktiviert</span>
                    )}
                    {task.series_id && taskSeries.find(s => s.id === task.series_id) && (
                      /* Gleicher Badge wie in der Tabellenansicht: ein
                         Zustand, lesbar, und er sagt nur, zu welcher Serie
                         die Aufgabe gehört. */
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: 'var(--c-accent-soft)',
                        color: 'var(--c-accent-text)',
                        borderRadius: '9999px',
                        fontWeight: '500'
                      }} title={`Gehört zur Serie "${taskSeries.find(s => s.id === task.series_id)?.name}"`}>
                        {taskSeries.find(s => s.id === task.series_id)?.name}
                      </span>
                    )}
                  </div>
                </div>
                {/* Dieselbe Komponente wie in der Tabellenansicht: mit Pfeil
                    erkennbar als Bedienelement, nicht als blosses Abzeichen.
                    Vorher ein <select> mit appearance:none - dadurch fehlte
                    der native Pfeil und es sah aus wie ein Badge. */}
                <StatusCell
                  value={task.status}
                  label={STATUS_LABELS[task.status] || task.status}
                  overdue={isOverdue(task)}
                  color={getStatusColor(task)}
                  disabled={readOnly}
                  onChange={(v) => handleStatusChange(task.id, v)}
                />
              </div>

              {task.description && (
                <div className={styles.taskDescription}>
                  <span>{isExpanded ? task.description : truncatedDesc}</span>
                  {task.description.length > maxLength && (
                    <button
                      onClick={toggleDescription}
                      style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        backgroundColor: 'var(--c-accent-soft)',
                        border: 'none',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        color: 'var(--c-accent-strong)',
                        fontWeight: '500',
                        verticalAlign: 'baseline'
                      }}
                    >
                      {isExpanded ? 'weniger' : 'mehr'}
                    </button>
                  )}
                </div>
              )}

              <div className={styles.taskDetails}>
                <div className={styles.taskTimesGrid}>
                  {task.scheduled_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>Geplant:</span>
                      <span className={styles.timeValue}>{task.scheduled_time.slice(0, 5)} Uhr</span>
                    </div>
                  )}
                  {task.start_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>Start:</span>
                      <span className={styles.timeValue}>{task.start_time.slice(0, 5)} Uhr</span>
                    </div>
                  )}
                  {task.end_time && (
                    <div className={styles.timeItem}>
                      <span className={styles.timeLabel}>Ende:</span>
                      <span className={styles.timeValue}>{task.end_time.slice(0, 5)} Uhr</span>
                    </div>
                  )}
                </div>

                {/*
                  Ohne Bedarf UND ohne Zuweisung bleibt der Abschnitt weg.
                  Eine Zeile "Zugewiesen an: Nicht zugewiesen" sagt auf der
                  Karte nichts, was das leere Feld nicht auch sagt - und auf
                  dem Handy ist jede Zeile teuer. In der Tabelle steht der
                  Text weiter, dort kostet er keinen Platz: die Spalte ist
                  ohnehin da.
                */}
                {(taskAssignments.length > 0 || hatBedarf(task)) && (
                  <div className={styles.assignmentsSection}>
                    {/* Beschriftung und Bedarf in EINER Zeile - der Abschnitt
                        steht sonst untereinander, und das Zeichen bekam eine
                        ganze Zeile fuer sich. */}
                    <div className={styles.assignmentsHeader}>
                      <span className={styles.assignmentsLabel}>Zugewiesen an:</span>
                      <BedarfBadge task={task} zugewiesen={taskAssignments.length} klein />
                    </div>
                    <div className={styles.assignmentsList}>
                      {taskAssignments.map((assignment, idx) => {
                        /*
                         * Gestrichelt = über die Serie zugewiesen, ohne Rahmen
                         * = einzeln - wie in der Tabellenansicht.
                         *
                         * Der frühere Zweig "Serien-Team" griff nur, wenn es
                         * GAR KEINE Zuweisung gab. Seit Serien-Mitglieder echte
                         * Zuweisungen bekommen, war er tot und alle Namen sahen
                         * gleich aus.
                         */
                        const viaSeries = !!task.series_id
                          && (seriesMembers[task.series_id] || []).some(m => m.id === assignment.user_id);
                        return (
                          <span
                            key={idx}
                            className={styles.assignmentBadge}
                            style={{
                              ...eventBadgeColors(eventRolleVon(assignment.user_id, event?.teamleiter)),
                              border: viaSeries ? '1px dashed var(--c-accent-border)' : '1px solid transparent',
                            }}
                            title={eventAssignmentTitle(
                              eventRolleVon(assignment.user_id, event?.teamleiter),
                              assignment.user_role,
                              viaSeries
                            )}
                          >
                            {assignment.user_name}
                            {assignment.completed && <span className={styles.completedMark}>✓</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notiz als eigener gelber Kasten unter den Angaben -
                    dieselbe Farbe wie in der Tabelle, gekuerzt auf zwei
                    Zeilen, ein Klick zeigt sie ganz. */}
                <NotizText notiz={task.note} style={{ marginTop: '0.5rem' }} />
              </div>
            </div>

            <div className={styles.kartenAktionen}>
              {!readOnly && (
                <>
                  <NotizKnopf
                    titel={task.title}
                    notiz={task.note}
                    // Dieselbe Klasse wie "Bearbeiten" daneben - sonst ist
                    // das Notizzeichen flacher als seine Nachbarn.
                    className={styles.editButton}
                    speichern={(text) => notizSpeichern(task.id, text)}
                  />
                  {/* Gleiche Reihenfolge wie in der Tabelle: erst Zuweisen,
                      dann Bearbeiten. Vorher war sie hier vertauscht, und
                      wer zwischen den Ansichten wechselt, griff daneben. */}
                  <button onClick={() => onAssignTask(task.id)} className={styles.assignButton}>
                    Zuweisen
                  </button>
                  <button onClick={() => onEditTask(task)} className={styles.editButton}>
                    Bearbeiten
                  </button>
                </>
              )}
              {!readOnly && sortBy === 'manual' && (
                /* Kein marginLeft:auto mehr - in der gestapelten Spalte
                   soll die Pfeilzeile so breit sein wie die Knoepfe
                   darueber, damit alle Kanten auf einer Linie stehen. */
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => handleMoveUp(task.id)}
                    style={{
                      padding: '0.25rem 0.375rem',
                      backgroundColor: 'transparent',
                      color: 'var(--c-text-subtle)',
                      border: '1px solid var(--c-border)',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 'normal',
                      lineHeight: '1',
                      transition: 'all 0.2s'
                    }}
                    title="Aufgabe nach oben verschieben"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveDown(task.id)}
                    style={{
                      padding: '0.25rem 0.375rem',
                      backgroundColor: 'transparent',
                      color: 'var(--c-text-subtle)',
                      border: '1px solid var(--c-border)',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 'normal',
                      lineHeight: '1',
                      transition: 'all 0.2s'
                    }}
                    title="Aufgabe nach unten verschieben"
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
          </div>
        );
  };

  return (
    <div className={styles.tasksList}>
      {successMessage && (
        <Toast message={successMessage} onClose={() => setSuccessMessage('')} />
      )}

      {/* Gemeinsame Werkzeugleiste (styles/toolbar.css) - identische Klassen
          wie in der Tabellenansicht, damit beide Ansichten gleich wirken. */}
      <div className="tv-toolbar">
        {eventDays && eventDays > 1 && onDayChange && (
          <div className="tv-group" role="group" aria-label="Tage">
            <span className="tv-label">Tage</span>
            <button
              onClick={() => onDayChange('all')}
              className={selectedDay === 'all' ? 'tv-chip-active' : 'tv-chip'}
              type="button"
            >
              Alle
            </button>
            {Array.from({ length: eventDays }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                onClick={() => onDayChange(day)}
                className={selectedDay === day ? 'tv-chip-active' : 'tv-chip'}
                type="button"
              >
                {day}
              </button>
            ))}
          </div>
        )}

        <div className="tv-group" role="group" aria-label="Status">
          <span className="tv-label">Status</span>
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          {/* Gleiche Plakette wie in der Tabellenansicht. */}
          <button
            type="button"
            onClick={() => setNurNichtEingeteilt((an) => !an)}
            className={nurNichtEingeteilt ? 'tv-chip-active' : 'tv-chip'}
            title="Nur Aufgaben zeigen, für die noch Leute fehlen"
            aria-pressed={nurNichtEingeteilt}
          >
            Nicht eingeteilt{offeneStellen > 0 && (
              <b style={{ marginLeft: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>{offeneStellen}</b>
            )}
          </button>
          {/* Auch bei 0 zeigen, solange der Filter gesetzt ist - sonst
              verschwaende mit dem letzten Treffer auch der Weg zurueck. */}
          {(deaktivierteAnzahl > 0 || deaktiviertFilter !== 'aus') && (
            <DeaktiviertFilter
              value={deaktiviertFilter}
              onChange={setDeaktiviertFilter}
              anzahl={deaktivierteAnzahl}
            />
          )}
        </div>

        <div className="tv-group" role="group" aria-label="Sortieren">
          <span className="tv-label">Sortieren</span>
          {([
            ['manual', 'Manuell'],
            ['time', 'Zeit'],
            ['title', 'Titel'],
            ['status', 'Status'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                if (sortBy === key && key !== 'manual') {
                  setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy(key);
                  setSortDirection('asc');
                }
              }}
              className={sortBy === key ? 'tv-chip-active' : 'tv-chip'}
              type="button"
            >
              {label}
              {sortBy === key && key !== 'manual' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
      </div>

      {leerHinweis && <p className={styles.emptyHint}>{leerHinweis}</p>}

      {zeilen.map((z) => (
        z.typ === 'gruppe' ? (
          <React.Fragment key={`gruppe-${z.gruppe.id}`}>
            {gruppenKarte(z.gruppe, z.aufgaben)}
            {!zugeklappt.has(z.gruppe.id) && z.aufgaben.map(a => aufgabenKarte(a, true))}
          </React.Fragment>
        ) : aufgabenKarte(z.aufgabe)
      ))}

      {gruppeInBearbeitung && eventId && (
        <GruppeBearbeitenModal
          gruppe={gruppeInBearbeitung}
          eventId={eventId}
          eventDays={eventDays ?? 1}
          onClose={() => setGruppeInBearbeitung(null)}
          onGespeichert={() => onGruppenGeaendert?.()}
        />
      )}
    </div>
  );
};
