import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { broadcastUpdate } from './sse';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
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

    // Der Name ist der Anmeldename und seit Migration 016 eindeutig. Ohne
    // diese Pruefung kaeme hier ein nackter 500er aus der Datenbank.
    if (name) {
      const nameTaken = await query('SELECT id FROM users WHERE name = $1 AND id <> $2', [name, id]);
      if (nameTaken.rows.length > 0) {
        return res.status(400).json({ error: 'Dieser Name ist bereits vergeben' });
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

    /*
     * Felder mit Komma, Anfuehrungszeichen oder Zeilenumbruch muessen
     * gequotet werden - sonst zerlegt ein Name wie "Mustermann, Max" beim
     * naechsten Import die Zeile. Passwoerter kommen hier nie vor,
     * gespeichert sind nur Hashes.
     */
    const csvField = (value: any): string => {
      const s = String(value ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = ['id', 'name', 'role'];
    const rows = result.rows.map(row => [row.id, row.name, row.role].map(csvField).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

/*
 * CSV-Parser fuer eine Zeile - beachtet Anfuehrungszeichen.
 *
 * Vorher wurde stumpf an jedem Komma getrennt. Ein Name wie
 * "Mustermann, Max" hat die Zeile damit still zerlegt und die Rolle in die
 * Namensspalte geschoben. Namen mit Leerzeichen ("Max Mustermann") waren
 * nie ein Problem, Namen mit Komma schon.
 */
const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }  // "" = ein Anfuehrungszeichen
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
};

/*
 * Zufaelliges Startpasswort. Ohne mehrdeutige Zeichen (0/O, 1/l/I), damit
 * es sich vorlesen und abtippen laesst.
 */
const generatePassword = (): string => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
};

const MIN_PASSWORD_LENGTH = 6;

/*
 * Rollen aus der CSV. Die Oberflaeche ist durchgehend deutsch, also nimmt
 * der Import auch die deutschen Bezeichnungen an.
 *
 * Wichtig ist die Pruefung an sich: users.role ist nur ein VARCHAR ohne
 * Einschraenkung. Ein "Mitarbeiter" in der Spalte haette bisher ein Konto
 * mit der Rolle "Mitarbeiter" angelegt - die passt zu keiner Rechtepruefung,
 * das Konto waere weder Admin noch Teamleiter noch Mitarbeiter gewesen.
 */
const ROLE_ALIASES: { [key: string]: string } = {
  '': 'staff',
  staff: 'staff',
  mitarbeiter: 'staff',
  teamleiter: 'teamleiter',
  teamleader: 'teamleiter',
  admin: 'admin',
  administrator: 'admin',
};

// CSV Import
router.post('/import-csv', authMiddleware, teamleiterOrAdminMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    // BOM entfernen (Excel schreibt eines) und CRLF wie LF behandeln
    const csvText = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV ist leer oder ungültig' });
    }

    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    let imported = 0;
    let skipped = 0;
    const rejected: { name: string; reason: string }[] = [];
    // Einmalige Ausgabe an den Aufrufer - wird nirgends gespeichert
    const credentials: { name: string; password: string; generated: boolean }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const user: any = {};
      headers.forEach((header, idx) => {
        user[header] = values[idx];
      });

      const name = (user.name || '').trim();
      if (!name) {
        rejected.push({ name: `Zeile ${i + 1}`, reason: 'Kein Name angegeben' });
        continue;
      }

      const rawRole = (user.role || '').trim().toLowerCase();
      const role = ROLE_ALIASES[rawRole];
      if (!role) {
        rejected.push({ name, reason: `Unbekannte Rolle "${user.role}"` });
        continue;
      }

      // Wie beim Anlegen ueber die Oberflaeche: Teamleiter nur Mitarbeiter
      if (req.user!.role === 'teamleiter' && role !== 'staff') {
        rejected.push({ name, reason: 'Teamleiter können nur Mitarbeiter anlegen' });
        continue;
      }

      // Bestehende Namen bleiben unberuehrt - ein Import darf niemandem das
      // Passwort ueberschreiben und damit den Zugang entziehen.
      const existing = await query('SELECT id FROM users WHERE name = $1', [name]);
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      const given = (user.password || '').trim();
      if (given && given.length < MIN_PASSWORD_LENGTH) {
        rejected.push({ name, reason: `Passwort zu kurz (mindestens ${MIN_PASSWORD_LENGTH} Zeichen)` });
        continue;
      }

      const password = given || generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);

      await query(
        'INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3)',
        [name, role, passwordHash]
      );

      credentials.push({ name, password, generated: !given });
      imported++;
    }

    res.json({
      message: `${imported} Benutzer importiert`,
      imported,
      skipped,
      rejected,
      credentials,
    });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
