import React, { useState, useEffect } from 'react';
import { eventsApi, Event } from '../../api/events';
import { CreateEventModal } from './CreateEventModal';
import { EventDetail } from './EventDetail';
import responsiveStyles from './EventsList.module.css';

export const EventsList: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(() => {
    // Load selected event from localStorage
    const saved = localStorage.getItem('adminSelectedEventId');
    return saved ? parseInt(saved, 10) : null;
  });

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    // Save selected event to localStorage
    if (selectedEventId !== null) {
      localStorage.setItem('adminSelectedEventId', selectedEventId.toString());
    } else {
      localStorage.removeItem('adminSelectedEventId');
    }
  }, [selectedEventId]);

  const loadEvents = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const data = await eventsApi.getAll();
      setEvents(data);
    } catch (error) {
      console.error('Load events error:', error);
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
      await loadEvents(false); // Reload without showing loading indicator
    } catch (error) {
      console.error('Delete event error:', error);
      alert('Fehler beim Löschen');
    }
  };

  if (selectedEventId) {
    return <EventDetail eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />;
  }

  if (loading) {
    return <div>Lade Veranstaltungen...</div>;
  }

  return (
    <div>
      <div style={styles.header} className={responsiveStyles.header}>
        <h2 style={styles.title}>Veranstaltungen</h2>
        <button onClick={() => setShowCreateModal(true)} style={styles.createButton} className={responsiveStyles.createButton}>
          + Neue Veranstaltung
        </button>
      </div>

      {events.length === 0 ? (
        <div style={styles.empty}>Keine Veranstaltungen vorhanden</div>
      ) : (
        <div style={styles.grid} className={responsiveStyles.grid}>
          {events.map((event) => (
            <div key={event.id} style={styles.card}>
              <h3 style={styles.eventName}>{event.name}</h3>
              {event.description && <p style={styles.eventDescription}>{event.description}</p>}
              <div style={styles.eventMeta}>
                <span>Start: {new Date(event.start_date).toLocaleDateString('de-DE')}</span>
                <span>{event.days} Tage</span>
              </div>
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
      )}

      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadEvents(false); // Reload without showing loading indicator
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
  createButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#10b981',
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
  eventName: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
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
