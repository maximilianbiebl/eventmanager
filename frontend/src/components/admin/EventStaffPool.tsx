import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import { useSSE } from '../../hooks/useSSE';
import client from '../../api/client';
import { taskSeriesApi } from '../../api/taskSeries';
import { toLocalDate } from '../../utils/date';
import {
  Leitung, eventRolleVon, eventBadgeColors, eventBadgeTitle,
  eventAssignmentTitle,
} from '../../utils/roleBadge';

interface Props {
  eventId: number;
  /**
   * Wer leitet diese Veranstaltung - Ersteller und Co-Teamleitung.
   * Kommt aus GET /events/:id mit.
   */
  leitung?: Leitung[];
}

interface EventStaff extends User {
  isInPool?: boolean;
  taskCount?: number;
  seriesTaskCount?: number;
}

interface StaffTask {
  id: number;
  title: string;
  status: string;
  day_number: number;
  assignment_id?: number;
  event_name: string;
  instance_number: number;
  isSeriesTask?: boolean;
  seriesName?: string;
}

export const EventStaffPool: React.FC<Props> = ({ eventId, leitung }) => {

  const [allStaff, setAllStaff] = useState<EventStaff[]>([]);
  const [eventStaff, setEventStaff] = useState<EventStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Aufklappzustand überdauert Reloads: wer den Pool offen lässt, findet ihn
  // offen wieder - er schliesst sich nur, wenn man ihn selbst zuklappt.
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('staffPoolExpanded') !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('staffPoolExpanded', String(expanded));
    } catch {
      /* privater Modus o.ä. - dann eben ohne Merken */
    }
  }, [expanded]);
  const [selectedStaffForTasks, setSelectedStaffForTasks] = useState<EventStaff | null>(null);
  const [staffTasks, setStaffTasks] = useState<StaffTask[]>([]);
  const [removeCandidate, setRemoveCandidate] = useState<{ staff: EventStaff; openTasks: StaffTask[] } | null>(null);

  // SSE for real-time updates
  useSSE({
    enabled: true,
    onTaskUpdate: (data) => {
      console.log('SSE: EventStaffPool update received', data);
      loadData(false);
    },
    onConnected: () => {
      console.log('SSE: EventStaffPool connected');
    },
    onError: (error) => {
      console.error('SSE: EventStaffPool error', error);
    }
  });

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const [allUsers, eventUsers, assignments, seriesData] = await Promise.all([
        usersApi.getAll(),
        client.get(`/users/event/${eventId}/staff`).then(res => res.data),
        client.get(`/tasks/event/${eventId}/all-assignments`).then(res => res.data).catch(() => []),
        taskSeriesApi.getByEvent(eventId).catch(() => []),
      ]);

      // Zähle Task-Zuweisungen pro User
      const taskCounts: { [userId: number]: number } = {};
      assignments.forEach((assignment: any) => {
        if (assignment.user_id) {
          taskCounts[assignment.user_id] = (taskCounts[assignment.user_id] || 0) + 1;
        }
      });

      // Load series members and count series tasks per user
      const seriesTaskCounts: { [userId: number]: number } = {};
      for (const s of seriesData) {
        try {
          const details = await taskSeriesApi.getById(s.id);
          const taskCount = details.tasks?.length || 0;
          details.members?.forEach(member => {
            seriesTaskCounts[member.id] = (seriesTaskCounts[member.id] || 0) + taskCount;
          });
        } catch (err) {
          // ignore
        }
      }

      /*
       * Alle Rollen zur Auswahl, nicht nur "staff".
       *
       * Teamleitung und Admins packen auf einer Freizeit genauso mit an -
       * sie liessen sich aber gar nicht in den Pool aufnehmen und konnten
       * damit auch keine Aufgaben bekommen. Die Rollenfarbe des Badges
       * zeigt, wer wer ist.
       */
      const staffOnly = allUsers;

      // Markiere welche bereits im Pool sind und füge Task-Count hinzu
      const eventStaffIds = new Set(eventUsers.map((u: User) => u.id));
      const staffWithPoolStatus = staffOnly.map(staff => ({
        ...staff,
        isInPool: eventStaffIds.has(staff.id),
        taskCount: taskCounts[staff.id] || 0,
        seriesTaskCount: seriesTaskCounts[staff.id] || 0,
      }));

      // Event-Staff mit Task-Counts
      const eventStaffWithCounts = eventUsers.map((staff: User) => ({
        ...staff,
        taskCount: taskCounts[staff.id] || 0,
        seriesTaskCount: seriesTaskCounts[staff.id] || 0,
      }));

      setAllStaff(staffWithPoolStatus);
      setEventStaff(eventStaffWithCounts);
    } catch (error) {
      console.error('Load staff pool error:', error);
      setError('Fehler beim Laden der Mitarbeiter');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleAddStaff = async (userIds: number[]) => {
    try {
      await client.post(`/users/event/${eventId}/staff`, { user_ids: userIds });
      await loadData();
      setShowAddModal(false);
    } catch (error: any) {
      console.error('Add staff error:', error);
      setError(error.response?.data?.error || 'Fehler beim Hinzufügen');
    }
  };

  /*
   * Entfernen aus dem Pool nimmt dem Mitarbeiter auch seine Aufgaben - sonst
   * stünde die Veranstaltung weiter in seiner Ansicht. Hat er noch offene
   * Aufgaben, wird vorher gefragt, ob jemand anderes sie übernehmen soll.
   */
  const handleRemoveStaff = async (staff: EventStaff) => {
    let openTasks: StaffTask[] = [];
    try {
      const response = await client.get(`/tasks/event/${eventId}/user/${staff.id}/assignments`);
      openTasks = (response.data as StaffTask[]).filter(t => t.status !== 'completed');
    } catch (error) {
      console.error('Load staff assignments error:', error);
      setError('Offene Aufgaben konnten nicht geprüft werden');
      return;
    }

    if (openTasks.length === 0) {
      if (!confirm(`${staff.name} aus dem Mitarbeiter-Pool entfernen?`)) return;
      await removeStaff(staff.id, null);
      return;
    }

    setRemoveCandidate({ staff, openTasks });
  };

  const removeStaff = async (
    userId: number,
    reassignTo: number | null,
    droppedAssignmentIds: number[] = []
  ) => {
    try {
      // Abgewählte Aufgaben zuerst loswerden - danach überträgt das Entfernen
      // nur noch, was übrig ist. Zwei bestehende Endpunkte statt eines neuen.
      if (droppedAssignmentIds.length > 0) {
        await client.post('/tasks/bulk-remove-assignments', { assignment_ids: droppedAssignmentIds });
      }

      const url = reassignTo === null
        ? `/users/event/${eventId}/staff/${userId}`
        : `/users/event/${eventId}/staff/${userId}?reassign_to=${reassignTo}`;
      await client.delete(url);
      setRemoveCandidate(null);
      await loadData();
    } catch (error: any) {
      console.error('Remove staff error:', error);
      setError(error.response?.data?.error || 'Fehler beim Entfernen');
    }
  };

  const handleShowTasks = async (staff: EventStaff) => {
    try {
      // Load direct assignments
      const response = await client.get(`/tasks/event/${eventId}/user/${staff.id}/assignments`);
      const directTasks: StaffTask[] = response.data;

      // Load series tasks where this user is a member
      const seriesData = await taskSeriesApi.getByEvent(eventId).catch(() => []);
      const seriesTasks: StaffTask[] = [];

      for (const s of seriesData) {
        try {
          const details = await taskSeriesApi.getById(s.id);
          const isMember = details.members?.some(m => m.id === staff.id);
          if (isMember && details.tasks) {
            details.tasks.forEach(task => {
              // Don't add if already in direct assignments
              if (!directTasks.some(dt => dt.id === task.id)) {
                seriesTasks.push({
                  id: task.id,
                  title: task.title,
                  status: 'not_started',
                  day_number: task.day_number,
                  event_name: '',
                  instance_number: 1,
                  isSeriesTask: true,
                  seriesName: s.name,
                });
              }
            });
          }
        } catch (err) {
          // ignore
        }
      }

      setStaffTasks([...directTasks, ...seriesTasks]);
      setSelectedStaffForTasks(staff);
    } catch (error) {
      console.error('Load staff tasks error:', error);
      setError('Fehler beim Laden der Aufgaben');
    }
  };

  const handleUnassignTask = async (assignmentId: number) => {
    if (!confirm('Möchten Sie diese Zuweisung wirklich entfernen?')) {
      return;
    }

    try {
      await client.delete(`/tasks/assignment/${assignmentId}`);
      // Refresh both task list and staff data
      if (selectedStaffForTasks) {
        await handleShowTasks(selectedStaffForTasks);
      }
      await loadData();
    } catch (error) {
      console.error('Unassign task error:', error);
      setError('Fehler beim Entfernen der Zuweisung');
    }
  };

  if (loading) {
    return <div style={styles.loading}>Lade Mitarbeiter...</div>;
  }

  return (
    /*
     * Zugeklappt bleibt nur die eine Zeile mit dem Titel - dann braucht der
     * Rahmen auch nicht die Polsterung fuer eine ganze Mitarbeiterliste.
     */
    <div style={expanded ? styles.container : { ...styles.container, padding: '0.75rem 1rem' }}>
      <div style={expanded ? styles.header : { ...styles.header, marginBottom: 0 }} className="pool-header">
        <button
          onClick={() => setExpanded(!expanded)}
          style={styles.headerToggle}
          className="pool-toggle"
          aria-expanded={expanded}
          title="Nur diese Mitarbeiter können Aufgaben für dieses Event zugewiesen bekommen." 
        >
          <span style={{ ...styles.caret, transform: expanded ? 'rotate(90deg)' : 'none' }} aria-hidden="true">›</span>
          <h3 style={styles.title} className="pool-title">Mitarbeiter-Pool</h3>
          <span style={styles.count}>{eventStaff.length}</span>
          {/* Erklärung nur auf Nachfrage, statt dauerhaft Platz zu belegen */}
          <span
            style={styles.infoIcon}
            className="pool-info"
            title="Nur diese Mitarbeiter können Aufgaben für dieses Event zugewiesen bekommen."
            onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
            role="button"
            aria-label="Was ist der Mitarbeiter-Pool?"
          >
            i
          </span>
        </button>
        {expanded && (
          /*
            Kurz beschriftet: "Mitarbeiter hinzufügen" passte neben
            "Mitarbeiter-Pool", Anzahl und Fragezeichen nicht mehr in die
            Zeile und rutschte darunter. Ueber der Ueberschrift steht
            ohnehin, worum es geht.
          */
          <button
            onClick={() => setShowAddModal(true)}
            style={styles.addButton}
            className="pool-add"
            title="Mitarbeiter zum Pool hinzufügen"
          >
            + Hinzufügen
          </button>
        )}
      </div>

      {showInfo && (
        <p style={styles.infoText}>
          Nur diese Mitarbeiter können Aufgaben für dieses Event zugewiesen bekommen.
        </p>
      )}

      {!expanded ? null : (
      <>
      {error && <div style={styles.error}>{error}</div>}

      {eventStaff.length === 0 ? (
        <div style={styles.emptyState}>
          <p>Noch keine Mitarbeiter im Pool.</p>
          <p style={styles.emptyHint}>
            Füge Mitarbeiter hinzu, um sie später Aufgaben zuweisen zu können.
          </p>
        </div>
      ) : (
        <div style={styles.staffGrid}>
          {eventStaff.map((staff) => {
            const imEvent = eventRolleVon(staff.id, leitung);
            return (
            <div key={staff.id} style={styles.staffCard}>
              <div
                style={{ ...styles.staffEllipse, ...eventBadgeColors(imEvent) }}
                title={eventBadgeTitle(imEvent, staff.role)}
              >
                <span style={styles.staffName}>{staff.name}</span>
                <button
                  onClick={() => handleRemoveStaff(staff)}
                  style={styles.removeButtonEllipse}
                  title="Aus Pool entfernen"
                >
                  ✕
                </button>
              </div>
              <button
                onClick={() => handleShowTasks(staff)}
                style={{
                  ...styles.taskCount,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
                title="Aufgaben anzeigen"
              >
                {/* Serien-Aufgaben sind jetzt echte Zuweisungen und damit in
                    taskCount enthalten - vorher wurden sie hier addiert, das
                    würde nun doppelt zählen. Der Hinweis bleibt als Herkunft. */}
                {/* Kurz halten - die Karten stehen nebeneinander und wurden
                    durch "(davon x aus Serie)" sehr breit. Der ganze Satz
                    steht im Tooltip. */}
                {staff.taskCount || 0} Aufgabe{(staff.taskCount || 0) !== 1 ? 'n' : ''}
                {(staff.seriesTaskCount || 0) > 0 && (
                  <span
                    style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)' }}
                    title={`davon ${staff.seriesTaskCount} über eine Serie`}
                  > · {staff.seriesTaskCount} Serie</span>
                )}
              </button>
            </div>
            );
          })}
        </div>
      )}

      </>
      )}

      {showAddModal && (
        <AddStaffModal
          availableStaff={allStaff.filter(s => !s.isInPool)}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddStaff}
        />
      )}

      {selectedStaffForTasks && (
        <TaskListModal
          staff={selectedStaffForTasks}
          tasks={staffTasks}
          onClose={() => {
            setSelectedStaffForTasks(null);
            setStaffTasks([]);
          }}
          onUnassign={handleUnassignTask}
          eventId={eventId}
          leitung={leitung}
          onReload={() => {
            loadData(false);
            if (selectedStaffForTasks) {
              handleShowTasks(selectedStaffForTasks);
            }
          }}
        />
      )}

      {removeCandidate && (
        <RemoveStaffModal
          staff={removeCandidate.staff}
          openTasks={removeCandidate.openTasks}
          candidates={eventStaff.filter(s => s.id !== removeCandidate.staff.id)}
          onClose={() => setRemoveCandidate(null)}
          onConfirm={(reassignTo, dropped) => removeStaff(removeCandidate.staff.id, reassignTo, dropped)}
        />
      )}
    </div>
  );
};

