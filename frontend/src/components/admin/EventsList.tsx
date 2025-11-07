import React, { useState, useEffect } from 'react';
import { eventsApi, Event } from '../../api/events';
import { usersApi, User } from '../../api/users';
import { CreateEventModal } from './CreateEventModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { EventEditModal } from './EventEditModal';
import { EventDetail } from './EventDetail';
import { useAuth } from '../../context/AuthContext';
import responsiveStyles from './EventsList.module.css';

type TabType = 'own' | 'templates' | 'other-teamleiters';

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
  const { user, isAdmin, isTeamleiter } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedEventId !== null) {
      localStorage.setItem('adminSelectedEventId', selectedEventId.toString());
    } else {
      localStorage.removeItem('adminSelectedEventId');
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

  const getTabs = () => {
    const tabs: { id: TabType; label: string; count: number }[] = [];

    if (isAdmin) {
      // Admin: Eigene Veranstaltungen (FIRST)
      const ownEvents = events.filter(e => !e.is_template && !e.is_template_suggestion && e.created_by === user?.id);
      tabs.push({
        id: 'own',
        label: 'Eigene Veranstaltungen',
        count: ownEvents.length,
      });

      // Admin: Vorlagen (inkl. Vorschläge)
      const templates = events.filter(e => e.is_template || e.is_template_suggestion);
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
      // Teamleiter: Eigene Veranstaltungen (FIRST)
      const ownEvents = events.filter(e => !e.is_template && !e.is_template_suggestion && e.created_by === user?.id);
      tabs.push({
        id: 'own',
        label: 'Eigene Veranstaltungen',
        count: ownEvents.length,
      });

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
      return events.filter(e => !e.is_template && !e.is_template_suggestion && e.created_by === user?.id);
    }

    if (tabId === 'templates') {
      if (isTeamleiter) {
        // Teamleiter sehen nur echte Vorlagen
        return events.filter(e => e.is_template);
      } else {
        // Admin sieht Vorlagen und Vorschläge
        return events.filter(e => e.is_template || e.is_template_suggestion);
      }
    }

    if (tabId === 'other-teamleiters') {
      return events.filter(e => !e.is_template && !e.is_template_suggestion && e.created_by !== user?.id);
    }

    return [];
  };

  const renderEventCard = (event: Event) => {
    const isCreator = event.created_by === user?.id;
    const canEdit = isAdmin || (isTeamleiter && isCreator && !event.is_template);

    return (
      <div key={event.id} style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.eventName}>{event.name}</h3>
          <div style={styles.badges}>
            {event.is_template && <span style={styles.templateBadge}>Vorlage</span>}
            {event.is_template_suggestion && <span style={styles.suggestionBadge}>Vorgeschlagen</span>}
          </div>
        </div>
        {event.description && <p style={styles.eventDescription}>{event.description}</p>}
        {event.start_date && (
          <div style={styles.eventMeta}>
            <span>Start: {new Date(event.start_date).toLocaleDateString('de-DE')}</span>
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
          {/* Teamleiter: "Vorlage verwenden" Button bei Vorlagen */}
          {isTeamleiter && event.is_template && (
            <button onClick={() => setSelectedTemplateId(event.id)} style={styles.useTemplateButton}>
              Vorlage verwenden
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditingEvent(event)} style={styles.editButton}>
              Bearbeiten
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
  const currentEvents = getEventsForTab(activeTab);

  return (
    <div>
      <div style={styles.header} className={responsiveStyles.header}>
        <h2 style={styles.title}>Veranstaltungen</h2>
        <div style={styles.headerButtons}>
          {tabs.some(t => t.id === 'templates' && t.count > 0) && (
            <button
              onClick={() => setShowTemplateModal(true)}
              style={styles.templateButton}
              className={responsiveStyles.createButton}
            >
              📋 Vorlage verwenden
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            style={styles.createButton}
            className={responsiveStyles.createButton}
          >
            + Neue Veranstaltung
          </button>
        </div>
      </div>

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

      {/* Events Grid or Grouped List */}
      {currentEvents.length === 0 ? (
        <div style={styles.empty}>Keine Veranstaltungen in dieser Kategorie</div>
      ) : activeTab === 'other-teamleiters' ? (
        // Grouped by Teamleiter
        <div>
          {teamleiters
            .filter(tl => currentEvents.some(e => e.created_by === tl.id))
            .map(teamleiter => {
              const teamleiterEvents = currentEvents.filter(e => e.created_by === teamleiter.id);
              return (
                <div key={teamleiter.id} style={styles.teamleiterGroup}>
                  <h3 style={styles.teamleiterHeader}>{teamleiter.name}</h3>
                  <div style={styles.grid} className={responsiveStyles.grid}>
                    {teamleiterEvents.map(renderEventCard)}
                  </div>
                </div>
              );
            })}
        </div>
      ) : activeTab === 'templates' && isAdmin ? (
        // Templates: separate actual templates and suggestions
        <div>
          {events.filter(e => e.is_template).length > 0 && (
            <div style={styles.templateSection}>
              <h3 style={styles.sectionHeader}>Vorlagen</h3>
              <div style={styles.grid} className={responsiveStyles.grid}>
                {events.filter(e => e.is_template).map(renderEventCard)}
              </div>
            </div>
          )}
          {events.filter(e => e.is_template_suggestion).length > 0 && (
            <div style={styles.templateSection}>
              <h3 style={styles.sectionHeader}>Vorschläge</h3>
              <div style={styles.grid} className={responsiveStyles.grid}>
                {events.filter(e => e.is_template_suggestion).map(renderEventCard)}
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
  headerButtons: {
    display: 'flex',
    gap: '0.75rem',
  },
  createButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  templateButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  tabsContainerDesktop: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    borderBottom: '2px solid #e5e7eb',
    overflowX: 'auto',
    paddingBottom: '0.5rem',
  },
  tabsContainerMobile: {
    display: 'none',
    marginBottom: '1.5rem',
  },
  tabSelect: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    border: '2px solid #e5e7eb',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  },
  activeTab: {
    color: '#4f46e5',
    borderBottomColor: '#4f46e5',
    fontWeight: '600',
  },
  tabCount: {
    color: 'inherit',
    fontSize: '0.85rem',
    opacity: 0.7,
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: '#6b7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem',
  },
  card: {
    padding: '1.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.5rem',
  },
  eventName: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    flex: 1,
  },
  badges: {
    display: 'flex',
    gap: '0.25rem',
  },
  templateBadge: {
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '500',
  },
  suggestionBadge: {
    backgroundColor: '#f59e0b',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '500',
  },
  eventDescription: {
    color: '#6b7280',
    fontSize: '0.875rem',
    margin: '0 0 1rem 0',
  },
  eventMeta: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '0.5rem',
  },
  creatorInfo: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginBottom: '1rem',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  viewButton: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  editButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  templateButton2: {
    padding: '0.5rem 1rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  suggestButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  approveButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  useTemplateButton: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  teamleiterGroup: {
    marginBottom: '2rem',
  },
  teamleiterHeader: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '2px solid #e5e7eb',
  },
  templateSection: {
    marginBottom: '2rem',
  },
  sectionHeader: {
    fontSize: '1.1rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#4b5563',
  },
};
