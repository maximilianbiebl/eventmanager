import React, { useState, useEffect } from 'react';
import { eventsApi, Event } from '../../api/events';
import { usersApi, User } from '../../api/users';
import { CreateEventModal } from './CreateEventModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { EventDetail } from './EventDetail';
import { useAuth } from '../../context/AuthContext';
import responsiveStyles from './EventsList.module.css';

interface EventCategory {
  title: string;
  events: Event[];
}

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

      // Admin lädt auch alle Teamleiter für die Kategorien
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

  const handleDelete = async (id: number) => {
    if (!confirm('Veranstaltung wirklich löschen?')) return;

    try {
      await eventsApi.delete(id);
      await loadData(false);
    } catch (error) {
      console.error('Delete event error:', error);
      alert('Fehler beim Löschen');
    }
  };

  const getCategories = (): EventCategory[] => {
    const categories: EventCategory[] = [];

    // Vorlagen (für alle)
    const templates = events.filter(e => e.is_template);
    if (templates.length > 0) {
      categories.push({
        title: 'Vorlagen',
        events: templates,
      });
    }

    if (isAdmin) {
      // Admin: Eigene Veranstaltungen (keine Vorlagen)
      const ownEvents = events.filter(e => !e.is_template && e.created_by === user?.id);
      if (ownEvents.length > 0) {
        categories.push({
          title: 'Eigene Veranstaltungen',
          events: ownEvents,
        });
      }

      // Admin: Veranstaltungen pro Teamleiter
      teamleiters.forEach(teamleiter => {
        const teamleiterEvents = events.filter(
          e => !e.is_template && e.created_by === teamleiter.id
        );
        if (teamleiterEvents.length > 0) {
          categories.push({
            title: `Veranstaltungen von ${teamleiter.name}`,
            events: teamleiterEvents,
          });
        }
      });
    } else if (isTeamleiter) {
      // Teamleiter: Nur eigene Veranstaltungen (keine Vorlagen)
      const ownEvents = events.filter(e => !e.is_template && e.created_by === user?.id);
      if (ownEvents.length > 0) {
        categories.push({
          title: 'Eigene Veranstaltungen',
          events: ownEvents,
        });
      }
    }

    return categories;
  };

  if (selectedEventId) {
    return <EventDetail eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />;
  }

  if (loading) {
    return <div>Lade Veranstaltungen...</div>;
  }

  const categories = getCategories();

  return (
    <div>
      <div style={styles.header} className={responsiveStyles.header}>
        <h2 style={styles.title}>Veranstaltungen</h2>
        <div style={styles.headerButtons}>
          {categories.some(c => c.title === 'Vorlagen') && (
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

      {categories.length === 0 ? (
        <div style={styles.empty}>Keine Veranstaltungen vorhanden</div>
      ) : (
        <>
          {categories.map((category, idx) => (
            <div key={idx} style={styles.category}>
              <h3 style={styles.categoryTitle}>{category.title}</h3>
              <div style={styles.grid} className={responsiveStyles.grid}>
                {category.events.map((event) => (
                  <div key={event.id} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <h3 style={styles.eventName}>{event.name}</h3>
                      {event.is_template && <span style={styles.templateBadge}>Vorlage</span>}
                    </div>
                    {event.description && <p style={styles.eventDescription}>{event.description}</p>}
                    <div style={styles.eventMeta}>
                      <span>Start: {new Date(event.start_date).toLocaleDateString('de-DE')}</span>
                      <span>{event.days} Tage</span>
                    </div>
                    {event.creator_name && (
                      <div style={styles.creatorInfo}>Erstellt von: {event.creator_name}</div>
                    )}
                    <div style={styles.actions}>
                      <button onClick={() => setSelectedEventId(event.id)} style={styles.viewButton}>
                        Details
                      </button>
                      <button onClick={() => handleDelete(event.id)} style={styles.deleteButton}>
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
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
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: '#6b7280',
  },
  category: {
    marginBottom: '2rem',
  },
  categoryTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#374151',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0.5rem',
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
  templateBadge: {
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '500',
    marginLeft: '0.5rem',
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
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
