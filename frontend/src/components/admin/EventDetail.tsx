import React, { useState, useEffect, useRef } from 'react';
import { eventsApi } from '../../api/events';
import { tasksApi, Task } from '../../api/tasks';
import { usersApi, User } from '../../api/users';
import { programApi, ProgramItem } from '../../api/program';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { useSSE } from '../../hooks/useSSE';
import { useAuth } from '../../context/AuthContext';
import { TaskFormModal } from './TaskFormModal';
import { TaskAssignmentModal } from './TaskAssignmentModal';
import { TaskTableView, TaskTableViewHandle } from './TaskTableView';
import { TaskSeriesModal } from './TaskSeriesModal';
import { DuplicateEventModal } from './DuplicateEventModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { EventEditModal } from './EventEditModal';
import { EventStaffPool } from './EventStaffPool';
import { StatusFilter } from './StatusFilter';
import { StatusCell } from './StatusCell';
import { Toast } from '../Toast';
import client from '../../api/client';
import { toLocalDate } from '../../utils/date';
import { DaySelection, resolveInitialDayForEvent, storeDay } from '../../utils/dayPreference';
import styles from './EventDetail.module.css';

const STATUS_LABELS: { [key: string]: string } = {
  not_started: 'Nicht gestartet',
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
  const [_program, setProgram] = useState<ProgramItem[]>([]);
  const [_users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
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
      const [eventData, tasksData, programData, usersData] = await Promise.all([
        eventsApi.getById(eventId),
        tasksApi.getByEvent(eventId),
        programApi.getByEvent(eventId),
        usersApi.getAll(),
      ]);

      setEvent(eventData);
      setTasks(tasksData);
      setProgram(programData);
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
    } catch (error) {
      console.error('Load event detail error:', error);
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

  if (loading) {
    return <div>Lade Details...</div>;
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
        <h2 className={styles.title}>{event.name}</h2>

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
          <EventStaffPool eventId={eventId} />
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
                  Serien verwalten
                </button>
                <button onClick={handleCreateTask} className={styles.addButton}>
                  Neue Aufgabe
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: viewMode === 'cards' ? 'block' : 'none' }}>
          <TaskListView
            selectedDay={selectedDay}
            eventDays={event?.days}
            onDayChange={handleDayChange}
            selectedInstance={selectedInstance}
            onEditTask={handleEditTask}
            onAssignTask={handleAssignTask}
            event={event}
            manualRefreshTrigger={manualRefreshTrigger}
            readOnly={isTeamleiter && event.is_template}
          />
        </div>
        {selectedInstance && (
          <div style={{ display: viewMode === 'table' ? 'block' : 'none' }}>
            <TaskTableView
              ref={tableRef}
              eventInstanceId={selectedInstance}
              onEditTask={handleEditTask}
              onAssignTask={handleAssignTask}
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
          onClose={() => setShowSeriesModal(false)}
          onSeriesCreated={() => {
            // Beide Ansichten neu laden, damit Serien-Zuweisungen sofort sichtbar sind
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
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'manual' | 'time' | 'title' | 'status'>('manual');
  // Gleicher Filter wie in der Tabellenansicht, damit beide gleich bedienbar sind.
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<Set<number>>(new Set());
  const pendingActionsRef = React.useRef<number>(0);
  const [taskSeries, setTaskSeries] = React.useState<TaskSeries[]>([]);
  const [seriesMembers, setSeriesMembers] = React.useState<{ [seriesId: number]: { id: number; name: string }[] }>({});

  // SSE for real-time updates
  useSSE({
    enabled: true,
    onTaskUpdate: (data) => {
      console.log('SSE: TaskListView update received', data);

      // Ignore SSE updates while actions are pending (to prevent overwriting optimistic updates)
      if (pendingActionsRef.current > 0) {
        console.log(`SSE: Ignoring update (${pendingActionsRef.current} actions pending)`);
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

  const handleMoveUp = async (taskId: number) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      const { tasksApi } = await import('../../api/tasks');

      // Optimistic update: Swap sort_order values (not array positions!)
      const currentTaskIndex = assignments.findIndex((a: any) => a.id === taskId);
      if (currentTaskIndex > 0) {
        const newAssignments = [...assignments];
        const currentTask = newAssignments[currentTaskIndex];
        const aboveTask = newAssignments[currentTaskIndex - 1];

        // Swap sort_order values
        const tempOrder = currentTask.sort_order;
        currentTask.sort_order = aboveTask.sort_order;
        aboveTask.sort_order = tempOrder;

        setAssignments(newAssignments);
      }

      await tasksApi.moveUp(taskId);
      setSuccessMessage('Aufgabe wurde nach oben verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Move up error:', error);
      loadAssignments(false);
      alert(error.response?.data?.error || 'Fehler beim Verschieben der Aufgabe');
    } finally {
      pendingActionsRef.current--; // Decrement when done
      // SSE updates will now be processed if no more actions are pending
      if (pendingActionsRef.current === 0) {
        // Small delay to ensure server has processed all updates
        setTimeout(() => loadAssignments(false), 50);
      }
    }
  };

  const handleMoveDown = async (taskId: number) => {
    pendingActionsRef.current++; // Increment pending actions counter
    try {
      const { tasksApi } = await import('../../api/tasks');

      // Optimistic update: Swap sort_order values (not array positions!)
      const currentTaskIndex = assignments.findIndex((a: any) => a.id === taskId);
      if (currentTaskIndex < assignments.length - 1 && currentTaskIndex !== -1) {
        const newAssignments = [...assignments];
        const currentTask = newAssignments[currentTaskIndex];
        const belowTask = newAssignments[currentTaskIndex + 1];

        // Swap sort_order values
        const tempOrder = currentTask.sort_order;
        currentTask.sort_order = belowTask.sort_order;
        belowTask.sort_order = tempOrder;

        setAssignments(newAssignments);
      }

      await tasksApi.moveDown(taskId);
      setSuccessMessage('Aufgabe wurde nach unten verschoben');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Move down error:', error);
      loadAssignments(false);
      alert(error.response?.data?.error || 'Fehler beim Verschieben der Aufgabe');
    } finally {
      pendingActionsRef.current--; // Decrement when done
      // SSE updates will now be processed if no more actions are pending
      if (pendingActionsRef.current === 0) {
        // Small delay to ensure server has processed all updates
        setTimeout(() => loadAssignments(false), 50);
      }
    }
  };

  // Group assignments by task ID and get unique tasks
  const uniqueTasks = React.useMemo(() => {
    const taskMap = new Map<number, any>();
    assignments.forEach(a => {
      if (!taskMap.has(a.id)) {
        taskMap.set(a.id, a);
      }
    });
    return Array.from(taskMap.values());
  }, [assignments]);

  // Filter by selected day
  const filteredTasks = React.useMemo(() => {
    const byDay = selectedDay === 'all'
      ? uniqueTasks
      : uniqueTasks.filter(t => t.day_number === selectedDay);
    if (statusFilter === 'all') return byDay;
    // "Überfällig" greift quer über alle Status
    if (statusFilter === 'overdue') return byDay.filter(t => isOverdue(t));
    return byDay.filter(t => t.status === statusFilter);
  }, [uniqueTasks, selectedDay, statusFilter]);

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
        ? (statusFilter !== 'all'
            ? 'Keine Aufgaben mit diesem Status'
            : selectedDay === 'all'
              ? 'Keine Aufgaben vorhanden'
              : `Keine Aufgaben für Tag ${selectedDay} vorhanden`)
        : null;

  return (
    <div className={styles.tasksList}>
      {successMessage && (
        <Toast message={successMessage} onClose={() => setSuccessMessage('')} />
      )}

      {/* Gemeinsame Werkzeugleiste (styles/toolbar.css) - identische Klassen
          wie in der Tabellenansicht, damit beide Ansichten gleich wirken. */}
      <div className="tv-toolbar">
        {eventDays && eventDays > 1 && onDayChange && (
          <div className="tv-group">
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

        <div className="tv-group">
          <span className="tv-label">Status</span>
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>

        <div className="tv-group">
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

      {sortedTasks.map((task) => {
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
            style={{ borderLeft: `4px solid ${getStatusColor(task)}` }}
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
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: taskAssignments.length > 0 ? 'var(--c-border)' : 'var(--c-accent-soft)',
                        color: taskAssignments.length > 0 ? 'var(--c-text-muted)' : 'var(--c-accent-text)',
                        borderRadius: '9999px',
                        fontWeight: '500',
                        opacity: taskAssignments.length > 0 ? 0.7 : 1
                      }} title={taskAssignments.length > 0 ? 'Individuelle Zuweisung überschreibt Serien-Team' : 'Serien-Team zugewiesen'}>
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

                {taskAssignments.length > 0 && (
                  <div className={styles.assignmentsSection}>
                    <span className={styles.assignmentsLabel}>Zugewiesen an:</span>
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
                            style={{ border: viaSeries ? '1px dashed var(--c-accent-border)' : '1px solid transparent' }}
                            title={viaSeries ? 'Über die Serie zugewiesen' : 'Einzeln zugewiesen'}
                          >
                            {assignment.user_name}
                            {assignment.completed && <span className={styles.completedMark}>✓</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.taskActions}>
              {!readOnly && (
                <>
                  <button onClick={() => onEditTask(task)} className={styles.editButton}>
                    Bearbeiten
                  </button>
                  <button onClick={() => onAssignTask(task.id)} className={styles.assignButton}>
                    Zuweisen
                  </button>
                </>
              )}
              {!readOnly && sortBy === 'manual' && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
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
      })}

    </div>
  );
};
