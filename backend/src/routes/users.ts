import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { broadcastUpdate } from './sse';
import bcrypt from 'bcrypt';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

    /*
     * Teamleiter duerfen nur Mitarbeiter verwalten - weder Admins noch andere
     * Teamleiter. Beim Loeschen war das schon so, beim Bearbeiten fehlte die
     * Sperre fuer andere Teamleiter: darueber liess sich deren Passwort
     * aendern und damit ihr Konto uebernehmen.
     *
     * Die eigene Zeile bleibt erlaubt, damit ein Teamleiter seinen eigenen
     * Namen aendern kann.
     */
    const userCheck = await query('SELECT role FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    const targetRole = userCheck.rows[0].role;

    if (req.user!.role === 'teamleiter') {
      const isSelf = Number(id) === req.user!.id;

      if (!isSelf && targetRole !== 'staff') {
        return res.status(403).json({ error: 'Teamleiter können nur Mitarbeiter bearbeiten' });
      }
      if (!isSelf && role !== 'staff') {
        return res.status(403).json({ error: 'Teamleiter können niemanden zum Admin oder Teamleiter machen' });
      }
      // Die eigene Zeile darf bearbeitet werden, die eigene Rolle nicht
      if (isSelf && role !== targetRole) {
        return res.status(403).json({ error: 'Die eigene Rolle kann nicht geändert werden' });
      }
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
/*
 * Mitarbeiter aus dem Event-Pool entfernen.
 *
 * Bisher wurde nur die Zeile in event_staff geloescht. Die Aufgaben des
 * Mitarbeiters haengen aber an task_assignments - die blieben stehen, und
 * damit sah der Mitarbeiter die Veranstaltung samt Aufgaben weiter in
 * seiner Ansicht. Aus dem Pool entfernt zu sein und die Aufgaben trotzdem
 * zu behalten ist kein sinnvoller Zustand.
 *
 * Optional kann per ?reassign_to=<userId> ein Nachfolger benannt werden -
 * dann wandern die Zuweisungen dorthin, statt geloescht zu werden.
 */
router.delete('/event/:eventId/staff/:userId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { eventId, userId } = req.params;
    const reassignTo = req.query.reassign_to ? Number(req.query.reassign_to) : null;

    if (reassignTo !== null && (!Number.isInteger(reassignTo) || reassignTo === Number(userId))) {
      return res.status(400).json({ error: 'Ungültiger Nachfolger' });
    }

    const result = await query(
      'DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2 RETURNING *',
      [eventId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    // Zuweisungen dieses Mitarbeiters in dieser Veranstaltung
    const assignments = await query(
      `SELECT ta.id, ta.task_id, ta.event_instance_id, ta.reminder_minutes
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       WHERE t.event_id = $1 AND ta.user_id = $2`,
      [eventId, userId]
    );

    let moved = 0;

    if (reassignTo !== null) {
      for (const a of assignments.rows) {
        // Doppelte Zuweisung vermeiden, falls der Nachfolger die Aufgabe schon hat
        const existing = await query(
          'SELECT id FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
          [a.task_id, a.event_instance_id, reassignTo]
        );

        if (existing.rows.length === 0) {
          await query(
            'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4)',
            [a.task_id, a.event_instance_id, reassignTo, a.reminder_minutes]
          );
          moved++;
        }

        await query('DELETE FROM task_assignments WHERE id = $1', [a.id]);
      }

      // Der Nachfolger muss im Pool sein, sonst sieht er oeffentliche
      // Aufgaben der Veranstaltung nicht.
      await query(
        `INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [eventId, reassignTo]
      );
    } else if (assignments.rows.length > 0) {
      await query(
        'DELETE FROM task_assignments WHERE id = ANY($1)',
        [assignments.rows.map((a: any) => a.id)]
      );
    }

    // Auch aus den Durchfuehrungs-Pools nehmen
    await query(
      `DELETE FROM event_instance_staff
       WHERE user_id = $1
         AND event_instance_id IN (SELECT id FROM event_instances WHERE event_id = $2)`,
      [userId, eventId]
    );

    // Damit die Ansicht des betroffenen Mitarbeiters sofort nachzieht
    broadcastUpdate('task', {
      action: 'staff_removed',
      eventId: Number(eventId),
      userId: Number(userId),
      reassignedTo: reassignTo,
    });

    res.json({
      message: 'Mitarbeiter entfernt',
      removedAssignments: reassignTo === null ? assignments.rows.length : 0,
      reassignedAssignments: moved,
    });
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

// Bulk Delete
router.post('/bulk-delete', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Keine IDs angegeben' });
    }

    // Check permissions for each user
    for (const id of ids) {
      const userCheck = await query('SELECT role FROM users WHERE id = $1', [id]);
      if (userCheck.rows.length === 0) continue;

      const targetRole = userCheck.rows[0].role;

      // Teamleiter dürfen keine Admins oder andere Teamleiter löschen
      if (req.user!.role === 'teamleiter' && (targetRole === 'admin' || targetRole === 'teamleiter')) {
        return res.status(403).json({ error: 'Teamleiter können nur Staff-Mitarbeiter löschen' });
      }
    }

    // Delete all users
    await query('DELETE FROM users WHERE id = ANY($1)', [ids]);

    res.json({ message: `${ids.length} Benutzer gelöscht`, deleted: ids.length });
  } catch (error) {
    console.error('Bulk delete users error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// CSV Export
router.post('/export-csv', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;

    let result;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      result = await query('SELECT id, name, role FROM users WHERE id = ANY($1) ORDER BY name', [ids]);
    } else {
      result = await query('SELECT id, name, role FROM users ORDER BY name');
    }

    // Create CSV
    const headers = ['id', 'name', 'role'];
    const rows = result.rows.map(row => `${row.id},${row.name},${row.role}`);
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// CSV Import
router.post('/import-csv', authMiddleware, teamleiterOrAdminMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV ist leer oder ungültig' });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const user: any = {};
      headers.forEach((header, idx) => {
        user[header] = values[idx];
      });

      // Teamleiter dürfen keine Admins erstellen
      // Wie beim Anlegen ueber die Oberflaeche: Teamleiter nur Mitarbeiter
      if (req.user!.role === 'teamleiter' && user.role && user.role !== 'staff') {
        continue; // Skip admin users
      }

      // Check if user already exists by name
      const existing = await query('SELECT id FROM users WHERE name = $1', [user.name]);

      if (existing.rows.length === 0) {
        // Create new user with default password
        const defaultPassword = await bcrypt.hash('1234', 10);
        await query(
          'INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3)',
          [user.name, user.role || 'staff', defaultPassword]
        );
        imported++;
      }
    }

    res.json({ message: `${imported} Benutzer importiert`, imported });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