/*
 * Nachfrage beim Entfernen eines Mitarbeiters mit offenen Aufgaben.
 * Ein Dialog statt zweier Schritte: die Auswahl des Nachfolgers und die
 * Entscheidung "übertragen oder verwerfen" gehören zusammen.
 */
interface RemoveStaffModalProps {
  staff: EventStaff;
  openTasks: StaffTask[];
  candidates: EventStaff[];
  onClose: () => void;
  onConfirm: (reassignTo: number | null, droppedAssignmentIds: number[]) => void | Promise<void>;
}

const RemoveStaffModal: React.FC<RemoveStaffModalProps> = ({
  staff,
  openTasks,
  candidates,
  onClose,
  onConfirm,
}) => {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Bei vielen Aufgaben würde der Dialog sonst über den Bildschirm hinaus
  // wachsen - die Liste startet deshalb zugeklappt.
  const [listOpen, setListOpen] = React.useState(false);
  // Welche Aufgaben sollen mitgehen? Standard: alle.
  const [transferIds, setTransferIds] = React.useState<number[]>(
    () => openTasks.map(t => t.assignment_id).filter((id): id is number => typeof id === 'number')
  );

  const assignable = openTasks.filter(t => typeof t.assignment_id === 'number');
  const total = assignable.length;
  const chosen = transferIds.length;

  const toggle = (id: number) =>
    setTransferIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const run = async (reassignTo: number | null) => {
    setBusy(true);
    try {
      // Abgewählte Aufgaben gehen nicht mit - ihre Zuweisung fällt weg.
      const dropped = reassignTo === null
        ? []
        : assignable.map(t => t.assignment_id as number).filter(id => !transferIds.includes(id));
      await onConfirm(reassignTo, dropped);
    } finally {
      setBusy(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={{ ...styles.modal, maxWidth: '580px' }}>
        <h2 style={styles.modalTitle}>{staff.name} entfernen</h2>

        <p style={{ marginBottom: '1rem', color: 'var(--c-text-muted)' }}>
          {total === 1
            ? 'Es ist noch eine offene Aufgabe zugewiesen.'
            : `Es sind noch ${total} offene Aufgaben zugewiesen.`}{' '}
          Soll jemand anderes sie übernehmen?
        </p>

        <div style={styles.taskDisclosure}>
          <button
            type="button"
            onClick={() => setListOpen(v => !v)}
            style={styles.taskDisclosureHeader}
            aria-expanded={listOpen}
          >
            <span style={styles.disclosureCaret} aria-hidden="true">{listOpen ? '▾' : '▸'}</span>
            <span>
              {chosen === total
                ? `Alle ${total} Aufgaben übertragen`
                : chosen === 0
                  ? `Keine der ${total} Aufgaben übertragen`
                  : `${chosen} von ${total} Aufgaben übertragen`}
            </span>
          </button>

          {listOpen && (
            <>
              <div style={styles.taskDisclosureActions}>
                <button
                  type="button"
                  style={styles.miniButton}
                  onClick={() => setTransferIds(assignable.map(t => t.assignment_id as number))}
                >
                  Alle
                </button>
                <button type="button" style={styles.miniButton} onClick={() => setTransferIds([])}>
                  Keine
                </button>
              </div>
              <div style={styles.taskDisclosureList}>
                {assignable.map(t => (
                  <label key={t.assignment_id} style={styles.removeTaskItem}>
                    <input
                      type="checkbox"
                      checked={transferIds.includes(t.assignment_id as number)}
                      onChange={() => toggle(t.assignment_id as number)}
                      style={styles.checkbox}
                    />
                    <span style={styles.removeTaskDay}>Tag {t.day_number}</span>
                    <span>{t.title}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {candidates.length === 0 ? (
          <p style={styles.noStaff}>Kein anderer Mitarbeiter im Pool - die Zuweisungen können nur aufgehoben werden.</p>
        ) : (
          <div style={styles.staffList}>
            {candidates.map(c => (
              <label
                key={c.id}
                style={{
                  ...styles.staffCheckbox,
                  backgroundColor: selectedId === c.id ? 'var(--c-accent-soft)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="remove-reassign"
                  checked={selectedId === c.id}
                  onChange={() => setSelectedId(c.id)}
                  style={styles.checkbox}
                />
                <span style={{ fontWeight: selectedId === c.id ? 600 : 400 }}>{c.name}</span>
              </label>
            ))}
          </div>
        )}

        <div className="app-modal-actions" style={styles.modalButtons}>
          <button onClick={onClose} style={styles.cancelButton} disabled={busy}>
            Abbrechen
          </button>
          <button onClick={() => run(null)} style={styles.dangerButton} disabled={busy}>
            Zuweisungen aufheben
          </button>
          <button
            onClick={() => run(selectedId)}
            style={styles.submitButton}
            disabled={busy || selectedId === null || chosen === 0}
            title={chosen === 0 ? 'Keine Aufgabe zum Übertragen ausgewählt' : undefined}
          >
            Übertragen
          </button>
        </div>
      </div>
    </div>
  );
};

interface AddStaffModalProps {
  availableStaff: User[];
  onClose: () => void;
  onAdd: (userIds: number[]) => void;
}

const AddStaffModal: React.FC<AddStaffModalProps> = ({ availableStaff, onClose, onAdd }) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleToggle = (userId: number) => {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0) {
      alert('Bitte mindestens einen Mitarbeiter auswählen');
      return;
    }
    onAdd(selectedIds);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={styles.modal}>
        <h2 style={styles.modalTitle}>Mitarbeiter hinzufügen</h2>

        {availableStaff.length === 0 ? (
          <p style={styles.noStaff}>Alle Mitarbeiter sind bereits im Pool.</p>
        ) : (
          <div style={styles.staffList}>
            {availableStaff.map((staff) => (
              <label key={staff.id} style={styles.staffCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(staff.id)}
                  onChange={() => handleToggle(staff.id)}
                  style={styles.checkbox}
                />
                <span>{staff.name}</span>
              </label>
            ))}
          </div>
        )}

        <div className="app-modal-actions" style={styles.modalButtons}>
          <button onClick={onClose} style={styles.cancelButton}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            style={styles.submitButton}
            disabled={selectedIds.length === 0}
          >
            {selectedIds.length > 0
              ? `${selectedIds.length} Mitarbeiter hinzufügen`
              : 'Mitarbeiter hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface TaskListModalProps {
  staff: EventStaff;
  tasks: StaffTask[];
  onClose: () => void;
  onUnassign: (assignmentId: number) => void;
  eventId: number;
  /** Leitung der Veranstaltung - wird an den Zuweisen-Dialog durchgereicht. */
  leitung?: Leitung[];
  onReload: () => void;
}

const TaskListModal: React.FC<TaskListModalProps> = ({ staff, tasks, onClose, onUnassign, eventId, leitung, onReload }) => {
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<number[]>([]);
  const [showReplaceModal, setShowReplaceModal] = React.useState(false);
  const [showAssignModal, setShowAssignModal] = React.useState(false);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleToggleTask = (assignmentId: number) => {
    setSelectedTaskIds(prev =>
      prev.includes(assignmentId) ? prev.filter(id => id !== assignmentId) : [...prev, assignmentId]
    );
  };

  const handleSelectAll = () => {
    const assignableTasks = tasks.filter(t => t.assignment_id);
    if (selectedTaskIds.length === assignableTasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(assignableTasks.map(t => t.assignment_id!));
    }
  };

  const handleBulkRemove = async () => {
    if (selectedTaskIds.length === 0) {
      alert('Bitte mindestens eine Aufgabe auswählen');
      return;
    }

    if (!confirm(`${selectedTaskIds.length} Zuweisungen wirklich entfernen?`)) return;

    try {
      await client.post('/tasks/bulk-remove-assignments', { assignment_ids: selectedTaskIds });
      setSelectedTaskIds([]);
      onReload();
      alert(`${selectedTaskIds.length} Zuweisungen entfernt`);
    } catch (error) {
      console.error('Bulk remove error:', error);
      alert('Fehler beim Entfernen');
    }
  };

  const handleReplaceStaff = async (newStaffId: number) => {
    try {
      await client.post(`/tasks/replace-staff/${eventId}`, {
        old_user_id: staff.id,
        new_user_id: newStaffId,
      });
      setShowReplaceModal(false);
      onReload();
      onClose();
      alert('Mitarbeiter erfolgreich ausgetauscht');
    } catch (error) {
      console.error('Replace staff error:', error);
      alert('Fehler beim Austauschen');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      not_started: 'var(--c-text-muted)',
      in_progress: 'var(--c-accent)',
      completed: 'var(--c-success)',
      overdue: 'var(--c-danger)',
    };
    return colors[status] || 'var(--c-text-muted)';
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

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={{...styles.modal, maxWidth: '700px', maxHeight: '80vh', overflow: 'auto'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
          <h2 style={styles.modalTitle}>Aufgaben von {staff.name}</h2>
          <button onClick={onClose} style={{...styles.removeButton, position: 'static'}}>✕</button>
        </div>

        {selectedTaskIds.length > 0 && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--c-surface-muted)',
            borderRadius: '4px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <span style={{fontSize: '0.875rem', fontWeight: '500', color: 'var(--c-text)'}}>
              {selectedTaskIds.length} ausgewählt
            </span>
            <button onClick={handleBulkRemove} style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--c-danger)',
              color: 'var(--c-text-inverse)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}>
              Ausgewählte entfernen
            </button>
            <button onClick={() => setSelectedTaskIds([])} style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--c-text-muted)',
              color: 'var(--c-text-inverse)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}>
              Auswahl aufheben
            </button>
          </div>
        )}

        {tasks.length === 0 ? (
          <p style={styles.noStaff}>Diesem Mitarbeiter sind keine Aufgaben zugewiesen.</p>
        ) : (
          <>
            {tasks.some(t => t.assignment_id) && (
              <div style={{marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <input
                  type="checkbox"
                  checked={selectedTaskIds.length === tasks.filter(t => t.assignment_id).length && tasks.filter(t => t.assignment_id).length > 0}
                  onChange={handleSelectAll}
                  style={styles.checkbox}
                />
                <span style={{fontSize: '0.875rem', fontWeight: '500'}}>Alle direkten Zuweisungen auswählen</span>
              </div>
            )}
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {tasks.map((task) => (
                <div key={task.assignment_id || `series-${task.id}`} style={{
                  padding: '1rem',
                  border: task.isSeriesTask ? '1px dashed var(--c-accent-border)' : '1px solid var(--c-border)',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  backgroundColor: task.isSeriesTask ? 'var(--c-accent-soft)' : (task.assignment_id && selectedTaskIds.includes(task.assignment_id) ? 'var(--c-accent-soft)' : 'white'),
                }}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1}}>
                    {task.assignment_id ? (
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task.assignment_id)}
                        onChange={() => handleToggleTask(task.assignment_id!)}
                        style={styles.checkbox}
                      />
                    ) : (
                      <span style={{width: '16px'}} />
                    )}
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>
                        {task.title}
                        {task.isSeriesTask && task.seriesName && (
                          <span style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.7rem',
                            padding: '0.125rem 0.5rem',
                            backgroundColor: 'var(--c-accent-soft)',
                            color: 'var(--c-accent-text)',
                            borderRadius: '9999px',
                            fontWeight: '500',
                          }}>{task.seriesName}</span>
                        )}
                      </div>
                      <div style={{fontSize: '0.875rem', color: 'var(--c-text-muted)'}}>
                        {/* Die Durchführungsnummer ("#1") stand hier noch aus der Zeit
                            der mehrfachen Durchführungen - sie sagt nichts mehr aus. */}
                        {task.event_name ? `${task.event_name} - ` : ''}Tag {task.day_number}
                        {task.isSeriesTask && <span style={{fontStyle: 'italic'}}> (Serien-Zuweisung)</span>}
                      </div>
                      <div style={{marginTop: '0.5rem'}}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.625rem',
                          backgroundColor: getStatusColor(task.status),
                          color: 'var(--c-text-inverse)',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}>
                          {getStatusLabel(task.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {task.assignment_id ? (
                    <button
                      onClick={() => onUnassign(task.assignment_id!)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: 'var(--c-danger)',
                        color: 'var(--c-text-inverse)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                      }}
                      title="Zuweisung entfernen"
                    >
                      Entfernen
                    </button>
                  ) : (
                    <span style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.75rem',
                      color: 'var(--c-text-muted)',
                      fontStyle: 'italic',
                    }}>
                      Serie
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Flach statt verschachtelt und mit app-modal-actions: die drei
            Buttons lagen vorher in zwei Ebenen mit space-between, dadurch
            lief "Schließen" auf dem Handy aus dem Modal heraus (gemessen:
            bis 406px bei 366px Modalbreite). Jetzt greift die gemeinsame
            Umbruchregel aus styles/modal.css. */}
        <div className="app-modal-actions" style={{marginTop: '1.5rem'}}>
          <button onClick={() => setShowReplaceModal(true)} style={styles.secondaryButton}>
            Mitarbeiter austauschen
          </button>
          <button onClick={onClose} style={styles.cancelButton}>
            Schließen
          </button>
          <button onClick={() => setShowAssignModal(true)} style={styles.submitButton}>
            Zuweisen
          </button>
        </div>

        {showReplaceModal && (
          <ReplaceStaffModal
            eventId={eventId}
            currentStaffId={staff.id}
            currentStaffName={staff.name}
            onClose={() => setShowReplaceModal(false)}
            onReplace={handleReplaceStaff}
          />
        )}

        {showAssignModal && (
          <AssignTasksModal
            eventId={eventId}
            staffId={staff.id}
            staffName={staff.name}
            leitung={leitung}
            onClose={() => setShowAssignModal(false)}
            onSuccess={() => {
              setShowAssignModal(false);
              onReload();
            }}
          />
        )}
      </div>
    </div>
  );
};

interface ReplaceStaffModalProps {
  eventId: number;
  currentStaffId: number;
  currentStaffName: string;
  onClose: () => void;
  onReplace: (newStaffId: number) => void;
}

const ReplaceStaffModal: React.FC<ReplaceStaffModalProps> = ({
  eventId,
  currentStaffId,
  currentStaffName,
  onClose,
  onReplace
}) => {
  const [availableStaff, setAvailableStaff] = React.useState<EventStaff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadAvailableStaff();
  }, [eventId, currentStaffId]);

  const loadAvailableStaff = async () => {
    try {
      setLoading(true);
      const response = await client.get(`/users/event/${eventId}/staff`);
      const staff = response.data.filter((s: User) => s.id !== currentStaffId);
      setAvailableStaff(staff);
    } catch (error) {
      console.error('Load available staff error:', error);
      alert('Fehler beim Laden der Mitarbeiter');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!selectedStaffId) {
      alert('Bitte einen Mitarbeiter auswählen');
      return;
    }
    if (!confirm(`${currentStaffName} wirklich durch den ausgewählten Mitarbeiter ersetzen? Alle Aufgaben werden neu zugewiesen.`)) {
      return;
    }
    onReplace(selectedStaffId);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={{...styles.modal, maxWidth: '500px', zIndex: 1001}}>
        <h2 style={styles.modalTitle}>Mitarbeiter austauschen</h2>
        <p style={{marginBottom: '1rem', color: 'var(--c-text-muted)'}}>
          Wählen Sie einen Mitarbeiter aus, der <strong>{currentStaffName}</strong> ersetzen soll.
          Alle Aufgaben werden automatisch neu zugewiesen.
        </p>

        {loading ? (
          <p style={styles.noStaff}>Lade Mitarbeiter...</p>
        ) : availableStaff.length === 0 ? (
          <p style={styles.noStaff}>Keine anderen Mitarbeiter im Pool verfügbar.</p>
        ) : (
          <div style={styles.staffList}>
            {availableStaff.map((staff) => (
              <label key={staff.id} style={{
                ...styles.staffCheckbox,
                backgroundColor: selectedStaffId === staff.id ? 'var(--c-accent-soft)' : 'transparent',
              }}>
                <input
                  type="radio"
                  name="replace-staff"
                  checked={selectedStaffId === staff.id}
                  onChange={() => setSelectedStaffId(staff.id)}
                  style={styles.checkbox}
                />
                <span style={{fontWeight: selectedStaffId === staff.id ? '600' : '400'}}>
                  {staff.name}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="app-modal-actions" style={styles.modalButtons}>
          <button onClick={onClose} style={styles.cancelButton}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            style={styles.submitButton}
            disabled={!selectedStaffId}
          >
            Austauschen
          </button>
        </div>
      </div>
    </div>
  );
};

interface Zuweisung {
  userId?: number;
  name: string;
  role?: string;
  viaSeries: boolean;
}

interface AssignTasksModalProps {
  eventId: number;
  staffId: number;
  staffName: string;
  /** Leitung der Veranstaltung - fuer die Farbe der Zuweisungs-Badges. */
  leitung?: Leitung[];
  onClose: () => void;
  onSuccess: () => void;
}

const AssignTasksModal: React.FC<AssignTasksModalProps> = ({
  eventId,
  staffId,
  staffName,
  leitung,
  onClose,
  onSuccess
}) => {
  const [availableTasks, setAvailableTasks] = React.useState<any[]>([]);
  const [eventInstances, setEventInstances] = React.useState<any[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<number | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);

  /*
   * Wer ist auf welcher Aufgabe? Ohne diese Angabe verteilt man hier blind -
   * man sieht nicht, was schon vergeben ist und was noch niemand hat. Die
   * Badges sind dieselben wie in der Tabellen- und Kartenansicht, damit man
   * nicht zwei Darstellungen im Kopf halten muss.
   */
  const [zuweisungen, setZuweisungen] = React.useState<{ [taskId: number]: Zuweisung[] }>({});
  const [filter, setFilter] = React.useState<'alle' | 'offen'>('alle');
  const [tagFilter, setTagFilter] = React.useState<number | 'alle'>('alle');

  React.useEffect(() => {
    loadEventInstances();
  }, [eventId]);

  React.useEffect(() => {
    if (selectedInstanceId) {
      loadAvailableTasks();
    }
  }, [selectedInstanceId, staffId]);

  const loadEventInstances = async () => {
    try {
      setLoading(true);
      const response = await client.get(`/events/${eventId}/instances`);
      setEventInstances(response.data);
      if (response.data.length > 0) {
        setSelectedInstanceId(response.data[0].id);
      }
    } catch (error) {
      console.error('Load event instances error:', error);
      alert('Fehler beim Laden der Event-Instanzen');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTasks = async () => {
    try {
      setLoading(true);
      // Get all tasks for this event
      const tasksResponse = await client.get(`/tasks/event/${eventId}`);
      const allTasks = tasksResponse.data;

      // Get tasks already assigned to this staff member for this instance
      const assignedResponse = await client.get(`/tasks/event/${eventId}/user/${staffId}/assignments`);
      const assignedTaskIds = new Set(assignedResponse.data.map((a: any) => a.id));

      // Filter out already assigned tasks
      const available = allTasks.filter((task: any) => !assignedTaskIds.has(task.id));
      setAvailableTasks(available);

      // Bestehende Zuweisungen der Durchführung - für die Badges
      const [alleZuw, serien] = await Promise.all([
        client.get(`/tasks/instance/${selectedInstanceId}/assignments`).then(r => r.data).catch(() => []),
        taskSeriesApi.getByEvent(eventId).catch(() => []),
      ]);

      const serienMitglieder: { [seriesId: number]: Set<number> } = {};
      for (const serie of serien) {
        try {
          const details = await taskSeriesApi.getById(serie.id);
          serienMitglieder[serie.id] = new Set((details.members || []).map(m => m.id));
        } catch {
          /* Serie nicht ladbar - dann eben ohne Herkunft */
        }
      }

      const karte: { [taskId: number]: Zuweisung[] } = {};
      for (const zeile of alleZuw) {
        if (!zeile.user_name) continue;
        const viaSeries = !!zeile.series_id && !!serienMitglieder[zeile.series_id]?.has(zeile.user_id);
        (karte[zeile.id] ||= []).push({
          userId: zeile.user_id, name: zeile.user_name, role: zeile.user_role, viaSeries,
        });
      }
      setZuweisungen(karte);
    } catch (error) {
      console.error('Load available tasks error:', error);
      alert('Fehler beim Laden der verfügbaren Aufgaben');
    } finally {
      setLoading(false);
    }
  };

  const sichtbareTasks = availableTasks.filter((t: any) => {
    if (filter === 'offen' && (zuweisungen[t.id]?.length || 0) > 0) return false;
    if (tagFilter !== 'alle' && t.day_number !== tagFilter) return false;
    return true;
  });

  const handleToggleTask = (taskId: number) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSelectAll = () => {
    // Bezieht sich auf das, was der Filter gerade zeigt - sonst waehlt man
    // unsichtbare Aufgaben mit aus.
    const alleSichtbarGewaehlt = sichtbareTasks.length > 0
      && sichtbareTasks.every(t => selectedTaskIds.includes(t.id));
    if (alleSichtbarGewaehlt) {
      setSelectedTaskIds(prev => prev.filter(id => !sichtbareTasks.some(t => t.id === id)));
    } else {
      setSelectedTaskIds(prev => [...new Set([...prev, ...sichtbareTasks.map(t => t.id)])]);
    }
  };

  const handleSubmit = async () => {
    if (selectedTaskIds.length === 0) {
      alert('Bitte mindestens eine Aufgabe auswählen');
      return;
    }
    if (!selectedInstanceId) {
      alert('Bitte eine Event-Instanz auswählen');
      return;
    }

    try {
      await client.post('/tasks/assign', {
        task_id: selectedTaskIds[0], // We'll need to modify this for bulk
        event_instance_id: selectedInstanceId,
        user_ids: [staffId],
      });

      // Assign remaining tasks one by one (or modify backend to handle bulk)
      for (let i = 1; i < selectedTaskIds.length; i++) {
        await client.post('/tasks/assign', {
          task_id: selectedTaskIds[i],
          event_instance_id: selectedInstanceId,
          user_ids: [staffId],
        });
      }

      alert(`${selectedTaskIds.length} Aufgabe(n) erfolgreich zugewiesen`);
      onSuccess();
    } catch (error) {
      console.error('Assign tasks error:', error);
      alert('Fehler beim Zuweisen der Aufgaben');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={{...styles.modal, maxWidth: '600px', maxHeight: '80vh', overflow: 'auto', zIndex: 1001}}>
        <h2 style={styles.modalTitle}>Aufgaben zuweisen - {staffName}</h2>

        {loading ? (
          <p style={styles.noStaff}>Lade Aufgaben...</p>
        ) : (
          <>
            {eventInstances.length > 1 && (
              <div style={{marginBottom: '1.5rem'}}>
                <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '500'}}>
                  Event-Instanz:
                </label>
                <select
                  value={selectedInstanceId || ''}
                  onChange={(e) => setSelectedInstanceId(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--c-border-strong)',
                    borderRadius: '4px',
                    fontSize: '1rem',
                  }}
                >
                  {eventInstances.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      Instanz #{instance.instance_number} - {toLocalDate(instance.start_date)!.toLocaleDateString('de-DE')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availableTasks.length === 0 ? (
              <p style={styles.noStaff}>Keine verfügbaren Aufgaben für diese Instanz.</p>
            ) : (
              <>
                {/*
                  Filter. "Ohne Zuweisung" ist der wichtigste Fall: beim
                  Verteilen sucht man die Lücken, nicht das schon Vergebene.
                */}
                <div className="tv-toolbar" style={{ marginBottom: '0.75rem' }}>
                  <button type="button" onClick={() => setFilter('alle')}
                    className={filter === 'alle' ? 'tv-chip-active' : 'tv-chip'}>
                    Alle {availableTasks.length}
                  </button>
                  <button type="button" onClick={() => setFilter('offen')}
                    className={filter === 'offen' ? 'tv-chip-active' : 'tv-chip'}>
                    Ohne Zuweisung {availableTasks.filter(t => !(zuweisungen[t.id]?.length)).length}
                  </button>
                  <span className="tv-label" style={{ marginLeft: '0.5rem' }}>Tage</span>
                  <button type="button" onClick={() => setTagFilter('alle')}
                    className={tagFilter === 'alle' ? 'tv-chip-active' : 'tv-chip'}>
                    Alle
                  </button>
                  {Array.from(new Set(availableTasks.map(t => t.day_number))).sort((a: any, b: any) => a - b).map((tag: any) => (
                    <button key={tag} type="button" onClick={() => setTagFilter(tag)}
                      className={tagFilter === tag ? 'tv-chip-active' : 'tv-chip'}>
                      {tag}
                    </button>
                  ))}
                </div>

                <div style={{marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <input
                    type="checkbox"
                    checked={sichtbareTasks.length > 0 && sichtbareTasks.every(t => selectedTaskIds.includes(t.id))}
                    onChange={handleSelectAll}
                    style={styles.checkbox}
                  />
                  <span style={{fontSize: '0.875rem', fontWeight: '500'}}>Alle auswählen</span>
                </div>
                <div style={{...styles.staffList, maxHeight: '300px'}}>
                  {sichtbareTasks.length === 0 && (
                    <p style={styles.noStaff}>Keine Aufgabe passt zum Filter.</p>
                  )}
                  {sichtbareTasks.map((task) => (
                    <label key={task.id} style={{
                      ...styles.staffCheckbox,
                      alignItems: 'flex-start',
                      backgroundColor: selectedTaskIds.includes(task.id) ? 'var(--c-accent-soft)' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task.id)}
                        onChange={() => handleToggleTask(task.id)}
                        style={{ ...styles.checkbox, marginTop: '0.125rem' }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{fontWeight: '500'}}>{task.title}</div>
                        <div style={{fontSize: '0.875rem', color: 'var(--c-text-muted)'}}>
                          Tag {task.day_number}
                          {task.scheduled_time && ` - ${task.scheduled_time}`}
                        </div>
                        {/* Dieselben Badges wie in Tabellen- und Kartenansicht */}
                        <div style={styles.zuweisungsZeile}>
                          {(zuweisungen[task.id] || []).length === 0 ? (
                            <span style={styles.nochNiemand}>noch niemand</span>
                          ) : (
                            zuweisungen[task.id].map((z, i) => (
                              <span
                                key={i}
                                style={{
                                  ...styles.zuweisungsBadge,
                                  ...eventBadgeColors(eventRolleVon(z.userId, leitung)),
                                  border: z.viaSeries
                                    ? '1px dashed var(--c-accent-border)'
                                    : '1px solid transparent',
                                }}
                                title={eventAssignmentTitle(eventRolleVon(z.userId, leitung), z.role, z.viaSeries)}
                              >
                                {z.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="app-modal-actions" style={styles.modalButtons}>
          <button onClick={onClose} style={styles.cancelButton}>
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            style={styles.submitButton}
            disabled={selectedTaskIds.length === 0}
          >
            {selectedTaskIds.length > 0
              ? `${selectedTaskIds.length} Aufgabe(n) zuweisen`
              : 'Aufgaben zuweisen'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: 'var(--shadow-md)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
    marginBottom: '1rem',
  },
  headerToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.5rem',
    marginLeft: '-0.5rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.12s ease',
  },
  caret: {
    display: 'inline-block',
    fontSize: '1.125rem',
    lineHeight: 1,
    color: 'var(--c-text-subtle)',
    transition: 'transform 0.15s ease',
  },
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '1.375rem',
    height: '1.375rem',
    padding: '0 0.375rem',
    borderRadius: '9999px',
    backgroundColor: 'var(--c-surface-muted)',
    color: 'var(--c-text-muted)',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  infoIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.125rem',
    height: '1.125rem',
    borderRadius: '9999px',
    border: '1px solid var(--c-border-strong)',
    color: 'var(--c-text-subtle)',
    fontSize: '0.6875rem',
    fontWeight: '700',
    fontStyle: 'italic',
    cursor: 'help',
    lineHeight: 1,
  },
  infoText: {
    margin: '0 0 1rem',
    padding: '0.625rem 0.75rem',
    backgroundColor: 'var(--c-surface-muted)',
    borderLeft: '3px solid var(--c-border-strong)',
    borderRadius: '0 4px 4px 0',
    fontSize: '0.8125rem',
    color: 'var(--c-text-muted)',
  },
  title: {
    fontSize: '1.0625rem',
    fontWeight: '600',
    color: 'var(--c-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    margin: 0,
  },
  addButton: {
    padding: '0.4375rem 0.875rem',
    backgroundColor: 'transparent',
    color: 'var(--c-accent-text)',
    border: '1px solid var(--c-accent-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--c-text-muted)',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 1rem',
    color: 'var(--c-text-muted)',
  },
  emptyHint: {
    fontSize: '0.875rem',
    marginTop: '0.5rem',
  },
  staffGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  staffCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.125rem',
  },
  staffEllipse: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-strong)',
    border: 'none',
    borderRadius: '9999px',
    position: 'relative',
  },
  staffInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  staffName: {
    fontWeight: '500',
    color: 'inherit',
    fontSize: '0.75rem',
  },
  staffMeta: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  staffBadge: {
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
  },
  taskCount: {
    fontSize: '0.75rem',
    color: 'var(--c-accent-text)',
    fontWeight: '500',
    backgroundColor: 'transparent',
    border: 'none',
    padding: '0.125rem 0.25rem',
  },
  removeButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-danger-text)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1.25rem',
    lineHeight: 1,
  },
  removeButtonEllipse: {
    padding: '0',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: 'var(--c-danger-text)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    lineHeight: 1,
    borderRadius: '50%',
    transition: 'background-color 0.2s',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--c-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'var(--c-text)',
  },
  noStaff: {
    textAlign: 'center',
    padding: '2rem',
    color: 'var(--c-text-muted)',
  },
  staffList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    maxHeight: '400px',
    overflow: 'auto',
  },
  staffCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  modalButtons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  },
  cancelButton: {
    padding: '0.625rem 1rem',
    backgroundColor: 'var(--c-surface-muted)',
    color: 'var(--c-text)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  submitButton: {
    padding: '0.625rem 1rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.9375rem',
    cursor: 'pointer',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  dangerButton: {
    padding: '0.625rem 1rem',
    backgroundColor: 'transparent',
    color: 'var(--c-danger-text)',
    border: '1px solid var(--c-danger)',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  zuweisungsZeile: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    marginTop: '0.375rem',
  },
  zuweisungsBadge: {
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.6875rem',
    fontWeight: '500',
  },
  nochNiemand: {
    fontSize: '0.6875rem',
    fontStyle: 'italic',
    color: 'var(--c-text-subtle)',
  },
  taskDisclosure: {
    marginBottom: '1.25rem',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  taskDisclosureHeader: {
    display: 'flex',
    alignItems: 'center',
    /* die globale Regel `button { justify-content: center }` würde die
       Beschriftung sonst mittig setzen */
    justifyContent: 'flex-start',
    gap: '0.5rem',
    width: '100%',
    padding: '0.625rem 0.75rem',
    backgroundColor: 'var(--c-surface-muted)',
    color: 'var(--c-text)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  disclosureCaret: {
    fontSize: '0.75rem',
    color: 'var(--c-text-subtle)',
  },
  taskDisclosureActions: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    borderTop: '1px solid var(--c-border)',
  },
  taskDisclosureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    padding: '0.25rem 0.75rem 0.75rem',
    /* Deckel gegen lange Listen - der Dialog bleibt gleich hoch, egal ob
       3 oder 60 Aufgaben zugewiesen sind. */
    maxHeight: '13rem',
    overflowY: 'auto',
  },
  miniButton: {
    padding: '0.25rem 0.625rem',
    backgroundColor: 'var(--c-surface)',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '500',
    fontFamily: 'inherit',
  },
  removeTaskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.3125rem 0',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  removeTaskDay: {
    flex: '0 0 auto',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--c-text-subtle)',
  },
};
