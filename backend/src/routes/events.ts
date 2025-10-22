import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { CreateEventRequest } from '../types';

const router = Router();

// Alle Events abrufen
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT e.*, u.name as creator_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.start_date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event mit Details abrufen
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Event Basis-Daten
    const eventResult = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const event = eventResult.rows[0];

    // Event Instanzen
    const instancesResult = await query(
      'SELECT * FROM event_instances WHERE event_id = $1 ORDER BY instance_number',
      [id]
    );

    // Programmpunkte
    const programResult = await query(
      'SELECT * FROM program_items WHERE event_id = $1 ORDER BY day_number, time',
      [id]
    );

    // Aufgaben
    const tasksResult = await query(
      'SELECT * FROM tasks WHERE event_id = $1 ORDER BY day_number, scheduled_time',
      [id]
    );

    res.json({
      ...event,
      instances: instancesResult.rows,
      program_items: programResult.rows,
      tasks: tasksResult.rows,
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event erstellen
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description, start_date, days, instance_count } = req.body as CreateEventRequest;

    // Event erstellen
    const eventResult = await query(
      'INSERT INTO events (name, description, start_date, days, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, start_date, days, req.user!.id]
    );

    const event = eventResult.rows[0];

    // Event Instanzen erstellen
    const instances = [];
    for (let i = 0; i < instance_count; i++) {
      const instanceStartDate = new Date(start_date);
      instanceStartDate.setDate(instanceStartDate.getDate() + i * days);

      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [event.id, i + 1, instanceStartDate.toISOString().split('T')[0]]
      );

      instances.push(instanceResult.rows[0]);
    }

    res.status(201).json({
      ...event,
      instances,
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event aktualisieren
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, start_date, days } = req.body;

    const result = await query(
      'UPDATE events SET name = $1, description = $2, start_date = $3, days = $4 WHERE id = $5 RETURNING *',
      [name, description, start_date, days, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event löschen
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM events WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    res.json({ message: 'Event gelöscht' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
