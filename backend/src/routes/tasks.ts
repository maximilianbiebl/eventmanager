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

// Alle eigenen Aufgaben abrufen (zugewiesene + öffentliche)
router.get('/my-tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Zugewiesene Aufgaben
    const assignedTasks = await query(
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

    // Öffentliche Aufgaben für Events in denen der User Mitarbeiter ist
    const publicTasks = await query(
      `SELECT DISTINCT
        t.*,
        false as completed,
        null as completed_at,
        null::integer as assignment_id,
        ei.id as event_instance_id,
        t.reminder_minutes,
        e.name as event_name,
        ei.start_date as instance_start_date,
        ei.instance_number,
        pi.title as program_item_title
       FROM tasks t
       JOIN events e ON t.event_id = e.id
       JOIN event_instances ei ON ei.event_id = e.id
       JOIN event_staff es ON es.event_id = e.id
       LEFT JOIN program_items pi ON t.program_item_id = pi.id
       WHERE es.user_id = $1
         AND t.is_public = true
         AND ei.start_date >= CURRENT_DATE - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM task_assignments ta2
           WHERE ta2.task_id = t.id AND ta2.user_id = $1 AND ta2.event_instance_id = ei.id
         )
       ORDER BY ei.start_date, t.day_number, t.scheduled_time`,
      [userId]
    );

    // Kombiniere beide Listen
    const allTasks = [...assignedTasks.rows, ...publicTasks.rows];

    // Sortiere nach Datum und Tag
    allTasks.sort((a, b) => {
      const dateCompare = new Date(a.instance_start_date).getTime() - new Date(b.instance_start_date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.day_number - b.day_number;
    });

    res.json(allTasks);
  } catch (error) {
    console.error('Get all my tasks error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Alle Aufgaben-Zuweisungen für einen User in einem Event (für Admin)
router.get('/event/:eventId/user/:userId/assignments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    const result = await query(
      `SELECT
        t.id,
        t.title,
        t.status,
        t.day_number,
        ta.id as assignment_id,
        e.name as event_name,
        ei.instance_number
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       JOIN events e ON t.event_id = e.id
       JOIN event_instances ei ON ta.event_instance_id = ei.id
       WHERE t.event_id = $1 AND ta.user_id = $2
       ORDER BY ei.instance_number, t.day_number, t.start_time, t.scheduled_time`,
      [eventId, userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get user assignments for event error:', error);
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

    // Hole aktuelle Zuweisungen
    const current = await query(
      'SELECT user_id FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2',
      [task_id, event_instance_id]
    );
    const currentUserIds = current.rows.map(r => r.user_id);

    // Entferne Zuweisungen die nicht mehr in der Liste sind
    const toRemove = currentUserIds.filter(id => !user_ids.includes(id));
    if (toRemove.length > 0) {
      await query(
        'DELETE FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = ANY($3)',
        [task_id, event_instance_id, toRemove]
      );
    }

    const assignments = [];

    // Füge neue Zuweisungen hinzu (wenn user_ids nicht leer ist)
    for (const user_id of (user_ids || [])) {
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
      } else {
        assignments.push(existing.rows[0]);
      }
    }

    res.status(201).json(assignments);
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Einzelne Zuweisung entfernen
router.delete('/assignment/:assignmentId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const result = await query(
      'DELETE FROM task_assignments WHERE id = $1 RETURNING *',
      [assignmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    res.json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    console.error('Delete assignment error:', error);
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

// Öffentliche Aufgabe als erledigt markieren (ohne Assignment)
router.put('/:taskId/complete-public', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user!.id;

    // Task-Informationen laden
    const taskInfo = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }
    const task = taskInfo.rows[0];

    // Prüfen ob Task öffentlich ist und User im Event-Pool
    if (!task.is_public) {
      return res.status(403).json({ error: 'Diese Aufgabe ist nicht öffentlich' });
    }

    const inPool = await query(
      'SELECT * FROM event_staff WHERE event_id = $1 AND user_id = $2',
      [task.event_id, userId]
    );
    if (inPool.rows.length === 0) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Aufgabe' });
    }

    // Task als completed markieren
    await query('UPDATE tasks SET status = $1 WHERE id = $2', ['completed', taskId]);

    res.json({ success: true, taskId: parseInt(taskId) });
  } catch (error) {
    console.error('Complete public task error:', error);
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

// Task-Status ändern (für Mitarbeiter - nur in_progress erlaubt)
router.put('/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user!.id;

    // Prüfen ob der Benutzer Admin ist oder der Task zugewiesen ist
    const isAdmin = req.user!.role === 'admin';

    // Hole Task-Informationen
    const taskInfo = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }
    const task = taskInfo.rows[0];

    if (!isAdmin) {
      // Prüfen ob der Task dem Mitarbeiter zugewiesen ist ODER öffentlich und User im Event-Pool
      if (task.is_public) {
        // Bei öffentlichen Aufgaben: Prüfen ob User im Event-Pool ist
        const inPool = await query(
          'SELECT * FROM event_staff WHERE event_id = $1 AND user_id = $2',
          [task.event_id, userId]
        );
        if (inPool.rows.length === 0) {
          return res.status(403).json({ error: 'Keine Berechtigung für diese Aufgabe' });
        }
      } else {
        // Bei privaten Aufgaben: Prüfen ob zugewiesen
        const assignment = await query(
          'SELECT ta.* FROM task_assignments ta WHERE ta.task_id = $1 AND ta.user_id = $2',
          [id, userId]
        );
        if (assignment.rows.length === 0) {
          return res.status(403).json({ error: 'Keine Berechtigung für diese Aufgabe' });
        }
      }

      // Mitarbeiter dürfen nur auf 'in_progress' setzen
      if (status !== 'in_progress') {
        return res.status(403).json({ error: 'Mitarbeiter können den Status nur auf "In Arbeit" setzen' });
      }
    }

    // Hole aktuelle Aufgabe für Benachrichtigungen
    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    const currentTask = current.rows[0];

    // Status aktualisieren
    const result = await query(
      'UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    // Wenn Status von completed weg geändert wird, alle Assignments zurücksetzen
    if (currentTask.status === 'completed' && status !== 'completed') {
      await query(
        'UPDATE task_assignments SET completed = false, completed_at = null WHERE task_id = $1',
        [id]
      );
      console.log(`Reset completed status for all assignments of task ${id}`);
    }

    // Wenn Status geändert wurde, sende Push-Benachrichtigungen (nur für Admin-Änderungen)
    if (isAdmin && status !== currentTask.status) {
      try {
        let recipients;

        // Bei öffentlichen Aufgaben: Alle Mitarbeiter im Event-Pool benachrichtigen
        if (currentTask.is_public) {
          recipients = await query(
            `SELECT DISTINCT u.id, ps.endpoint, ps.keys
             FROM users u
             JOIN push_subscriptions ps ON ps.user_id = u.id
             JOIN event_staff es ON es.user_id = u.id
             WHERE es.event_id = $1 AND u.push_enabled = true AND u.role = 'staff'`,
            [currentTask.event_id]
          );
        } else {
          // Bei privaten Aufgaben: Nur zugewiesene Mitarbeiter benachrichtigen
          recipients = await query(
            `SELECT DISTINCT u.id, ps.endpoint, ps.keys
             FROM task_assignments ta
             JOIN users u ON ta.user_id = u.id
             JOIN push_subscriptions ps ON ps.user_id = u.id
             WHERE ta.task_id = $1 AND u.push_enabled = true`,
            [id]
          );
        }

        const webpush = require('web-push');
        const statusLabels: { [key: string]: string } = {
          not_started: 'Nicht gestartet',
          in_progress: 'In Arbeit',
          completed: 'Erledigt',
          overdue: 'Überfällig',
        };

        const payload = JSON.stringify({
          title: currentTask.is_public ? 'Öffentliche Aufgabe aktualisiert' : 'Aufgaben-Status geändert',
          body: `"${currentTask.title}" ist jetzt: ${statusLabels[status] || status}`,
          icon: '/icon.svg',
          badge: '/badge.svg',
        });

        for (const sub of recipients.rows) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: sub.keys,
              },
              payload
            );
          } catch (pushError) {
            console.error('Send push notification error:', pushError);
          }
        }
      } catch (notifError) {
        console.error('Push notification error:', notifError);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update status error:', error);
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

    // Wenn Status von completed weg geändert wird, alle Assignments zurücksetzen
    if (currentTask.status === 'completed' && status !== 'completed') {
      await query(
        'UPDATE task_assignments SET completed = false, completed_at = null WHERE task_id = $1',
        [id]
      );
      console.log(`Reset completed status for all assignments of task ${id}`);
    }

    // Wenn Status geändert wurde, sende Push-Benachrichtigungen
    if (status !== currentTask.status) {
      try {
        let recipients;

        // Bei öffentlichen Aufgaben: Alle Mitarbeiter im Event-Pool benachrichtigen
        if (is_public) {
          recipients = await query(
            `SELECT DISTINCT u.id, ps.endpoint, ps.keys
             FROM users u
             JOIN push_subscriptions ps ON ps.user_id = u.id
             JOIN event_staff es ON es.user_id = u.id
             WHERE es.event_id = $1 AND u.push_enabled = true AND u.role = 'staff'`,
            [currentTask.event_id]
          );
        } else {
          // Bei privaten Aufgaben: Nur zugewiesene Mitarbeiter benachrichtigen
          recipients = await query(
            `SELECT DISTINCT u.id, ps.endpoint, ps.keys
             FROM task_assignments ta
             JOIN users u ON ta.user_id = u.id
             JOIN push_subscriptions ps ON ps.user_id = u.id
             WHERE ta.task_id = $1 AND u.push_enabled = true`,
            [id]
          );
        }

        // Sende Benachrichtigungen
        const webpush = require('web-push');
        const statusLabels: { [key: string]: string } = {
          not_started: 'Nicht gestartet',
          in_progress: 'In Arbeit',
          completed: 'Erledigt',
          overdue: 'Überfällig',
        };

        const payload = JSON.stringify({
          title: is_public ? 'Öffentliche Aufgabe aktualisiert' : 'Aufgaben-Status geändert',
          body: `"${title}" ist jetzt: ${statusLabels[status] || status}`,
          icon: '/icon.svg',
          badge: '/badge.svg',
        });

        for (const sub of recipients.rows) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: sub.keys,
              },
              payload
            );
          } catch (pushError) {
            console.error('Send push notification error:', pushError);
          }
        }
      } catch (notifError) {
        console.error('Push notification error:', notifError);
        // Fehler beim Senden von Benachrichtigungen sollte die Task-Aktualisierung nicht blockieren
      }
    }

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
