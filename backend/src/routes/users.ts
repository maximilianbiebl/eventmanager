import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcrypt';

const router = Router();

// Alle Benutzer abrufen
router.get('/', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT id, name, role, created_at FROM users ORDER BY name');

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Benutzer aktualisieren
router.put('/:id', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, password, role } = req.body;

    // Teamleiter dürfen keine Admins erstellen oder bearbeiten
    if (req.user!.role === 'teamleiter' && role === 'admin') {
      return res.status(403).json({ error: 'Teamleiter können keine Admins erstellen oder bearbeiten' });
    }

    // Prüfen ob der zu bearbeitende User ein Admin ist
    const userCheck = await query('SELECT role FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length > 0 && userCheck.rows[0].role === 'admin' && req.user!.role === 'teamleiter') {
      return res.status(403).json({ error: 'Teamleiter können keine Admins bearbeiten' });
    }

    let updateQuery = 'UPDATE users SET name = $1, role = $2';
    let params: any[] = [name, role];

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateQuery += ', password_hash = $3 WHERE id = $4 RETURNING id, name, role';
      params.push(passwordHash, id);
    } else {
      updateQuery += ' WHERE id = $3 RETURNING id, name, role';
      params.push(id);
    }

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Benutzer löschen
router.delete('/:id', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Prüfen welche Rolle der zu löschende User hat
    const userCheck = await query('SELECT role FROM users WHERE id = $1', [id]);

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const targetRole = userCheck.rows[0].role;

    // Teamleiter dürfen keine Admins oder andere Teamleiter löschen
    if (req.user!.role === 'teamleiter' && (targetRole === 'admin' || targetRole === 'teamleiter')) {
      return res.status(403).json({ error: 'Teamleiter können nur Staff-Mitarbeiter löschen' });
    }

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    res.json({ message: 'Benutzer gelöscht' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Mitarbeiter zum Event-Pool hinzufügen (für alle Instanzen verfügbar)
router.post('/event/:eventId/staff', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { user_ids } = req.body;

    const assignments = [];

    for (const user_id of user_ids) {
      // Prüfen ob bereits im Pool
      const existing = await query(
        'SELECT * FROM event_staff WHERE event_id = $1 AND user_id = $2',
        [eventId, user_id]
      );

      if (existing.rows.length === 0) {
        const result = await query(
          'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) RETURNING *',
          [eventId, user_id]
        );
        assignments.push(result.rows[0]);
      }
    }

    res.status(201).json(assignments);
  } catch (error) {
    console.error('Assign event staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Mitarbeiter-Pool für Event abrufen
router.get('/event/:eventId/staff', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `SELECT u.id, u.name, u.role, es.created_at as assigned_at
       FROM event_staff es
       JOIN users u ON es.user_id = u.id
       WHERE es.event_id = $1
       ORDER BY u.name`,
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get event staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Mitarbeiter aus Event-Pool entfernen
router.delete('/event/:eventId/staff/:userId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    const result = await query(
      'DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2 RETURNING *',
      [eventId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    res.json({ message: 'Mitarbeiter entfernt' });
  } catch (error) {
    console.error('Remove event staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Eigene Einstellungen abrufen
router.get('/me/settings', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      'SELECT default_reminder_minutes, push_enabled, default_view, start_notification_enabled FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Eigene Einstellungen aktualisieren
router.put('/me/settings', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const { default_reminder_minutes, push_enabled, default_view, start_notification_enabled } = req.body;

    const result = await query(
      `UPDATE users
       SET default_reminder_minutes = $1, push_enabled = $2, default_view = $3, start_notification_enabled = $4
       WHERE id = $5
       RETURNING default_reminder_minutes, push_enabled, default_view, start_notification_enabled`,
      [default_reminder_minutes, push_enabled, default_view, start_notification_enabled, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Mitarbeiter zu Event-Instanz hinzufügen
router.post('/instance/:instanceId/staff', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { user_ids } = req.body;

    const assignments = [];

    for (const user_id of user_ids) {
      // Prüfen ob bereits zugewiesen
      const existing = await query(
        'SELECT * FROM event_instance_staff WHERE event_instance_id = $1 AND user_id = $2',
        [instanceId, user_id]
      );

      if (existing.rows.length === 0) {
        const result = await query(
          'INSERT INTO event_instance_staff (event_instance_id, user_id) VALUES ($1, $2) RETURNING *',
          [instanceId, user_id]
        );
        assignments.push(result.rows[0]);
      }
    }

    res.status(201).json(assignments);
  } catch (error) {
    console.error('Assign staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Mitarbeiter für Event-Instanz abrufen
router.get('/instance/:instanceId/staff', authMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;

    const result = await query(
      `SELECT u.id, u.name, u.role, eis.created_at as assigned_at
       FROM event_instance_staff eis
       JOIN users u ON eis.user_id = u.id
       WHERE eis.event_instance_id = $1
       ORDER BY u.name`,
      [instanceId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get instance staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Mitarbeiter von Event-Instanz entfernen
router.delete('/instance/:instanceId/staff/:userId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { instanceId, userId } = req.params;

    const result = await query(
      'DELETE FROM event_instance_staff WHERE event_instance_id = $1 AND user_id = $2 RETURNING *',
      [instanceId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    res.json({ message: 'Mitarbeiter entfernt' });
  } catch (error) {
    console.error('Remove staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
