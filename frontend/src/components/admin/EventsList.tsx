import React, { useState, useEffect } from 'react';
import { eventsApi, Event } from '../../api/events';
import { usersApi, User } from '../../api/users';
import { CreateEventModal } from './CreateEventModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { EventEditModal } from './EventEditModal';
import { EventDetail } from './EventDetail';
import { CSVExportModal } from './CSVExportModal';
import { CSVImportModal } from './CSVImportModal';
import { useAuth } from '../../context/AuthContext';
import { useSSE } from '../../hooks/useSSE';
import responsiveStyles from './EventsList.module.css';
import { toLocalDate } from '../../utils/date';

type TabType = 'own' | 'co-lead' | 'templates' | 'other-teamleiters';

/*
 * In welcher Phase steckt eine Veranstaltung?
 *
 * Die Liste kam bisher in der Reihenfolge des Servers - nach Startdatum
 * absteigend. Damit stand eine Freizeit im naechsten Sommer ueber der, die
 * gerade laeuft. Was man sucht, ist aber fast immer die laufende oder die
 * naechste; Vergangenes soll nicht im Weg stehen.
 */
type Phase = 'laufend' | 'bevorstehend' | 'vergangen' | 'ohne-datum';

const phaseVon = (event: Event): Phase => {
  const start = toLocalDate(event.start_date);
  if (!start) return 'ohne-datum';

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Der letzte Tag zaehlt noch dazu: eine dreitaegige Freizeit ab Montag
  // laeuft bis einschliesslich Mittwoch.
  const ende = new Date(start);
  ende.setDate(ende.getDate() + Math.max(1, event.days || 1) - 1);

  if (ende < heute) return 'vergangen';
  if (start > heute) return 'bevorstehend';
  return 'laufend';
};

const PHASEN_LABEL: Record<Phase, string> = {
  laufend: 'Laufend',
  bevorstehend: 'Bevorstehend',
  vergangen: 'Vergangen',
  'ohne-datum': 'Ohne Datum',
};

const PHASEN_RANG: Record<Phase, number> = {
  laufend: 0,
  bevorstehend: 1,
  'ohne-datum': 2,
  vergangen: 3,
};

/*
 * Laufende zuerst, dann die naechsten (die naeheste oben), dann die ohne
 * Datum, ganz unten das Vergangene (das zuletzt gewesene oben).
 */
const nachPhaseSortiert = (events: Event[]): Event[] =>
  [...events].sort((a, b) => {
    const pa = phaseVon(a);
    const pb = phaseVon(b);
    if (PHASEN_RANG[pa] !== PHASEN_RANG[pb]) return PHASEN_RANG[pa] - PHASEN_RANG[pb];

    const za = toLocalDate(a.start_date)?.getTime() ?? 0;
    const zb = toLocalDate(b.start_date)?.getTime() ?? 0;
    // Vergangenes rueckwaerts: das zuletzt Gewesene ist das interessantere.
    return pa === 'vergangen' ? zb - za : za - zb;
  });

