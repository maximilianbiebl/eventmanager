import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// Programmpunkte für ein Event abrufen
router.get('/event/:eventId', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      'SELECT * FROM program_items WHERE event_id = $1 ORDER BY day_number, time',
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get program items error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Programmpunkt erstellen
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { event_id, day_number, time, title, description } = req.body;

    const result = await query(
      'INSERT INTO program_items (event_id, day_number, time, title, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [event_id, day_number, time, title, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create program item error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Programmpunkt aktualisieren
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { day_number, time, title, description } = req.body;

    const result = await query(
      'UPDATE program_items SET day_number = $1, time = $2, title = $3, description = $4 WHERE id = $5 RETURNING *',
      [day_number, time, title, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Programmpunkt nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update program item error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Programmpunkt löschen
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM program_items WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Programmpunkt nicht gefunden' });
    }

    res.json({ message: 'Programmpunkt gelöscht' });
  } catch (error) {
    console.error('Delete program item error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
