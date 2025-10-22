import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { CreateTaskRequest, AssignTaskRequest } from '../types';

const router = Router();

// Alle Aufgaben für ein Event abrufen
router.get('/event/:eventId', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `SELECT t.*, pi.title as program_item_title
       FROM tasks t
       LEFT JOIN program_items pi ON t.program_item_id = pi.id
       WHERE t.event_id = $1
       ORDER BY t.day_number, t.start_time, t.scheduled_time`,
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgaben mit Zuordnungen für Event-Instanz (für Admin-Tabelle)
router.get('/instance/:instanceId/assignments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;

    const result = await query(
      `SELECT
        t.*,
        ta.id as assignment_id,
        ta.user_id,
        ta.completed,
        ta.completed_at,
        ta.reminder_minutes as user_reminder_minutes,
        u.name as user_name,
        u.role as user_role,
        pi.title as program_item_title,
        e.name as event_name,
        ei.start_date as instance_start_date
       FROM tasks t
       LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.event_instance_id = $1
       LEFT JOIN users u ON ta.user_id = u.id
       LEFT JOIN program_items pi ON t.program_item_id = pi.id
       JOIN events e ON t.event_id = e.id
       JOIN event_instances ei ON ei.id = $1
       WHERE t.event_id = ei.event_id
       ORDER BY t.day_number, t.start_time, t.scheduled_time, u.name`,
      [instanceId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get instance assignments error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Alle Assignments für ein Event abrufen (für Admin)
router.get('/event/:eventId/all-assignments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `SELECT ta.user_id, ta.task_id, t.title as task_title
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       WHERE t.event_id = $1`,
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get event assignments error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Eigene Aufgaben abrufen (für Mitarbeiter)
router.get('/my-tasks/:instanceId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { instanceId } = req.params;
    const userId = req.user!.id;

    const result = await query(
      `SELECT
        t.*,
        ta.completed,
        ta.completed_at,
        ta.id as assignment_id,
        ta.reminder_minutes as assignment_reminder_minutes,
        COALESCE(ta.reminder_minutes, t.reminder_minutes) as reminder_minutes,
        e.name as event_name,
        ei.start_date as instance_start_date,
        pi.title as program_item_title
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       JOIN events e ON t.event_id = e.id
       JOIN event_instances ei ON ta.event_instance_id = ei.id
       LEFT JOIN program_items pi ON t.program_item_id = pi.id
       WHERE ta.event_instance_id = $1 AND ta.user_id = $2
       ORDER BY t.day_number, t.scheduled_time`,
      [instanceId, userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Alle eigenen Aufgaben abrufen
router.get('/my-tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT
        t.*,
        ta.completed,
        ta.completed_at,
        ta.id as assignment_id,
        ta.event_instance_id,
        ta.reminder_minutes as assignment_reminder_minutes,
        COALESCE(ta.reminder_minutes, t.reminder_minutes) as reminder_minutes,
        e.name as event_name,
        ei.start_date as instance_start_date,
        ei.instance_number,
        pi.title as program_item_title
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       JOIN events e ON t.event_id = e.id
       JOIN event_instances ei ON ta.event_instance_id = ei.id
       LEFT JOIN program_items pi ON t.program_item_id = pi.id
       WHERE ta.user_id = $1
       ORDER BY ei.start_date, t.day_number, t.scheduled_time`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all my tasks error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe erstellen
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      event_id,
      program_item_id,
      day_number,
      title,
      description,
      scheduled_time,
      start_time,
      end_time,
      reminder_minutes,
      is_public,
      status
    } = req.body;

    const result = await query(
      `INSERT INTO tasks (
        event_id, program_item_id, day_number, title, description,
        scheduled_time, start_time, end_time, reminder_minutes, is_public, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        event_id,
        program_item_id,
        day_number,
        title,
        description,
        scheduled_time || null,
        start_time || null,
        end_time || null,
        reminder_minutes || 15,
        is_public || false,
        status || 'not_started'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe zuweisen
router.post('/assign', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { task_id, event_instance_id, user_ids, reminder_minutes } = req.body;

    const assignments = [];

    for (const user_id of user_ids) {
      // Prüfen ob bereits zugewiesen
      const existing = await query(
        'SELECT * FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
        [task_id, event_instance_id, user_id]
      );

      if (existing.rows.length === 0) {
        const result = await query(
          'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4) RETURNING *',
          [task_id, event_instance_id, user_id, reminder_minutes || 15]
        );
        assignments.push(result.rows[0]);
      }
    }

    res.status(201).json(assignments);
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe als erledigt markieren
router.put('/complete/:assignmentId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { assignmentId } = req.params;
    const userId = req.user!.id;

    // Prüfen ob die Zuweisung dem Benutzer gehört
    const assignment = await query('SELECT * FROM task_assignments WHERE id = $1 AND user_id = $2', [
      assignmentId,
      userId,
    ]);

    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    // Assignment als erledigt markieren
    const result = await query(
      'UPDATE task_assignments SET completed = true, completed_at = NOW() WHERE id = $1 RETURNING *',
      [assignmentId]
    );

    // Task selbst als "completed" markieren (global für alle Mitarbeiter)
    await query(
      'UPDATE tasks SET status = $1 WHERE id = $2',
      ['completed', assignment.rows[0].task_id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Erinnerungszeit für Assignment aktualisieren
router.put('/assignment/:assignmentId/reminder', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { assignmentId } = req.params;
    const { reminder_minutes } = req.body;
    const userId = req.user!.id;

    // Prüfen ob die Zuweisung dem Benutzer gehört
    const assignment = await query('SELECT * FROM task_assignments WHERE id = $1 AND user_id = $2', [
      assignmentId,
      userId,
    ]);

    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    // Erinnerungszeit aktualisieren
    const result = await query(
      'UPDATE task_assignments SET reminder_minutes = $1 WHERE id = $2 RETURNING *',
      [reminder_minutes, assignmentId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe aktualisieren
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Hole aktuelle Aufgabe
    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    const currentTask = current.rows[0];

    // Merge mit neuen Daten (nur vorhandene Felder überschreiben)
    const {
      title = currentTask.title,
      description = currentTask.description,
      day_number = currentTask.day_number,
      scheduled_time = currentTask.scheduled_time,
      start_time = currentTask.start_time,
      end_time = currentTask.end_time,
      reminder_minutes = currentTask.reminder_minutes,
      is_public = currentTask.is_public,
      status = currentTask.status
    } = req.body;

    const result = await query(
      `UPDATE tasks SET
        title = $1,
        description = $2,
        day_number = $3,
        scheduled_time = $4,
        start_time = $5,
        end_time = $6,
        reminder_minutes = $7,
        is_public = $8,
        status = $9
       WHERE id = $10 RETURNING *`,
      [
        title,
        description,
        day_number,
        scheduled_time || null,
        start_time || null,
        end_time || null,
        reminder_minutes,
        is_public,
        status,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe löschen
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    res.json({ message: 'Aufgabe gelöscht' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabenstatus für Event-Instanz abrufen (für Admin)
router.get('/status/:instanceId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;

    const result = await query(
      `SELECT
        t.*,
        ta.id as assignment_id,
        ta.user_id,
        ta.completed,
        ta.completed_at,
        u.name as user_name
       FROM tasks t
       JOIN task_assignments ta ON t.id = ta.task_id
       JOIN users u ON ta.user_id = u.id
       WHERE ta.event_instance_id = $1
       ORDER BY t.day_number, t.scheduled_time, u.name`,
      [instanceId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get task status error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