export const EventsList: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [teamleiters, setTeamleiters] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(() => {
    const saved = localStorage.getItem('adminSelectedEventId');
    return saved ? parseInt(saved, 10) : null;
  });
  const [activeTab, setActiveTab] = useState<TabType>('own');
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  // Gewählte Phase überdauert Reloads - wer auf "Laufend" steht, will das
  // beim nächsten Öffnen meist wieder.
  const [phasenFilter, setPhasenFilter] = useState<Phase | 'alle'>(() => {
    const gespeichert = localStorage.getItem('eventsPhaseFilter');
    return gespeichert === 'laufend' || gespeichert === 'bevorstehend'
      || gespeichert === 'vergangen' || gespeichert === 'ohne-datum'
      ? gespeichert
      : 'alle';
  });
  const { user, isAdmin, isTeamleiter } = useAuth();

  useEffect(() => {
    localStorage.setItem('eventsPhaseFilter', phasenFilter);
  }, [phasenFilter]);

  // SSE für Event-Updates
  useSSE({
    enabled: true,
    onEventUpdate: () => {
      console.log('SSE: Event update received');
      loadData(false);
    },
    onConnected: () => {
      console.log('SSE: EventsList connected');
    },
    onError: (error) => {
      console.error('SSE: EventsList error', error);
    }
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedEventId !== null) {
      localStorage.setItem('adminSelectedEventId', selectedEventId.toString());
    } else {
      localStorage.removeItem('adminSelectedEventId');
      // Liste neu laden wenn von EventDetail zurückgekehrt wird
      loadData(false);
    }
  }, [selectedEventId]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const eventsData = await eventsApi.getAll();
      setEvents(eventsData);

      // Admin lädt auch alle Teamleiter
      if (isAdmin) {
        const usersData = await usersApi.getAll();
        const teamleiterUsers = usersData.filter(u => u.role === 'teamleiter');
        setTeamleiters(teamleiterUsers);
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleEditSuccess = async () => {
    setEditingEvent(null);
    await loadData(false);
  };

  const handleCopyToTemplate = async (eventId: number) => {
    if (!confirm('Veranstaltung als Vorlage kopieren? (ohne Zuweisungen und Datum)')) return;

    try {
      await eventsApi.copyToTemplate(eventId);
      await loadData(false);
      alert('Vorlage erfolgreich erstellt');
    } catch (error) {
      console.error('Copy to template error:', error);
      alert('Fehler beim Erstellen der Vorlage');
    }
  };

  const handleSuggestAsTemplate = async (eventId: number) => {
    if (!confirm('Diese Veranstaltung als Vorlage vorschlagen?')) return;

    try {
      await eventsApi.suggestAsTemplate(eventId);
      await loadData(false);
      alert('Vorschlag wurde an Admins gesendet');
    } catch (error) {
      console.error('Suggest template error:', error);
      alert('Fehler beim Vorschlagen');
    }
  };

  const handleApproveSuggestion = async (eventId: number) => {
    if (!confirm('Vorschlag als Vorlage annehmen? (erstellt Kopie ohne Zuweisungen/Datum)')) return;

    try {
      await eventsApi.approveSuggestion(eventId);
      await loadData(false);
      alert('Vorlage erfolgreich erstellt');
    } catch (error) {
      console.error('Approve suggestion error:', error);
      alert('Fehler beim Annehmen des Vorschlags');
    }
  };

  const handleToggleSelect = (eventId: number) => {
    setSelectedIds(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('Bitte mindestens ein Event auswählen');
      return;
    }

    // Teamleiter cannot delete templates
    if (isTeamleiter && !isAdmin) {
      const eventsToDelete = events.filter(e => selectedIds.includes(e.id));
      const hasTemplates = eventsToDelete.some(e => e.is_template);
      if (hasTemplates) {
        alert('Teamleiter können keine Vorlagen löschen. Bitte wenden Sie sich an einen Administrator.');
        return;
      }
    }

    if (!confirm(`${selectedIds.length} Events wirklich löschen?`)) return;

    try {
      await eventsApi.bulkDelete(selectedIds);
      setSelectedIds([]);
      await loadData(false);
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Fehler beim Löschen');
    }
  };

  const handleBulkApproveSuggestions = async () => {
    if (selectedIds.length === 0) {
      alert('Bitte mindestens einen Vorschlag auswählen');
      return;
    }

    if (!confirm(`${selectedIds.length} Vorschläge als Vorlagen annehmen?`)) return;

    try {
      await eventsApi.bulkApproveSuggestions(selectedIds);
      setSelectedIds([]);
      await loadData(false);
      alert('Vorlagen erfolgreich erstellt');
    } catch (error) {
      console.error('Bulk approve error:', error);
      alert('Fehler beim Annehmen der Vorschläge');
    }
  };

  const handleExportSuccess = () => {
    setShowExportModal(false);
  };

  const handleImportSuccess = async () => {
    setShowImportModal(false);
    await loadData(false);
  };

  const getTabs = () => {
    const tabs: { id: TabType; label: string; count: number }[] = [];

    if (isAdmin) {
      // Admin: Eigene Veranstaltungen (FIRST) - inkl. vorgeschlagene Events
      const ownEvents = events.filter(e => !e.is_template && e.created_by === user?.id);
      tabs.push({
        id: 'own',
        label: 'Eigene Veranstaltungen',
        count: ownEvents.length,
      });

      // Admin: Vorlagen (inkl. Vorschläge von anderen)
      const templates = events.filter(e => e.is_template || (e.is_template_suggestion && e.created_by !== user?.id));
      tabs.push({
        id: 'templates',
        label: 'Vorlagen',
        count: templates.length,
      });

      // Admin: Andere Teamleiter (zusammengefasst)
      const otherTeamleiterEvents = events.filter(
        e => !e.is_template && !e.is_template_suggestion && e.created_by !== user?.id
      );
      if (otherTeamleiterEvents.length > 0) {
        tabs.push({
          id: 'other-teamleiters',
          label: 'Andere Teamleiter',
          count: otherTeamleiterEvents.length,
        });
      }
    } else if (isTeamleiter) {
      // Teamleiter: Eigene Veranstaltungen (FIRST) - inkl. vorgeschlagene Events
      const ownEvents = events.filter(e => !e.is_template && e.created_by === user?.id);
      tabs.push({
        id: 'own',
        label: 'Eigene Veranstaltungen',
        count: ownEvents.length,
      });

      /*
       * Veranstaltungen, die man mitleitet, ohne sie angelegt zu haben.
       * Die fehlten hier komplett: der Server liefert sie zwar, die
       * Reiter filterten aber nur auf created_by - eine Co-Teamleitung sah
       * ihre Veranstaltung also nirgends, obwohl sie sie verwalten darf.
       */
      const mitleitung = events.filter(e => !e.is_template && e.created_by !== user?.id);
      if (mitleitung.length > 0) {
        tabs.push({
          id: 'co-lead',
          label: 'Mitleitung',
          count: mitleitung.length,
        });
      }

      // Teamleiter: Vorlagen
      const templates = events.filter(e => e.is_template);
      if (templates.length > 0) {
        tabs.push({
          id: 'templates',
          label: 'Vorlagen',
          count: templates.length,
        });
      }
    }

    return tabs;
  };

  const getEventsForTab = (tabId: TabType): Event[] => {
    if (tabId === 'own') {
      // Eigene Veranstaltungen inkl. vorgeschlagene Events
      return events.filter(e => !e.is_template && e.created_by === user?.id);
    }

    if (tabId === 'templates') {
      if (isTeamleiter) {
        // Teamleiter sehen nur echte Vorlagen
        return events.filter(e => e.is_template);
      } else {
        // Admin sieht Vorlagen und Vorschläge von anderen Teamleitern
        return events.filter(e => e.is_template || (e.is_template_suggestion && e.created_by !== user?.id));
      }
    }

    if (tabId === 'co-lead') {
      return events.filter(e => !e.is_template && e.created_by !== user?.id);
    }

    if (tabId === 'other-teamleiters') {
      return events.filter(e => !e.is_template && !e.is_template_suggestion && e.created_by !== user?.id);
    }

    return [];
  };

  const renderEventCard = (event: Event) => {
    const isCreator = event.created_by === user?.id;
    const canEdit = isAdmin || (isTeamleiter && isCreator && !event.is_template);
    // Teamleiter cannot select templates (no delete permission)
    const canSelect = isAdmin || !event.is_template;

    return (
      <div key={event.id} style={{...styles.card, ...(selectedIds.includes(event.id) ? styles.selectedCard : {})}}>
        <div style={styles.cardHeader}>
          <div style={styles.cardHeaderLeft}>
            {canSelect && (
              <input
                type="checkbox"
                checked={selectedIds.includes(event.id)}
                onChange={() => handleToggleSelect(event.id)}
                style={styles.checkbox}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <h3 style={styles.eventName}>{event.name}</h3>
          </div>
          <div style={styles.badges}>
            {event.is_template && <span style={styles.templateBadge}>Vorlage</span>}
            {event.is_template_suggestion && <span style={styles.suggestionBadge}>Vorgeschlagen</span>}
          </div>
        </div>
        {event.description && <p style={styles.eventDescription}>{event.description}</p>}
        {event.start_date && (
          <div style={styles.eventMeta}>
            <span>Start: {toLocalDate(event.start_date)!.toLocaleDateString('de-DE')}</span>
            <span>{event.days} Tage</span>
          </div>
        )}
        {!event.start_date && (
          <div style={styles.eventMeta}>
            <span>{event.days} Tage</span>
          </div>
        )}
        {event.creator_name && (
          <div style={styles.creatorInfo}>
            {event.is_template_suggestion ? 'Vorgeschlagen von' : 'Erstellt von'}: {event.creator_name}
          </div>
        )}
        <div style={styles.actions}>
          <button onClick={() => setSelectedEventId(event.id)} style={styles.viewButton}>
            Details
          </button>
          {canEdit && (
            <button onClick={() => setEditingEvent(event)} style={styles.editButton}>
              Bearbeiten
            </button>
          )}
          {/* "Verwenden" Button bei Vorlagen für Admin und Teamleiter */}
          {event.is_template && (
            <button onClick={() => setSelectedTemplateId(event.id)} style={styles.useTemplateButton}>
              Verwenden
            </button>
          )}
          {isAdmin && !event.is_template && !event.is_template_suggestion && (
            <button onClick={() => handleCopyToTemplate(event.id)} style={styles.templateButton2}>
              Vorlage
            </button>
          )}
          {isTeamleiter && isCreator && !event.is_template && !event.is_template_suggestion && (
            <button onClick={() => handleSuggestAsTemplate(event.id)} style={styles.suggestButton}>
              Vorschlagen
            </button>
          )}
          {isAdmin && event.is_template_suggestion && (
            <button onClick={() => handleApproveSuggestion(event.id)} style={styles.approveButton}>
              Annehmen
            </button>
          )}
        </div>
      </div>
    );
  };

  if (selectedEventId) {
    return <EventDetail eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />;
  }

  if (loading) {
    return <div>Lade Veranstaltungen...</div>;
  }

  const tabs = getTabs();
  const tabEvents = getEventsForTab(activeTab);

  // Vorlagen haben kein Datum - dort waere der Filter sinnlos.
  const zeigePhasenFilter = activeTab !== 'templates';

  const phasenZahlen = tabEvents.reduce((acc, e) => {
    const p = phaseVon(e);
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<Phase, number>);

  const currentEvents = nachPhaseSortiert(
    zeigePhasenFilter && phasenFilter !== 'alle'
      ? tabEvents.filter(e => phaseVon(e) === phasenFilter)
      : tabEvents
  );

  return (
    <div>
      <div style={styles.header} className={responsiveStyles.header}>
        <div style={styles.titleRow}>
          <h2 style={styles.title} className={responsiveStyles.title}>Veranstaltungen</h2>
            <div style={styles.csvGroup} className={responsiveStyles.csvGroup}>
              <button onClick={() => setShowImportModal(true)} style={styles.csvButton}>
                Importieren
              </button>
              <span style={styles.csvDivider} aria-hidden="true" />
              <button onClick={() => setShowExportModal(true)} style={styles.csvButton}>
                Exportieren
              </button>
            </div>
        </div>
        <div style={styles.headerButtons} className={responsiveStyles.headerButtons}>
          {/* CSV ist eine Nebenfunktion: dezent und als Paar in einer Zeile,
              damit sie nicht mit den Hauptaktionen konkurriert. */}
                    {tabs.some(t => t.id === 'templates' && t.count > 0) && (
            <button
              onClick={() => setShowTemplateModal(true)}
              style={styles.templateButton}
              className={responsiveStyles.createButton}
            >
              Vorlage verwenden
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            style={styles.createButton}
            className={responsiveStyles.primaryButton}
          >
            Neue Veranstaltung
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div style={styles.bulkActions}>
          <span style={styles.bulkActionsText}>{selectedIds.length} ausgewählt</span>
          <button onClick={handleBulkDelete} style={styles.bulkDeleteButton}>
            Ausgewählte löschen
          </button>
          {activeTab === 'templates' && isAdmin && (
            <button onClick={handleBulkApproveSuggestions} style={styles.bulkApproveButton}>
              Vorschläge annehmen
            </button>
          )}
          <button onClick={() => setSelectedIds([])} style={styles.bulkCancelButton}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {showExportModal && (
        <CSVExportModal
          type="events"
          items={events}
          selectedIds={selectedIds}
          onClose={() => setShowExportModal(false)}
          onSuccess={handleExportSuccess}
        />
      )}

      {showImportModal && (
        <CSVImportModal
          type="events"
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {/* Desktop Tabs */}
      <div style={styles.tabsContainerDesktop} className={responsiveStyles.tabsDesktop}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.activeTab : {}),
            }}
          >
            {tab.label} <span style={styles.tabCount}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Mobile Dropdown */}
      <div style={styles.tabsContainerMobile} className={responsiveStyles.tabsMobile}>
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabType)}
          style={styles.tabSelect}
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label} ({tab.count})
            </option>
          ))}
        </select>
      </div>

      {/*
        Phasenfilter. Die Reihenfolge ist ohnehin laufend -> bevorstehend ->
        vergangen; wer nur eines davon sehen will, blendet den Rest hier aus.
      */}
      {zeigePhasenFilter && tabEvents.length > 0 && (
        <div style={styles.phaseBar}>
          <span style={styles.phaseLabel}>Zeitraum</span>
          <button
            type="button"
            onClick={() => setPhasenFilter('alle')}
            style={phasenFilter === 'alle' ? styles.phaseChipActive : styles.phaseChip}
            aria-pressed={phasenFilter === 'alle'}
          >
            Alle <span style={styles.phaseCount}>{tabEvents.length}</span>
          </button>
          {(['laufend', 'bevorstehend', 'vergangen', 'ohne-datum'] as Phase[])
            .filter(p => (phasenZahlen[p] || 0) > 0)
            .map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPhasenFilter(p)}
                style={phasenFilter === p ? styles.phaseChipActive : styles.phaseChip}
                aria-pressed={phasenFilter === p}
              >
                {PHASEN_LABEL[p]} <span style={styles.phaseCount}>{phasenZahlen[p]}</span>
              </button>
            ))}
        </div>
      )}

      {/* Events Grid or Grouped List */}
      {currentEvents.length === 0 ? (
        <div style={styles.empty}>
          {zeigePhasenFilter && phasenFilter !== 'alle' && tabEvents.length > 0
            ? `Keine Veranstaltung im Zeitraum „${PHASEN_LABEL[phasenFilter as Phase]}".`
            : 'Keine Veranstaltungen in dieser Kategorie'}
        </div>
      ) : activeTab === 'other-teamleiters' ? (
        /*
         * Nach Ersteller gruppiert - und zwar anhand der Veranstaltungen
         * selbst, nicht anhand der Teamleiter-Liste. Vorher zaehlte der
         * Reiter ALLE fremden Veranstaltungen, gezeigt wurden aber nur die
         * von Leuten mit der Rolle "teamleiter". Veranstaltungen eines
         * zweiten Admins wurden also mitgezaehlt und dann nirgends
         * angezeigt - daher die falsche Zahl.
         */
        <div>
          {Array.from(new Set(currentEvents.map(e => e.created_by))).map(creatorId => {
            const creatorEvents = currentEvents.filter(e => e.created_by === creatorId);
            const name = creatorEvents[0]?.creator_name
              || teamleiters.find(tl => tl.id === creatorId)?.name
              || 'Unbekannt';
            return (
              <div key={creatorId} style={styles.teamleiterGroup}>
                <h3 style={styles.teamleiterHeader}>{name}</h3>
                <div style={styles.grid} className={responsiveStyles.grid}>
                  {creatorEvents.map(renderEventCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab === 'templates' && isAdmin ? (
        // Templates: separate actual templates and suggestions from other teamleiters
        <div>
          {events.filter(e => e.is_template).length > 0 && (
            <div style={styles.templateSection}>
              <h3 style={styles.sectionHeader}>Vorlagen</h3>
              <div style={styles.grid} className={responsiveStyles.grid}>
                {events.filter(e => e.is_template).map(renderEventCard)}
              </div>
            </div>
          )}
          {events.filter(e => e.is_template_suggestion && e.created_by !== user?.id).length > 0 && (
            <div style={styles.templateSection}>
              <h3 style={styles.sectionHeader}>Vorschläge</h3>
              <div style={styles.grid} className={responsiveStyles.grid}>
                {events.filter(e => e.is_template_suggestion && e.created_by !== user?.id).map(renderEventCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Standard grid
        <div style={styles.grid} className={responsiveStyles.grid}>
          {currentEvents.map(renderEventCard)}
        </div>
      )}

      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData(false);
          }}
        />
      )}

      {showTemplateModal && (
        <CreateFromTemplateModal
          templates={events.filter(e => e.is_template)}
          onClose={() => setShowTemplateModal(false)}
          onSuccess={() => {
            setShowTemplateModal(false);
            loadData(false);
          }}
        />
      )}

      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSuccess={handleEditSuccess}
          onDelete={() => {
            setEditingEvent(null);
            loadData(false); // Liste neu laden nach Löschen
          }}
        />
      )}

      {selectedTemplateId && (
        <CreateFromTemplateModal
          templates={events.filter(e => e.id === selectedTemplateId)}
          onClose={() => setSelectedTemplateId(null)}
          onSuccess={() => {
            setSelectedTemplateId(null);
            loadData(false);
          }}
        />
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    flexWrap: 'wrap',
  },
  headerButtons: {
    display: 'flex',
    gap: '0.75rem',
    // Ohne wrap schiebt sich "Neue Veranstaltung" auf schmalen Displays
    // aus dem Viewport - und ein horizontal überlaufendes Dokument macht
    // anschliessend jedes position:fixed-Modal zu breit.
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  createButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  // Mittlere Stufe: umrandet wie CSV, aber kräftigerer Text.
  // Nur "Neue Veranstaltung" ist gefüllt - eine Primäraktion pro Ansicht.
  templateButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-text-subtle)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
  },
  // CSV als zusammengehörige Nebenfunktion: kein Rahmen, nur Textlinks
  // mit einem gemeinsamen Label - tritt deutlich hinter die Hauptaktionen zurück.
  csvGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  csvButton: {
    padding: '0.25rem 0.125rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.75rem',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    textDecorationColor: 'var(--c-border-strong)',
    transition: 'color 0.15s ease',
  },
  csvDivider: {
    width: '1px',
    height: '0.875rem',
    backgroundColor: 'var(--c-border)',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  bulkActionsText: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  bulkDeleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  bulkApproveButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-success)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  bulkCancelButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  tabsContainerDesktop: {
    display: 'flex',
    gap: '1.5rem',
    marginBottom: '1.5rem',
    // 1px Grundlinie; die Tabs legen ihre eigene Linie per negativem
    // margin-bottom exakt darüber, damit nichts "schwebt".
    borderBottom: '1px solid var(--c-border)',
    overflowX: 'auto',
  },
  tabsContainerMobile: {
    display: 'none',
    marginBottom: '1.5rem',
  },
  tabSelect: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    backgroundColor: 'var(--c-surface)',
    cursor: 'pointer',
    color: 'var(--c-text)',
  },
  tab: {
    padding: '0.75rem 0.25rem',
    marginBottom: '-1px',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: 'none',
    borderBottom: '2px solid transparent',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    // Bewusst KEIN border-color in der Transition: Browser interpolieren
    // von Blau nach `transparent` über Schwarz - das war der schwarze Strich.
    transition: 'color 0.15s ease',
  },
  activeTab: {
    color: 'var(--c-accent-text)',
    borderBottom: '2px solid var(--c-accent)',
    fontWeight: '600',
  },
  tabCount: {
    color: 'var(--c-text-subtle)',
    fontSize: '0.8rem',
    fontWeight: '400',
    marginLeft: '0.25rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: 'var(--c-text-muted)',
  },
  phaseBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  phaseLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--c-text-muted)',
  },
  phaseChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    borderRadius: '999px',
    border: '1px solid var(--c-border-strong)',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    fontSize: '0.8125rem',
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  phaseChipActive: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    borderRadius: '999px',
    border: '1px solid var(--c-accent)',
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-text)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  phaseCount: {
    fontSize: '0.75rem',
    opacity: 0.75,
    fontVariantNumeric: 'tabular-nums',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem',
  },
  card: {
    padding: '1.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    backgroundColor: 'var(--c-surface)',
  },
  selectedCard: {
    backgroundColor: 'var(--c-accent-soft)',
    border: '2px solid var(--c-accent)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.5rem',
  },
  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
  },
  eventName: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    color: 'var(--c-text)',
  },
  badges: {
    display: 'flex',
    gap: '0.25rem',
  },
  templateBadge: {
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-text)',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '500',
  },
  suggestionBadge: {
    backgroundColor: 'var(--c-warning-soft)',
    color: 'var(--c-warning-strong)',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '500',
  },
  eventDescription: {
    color: 'var(--c-text-muted)',
    fontSize: '0.875rem',
    margin: '0 0 1rem 0',
  },
  eventMeta: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    marginBottom: '0.5rem',
  },
  creatorInfo: {
    fontSize: '0.75rem',
    color: 'var(--c-text-subtle)',
    marginBottom: '1rem',
  },
  actions: {
    display: 'flex',
    gap: '0.375rem',
    flexWrap: 'wrap',
  },
  viewButton: {
    flex: '1 1 auto',
    padding: '0.5rem 0.5rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
  },
  editButton: {
    flex: '1 1 auto',
    padding: '0.5rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  templateButton2: {
    flex: '1 1 auto',
    padding: '0.5rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  suggestButton: {
    flex: '1 1 auto',
    padding: '0.5rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  approveButton: {
    flex: '1 1 auto',
    padding: '0.5rem 0.5rem',
    backgroundColor: 'var(--c-success)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
  },
  useTemplateButton: {
    flex: '1 1 auto',
    padding: '0.5rem 0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  teamleiterGroup: {
    marginBottom: '2rem',
  },
  teamleiterHeader: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '2px solid var(--c-border)',
  },
  templateSection: {
    marginBottom: '2rem',
  },
  sectionHeader: {
    fontSize: '1.1rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: 'var(--c-text-muted)',
  },
};
