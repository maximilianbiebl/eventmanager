import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { CreateTaskRequest, AssignTaskRequest } from '../types';
import { broadcastUpdate } from './sse';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to format time without seconds (hh:mm)
function formatTime(time: string | null): string {
  if (!time) return '';
  // Remove seconds from time string (e.g., "14:30:00" -> "14:30")
  return time.substring(0, 5);
}

// Alle Aufgaben für ein Event abrufen
router.get('/event/:eventId', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { includeInactive } = req.query;

    // Standardmäßig nur aktive Tasks anzeigen, es sei denn includeInactive=true
    const whereClause = includeInactive === 'true'
      ? 't.event_id = $1'
      : 't.event_id = $1 AND (t.is_active IS NULL OR t.is_active = true)';

    const result = await query(
      `SELECT t.*, pi.title as program_item_title
       FROM tasks t
       LEFT JOIN program_items pi ON t.program_item_id = pi.id
       WHERE ${whereClause}
       ORDER BY t.day_number, t.sort_order, t.start_time, t.scheduled_time`,
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgaben mit Zuordnungen für Event-Instanz (für Admin-Tabelle)
router.get('/instance/:instanceId/assignments', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
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
       ORDER BY t.day_number, t.sort_order, u.name`,
      [instanceId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get instance assignments error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Alle Assignments für ein Event abrufen (für Admin)
router.get('/event/:eventId/all-assignments', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
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
         AND (t.is_active IS NULL OR t.is_active = true)
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
         AND (t.is_active IS NULL OR t.is_active = true)
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
         AND (t.is_active IS NULL OR t.is_active = true)
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
router.get('/event/:eventId/user/:userId/assignments', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
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
router.post('/', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
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
      status,
      series_id
    } = req.body;

    // Get all existing tasks for this event, sorted by day and time
    const existingTasks = await query(
      `SELECT id, day_number, scheduled_time, start_time, sort_order
       FROM tasks
       WHERE event_id = $1
       ORDER BY day_number,
                COALESCE(scheduled_time, start_time, '00:00') ASC`,
      [event_id]
    );

    // Determine the time for the new task (tasks without time get '00:00' = top of list)
    const newTaskTime = scheduled_time || start_time || '00:00';

    // Find the position where the new task should be inserted
    let insertPosition = -1;
    for (let i = 0; i < existingTasks.rows.length; i++) {
      const task = existingTasks.rows[i];
      const taskTime = task.scheduled_time || task.start_time || '00:00';

      // If the existing task is on a later day, or same day but later time, insert before it
      if (task.day_number > day_number ||
          (task.day_number === day_number && taskTime > newTaskTime)) {
        insertPosition = i;
        break;
      }
    }

    // Calculate new sort_order based on surrounding tasks
    let newSortOrder;
    if (insertPosition === -1) {
      // Insert at the end
      const lastTask = existingTasks.rows[existingTasks.rows.length - 1];
      newSortOrder = lastTask ? (lastTask.sort_order || 0) + 10 : 10;
    } else if (insertPosition === 0) {
      // Insert at the beginning
      const firstTask = existingTasks.rows[0];
      newSortOrder = firstTask ? Math.max(1, (firstTask.sort_order || 10) - 10) : 10;
    } else {
      // Insert in the middle - use average of surrounding tasks
      const taskBefore = existingTasks.rows[insertPosition - 1];
      const taskAfter = existingTasks.rows[insertPosition];
      const orderBefore = taskBefore.sort_order || 10;
      const orderAfter = taskAfter.sort_order || 20;

      // If there's a gap, use the middle
      if (orderAfter - orderBefore > 1) {
        newSortOrder = Math.floor((orderBefore + orderAfter) / 2);
      } else {
        // No gap - need to shift everything after
        newSortOrder = orderAfter;
        // Will shift later tasks in separate query
      }
    }

    // Insert the new task with calculated sort_order
    const result = await query(
      `INSERT INTO tasks (
        event_id, program_item_id, day_number, title, description,
        scheduled_time, start_time, end_time, reminder_minutes, is_public, status, sort_order, series_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
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
        status || 'not_started',
        newSortOrder,
        series_id || null
      ]
    );

    // Update sort_order of all tasks that come after the inserted position
    // Only shift if there was no gap
    if (insertPosition !== -1 && insertPosition > 0) {
      const taskAfter = existingTasks.rows[insertPosition];
      const taskBefore = existingTasks.rows[insertPosition - 1];
      const orderBefore = taskBefore.sort_order || 10;
      const orderAfter = taskAfter.sort_order || 20;

      if (orderAfter - orderBefore <= 1) {
        // No gap - shift everything after
        await query(
          `UPDATE tasks
           SET sort_order = sort_order + 10
           WHERE event_id = $1 AND sort_order >= $2 AND id != $3`,
          [event_id, newSortOrder, result.rows[0].id]
        );
      }
    }

    // Gehört die neue Aufgabe zu einer Serie, bekommen deren Mitglieder sie
    if (series_id) {
      await syncSeriesAssignments(series_id);
    }

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'create', task: result.rows[0] });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe zuweisen
router.post('/assign', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
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

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'assign', taskId: task_id, eventInstanceId: event_instance_id });

    res.status(201).json(assignments);
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Einzelne Zuweisung entfernen
router.delete('/assignment/:assignmentId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const result = await query(
      'DELETE FROM task_assignments WHERE id = $1 RETURNING *',
      [assignmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    // Broadcast update for live sync
    const deletedAssignment = result.rows[0];
    broadcastUpdate('task', { action: 'unassign', taskId: deletedAssignment.task_id, eventInstanceId: deletedAssignment.event_instance_id });

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

    // Benachrichtige Teamleiter über Fertigstellung (nur wenn staff)
    if (req.user!.role === 'staff') {
      try {
        const taskId = assignment.rows[0].task_id;
        const taskInfo = await query(
          'SELECT t.*, e.name as event_name FROM tasks t JOIN events e ON t.event_id = e.id WHERE t.id = $1',
          [taskId]
        );

        if (taskInfo.rows.length > 0) {
          const task = taskInfo.rows[0];
          const notificationTitle = 'Status wurde zu "Erledigt" geändert';
          const notificationBody = `${req.user!.name}: "${task.title}"`;

          // Finde alle Teamleiter des Events die Benachrichtigungen aktiviert haben
          const teamleiterResult = await query(
          `SELECT u.id, u.name, u.signal_account_number, u.signal_linked, u.teamleiter_status_notifications, et.is_primary
           FROM event_teamleiter et
           JOIN users u ON et.user_id = u.id
           WHERE et.event_id = $1 AND (u.teamleiter_status_notifications = true OR u.teamleiter_status_notifications IS NULL)
           ORDER BY et.is_primary DESC, et.id ASC`,
          [task.event_id]
        );

        if (teamleiterResult.rows.length > 0) {
          const teamleiterIds = teamleiterResult.rows.map(tl => tl.id);

          // 1. Web Push Benachrichtigungen an Teamleiter
          const webpush = require('web-push');
          const webPushRecipients = await query(
            `SELECT DISTINCT u.id, ps.endpoint, ps.keys_p256dh, ps.keys_auth
             FROM users u
             JOIN push_subscriptions ps ON ps.user_id = u.id
             WHERE u.id = ANY($1) AND u.web_push_enabled != false`,
            [teamleiterIds]
          );

          const webPushPayload = JSON.stringify({
            title: notificationTitle,
            body: notificationBody,
            icon: '/icon.png',
            badge: '/badge.png',
            vibrate: [200, 100, 200],
          });

          for (const sub of webPushRecipients.rows) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth,
                  },
                },
                webPushPayload
              );
              console.log(`Task complete Web Push sent to teamleiter ${sub.id}`);
            } catch (pushError: any) {
              console.error('Send push notification error:', pushError);
              if (pushError.statusCode === 410) {
                await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              }
            }
          }

          // 2. Signal Benachrichtigungen an Teamleiter
          const { signalService } = require('../services/signal');
          const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

          if (linkedTeamleiter) {
            const signalRecipients = await query(
              `SELECT u.id, u.signal_phone_number
               FROM users u
               WHERE u.id = ANY($1) AND u.signal_enabled = true AND u.signal_phone_number IS NOT NULL`,
              [teamleiterIds]
            );

            // Beschreibung hinzufügen wenn vorhanden
            let description = '';
            if (task.description) {
              description = `\n📋 ${task.description}`;
            }

            // Zeit-Informationen formatieren (ohne Sekunden und Icons)
            let timeInfo = '';
            if (task.scheduled_time || task.start_time) {
              timeInfo += '\n\n';
              if (task.scheduled_time) timeInfo += `Geplant: ${formatTime(task.scheduled_time)} Uhr\n`;
              if (task.start_time) timeInfo += `Start: ${formatTime(task.start_time)} Uhr\n`;
              if (task.end_time) timeInfo += `Ende: ${formatTime(task.end_time)} Uhr`;
            } else if (task.end_time) {
              timeInfo += `\n\nEnde: ${formatTime(task.end_time)} Uhr`;
            }

            const signalMessage = `${notificationTitle}\n\n${task.title}${description}${timeInfo}\n\n🎪 ${task.event_name}\n👤 ${req.user!.name}`;

            for (const recipient of signalRecipients.rows) {
              try {
                const signalSent = await signalService.sendMessage(
                  linkedTeamleiter.signal_account_number,
                  recipient.signal_phone_number,
                  signalMessage
                );

                if (signalSent) {
                  console.log(`Task complete Signal sent to teamleiter ${recipient.id}`);
                }
              } catch (signalError) {
                console.error('Signal notification error:', signalError);
              }
            }
          }
        }
      }
      } catch (notifError) {
        console.error('Teamleiter notification error:', notifError);
      }
    }

    // Broadcast update to all connected clients
    broadcastUpdate('task', { action: 'complete', taskId: assignment.rows[0].task_id, assignmentId: parseInt(assignmentId) });

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

    // Task-Informationen laden mit Event-Name
    const taskInfo = await query(
      'SELECT t.*, e.name as event_name FROM tasks t JOIN events e ON t.event_id = e.id WHERE t.id = $1',
      [taskId]
    );
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

    // Benachrichtige Teamleiter über Fertigstellung (nur wenn staff)
    if (req.user!.role === 'staff') {
      try {
        const notificationTitle = 'Status wurde zu "Erledigt" geändert';
        const notificationBody = `${req.user!.name}: "${task.title}"`;

        // Finde alle Teamleiter des Events die Benachrichtigungen aktiviert haben
        const teamleiterResult = await query(
        `SELECT u.id, u.name, u.signal_account_number, u.signal_linked, u.teamleiter_status_notifications, et.is_primary
         FROM event_teamleiter et
         JOIN users u ON et.user_id = u.id
         WHERE et.event_id = $1 AND (u.teamleiter_status_notifications = true OR u.teamleiter_status_notifications IS NULL)
         ORDER BY et.is_primary DESC, et.id ASC`,
        [task.event_id]
      );

      if (teamleiterResult.rows.length > 0) {
        const teamleiterIds = teamleiterResult.rows.map(tl => tl.id);

        // 1. Web Push Benachrichtigungen an Teamleiter
        const webpush = require('web-push');
        const webPushRecipients = await query(
          `SELECT DISTINCT u.id, ps.endpoint, ps.keys_p256dh, ps.keys_auth
           FROM users u
           JOIN push_subscriptions ps ON ps.user_id = u.id
           WHERE u.id = ANY($1) AND u.web_push_enabled != false`,
          [teamleiterIds]
        );

        const webPushPayload = JSON.stringify({
          title: notificationTitle,
          body: notificationBody,
          icon: '/icon.png',
          badge: '/badge.png',
          vibrate: [200, 100, 200],
        });

        for (const sub of webPushRecipients.rows) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.keys_p256dh,
                  auth: sub.keys_auth,
                },
              },
              webPushPayload
            );
            console.log(`Public task complete Web Push sent to teamleiter ${sub.id}`);
          } catch (pushError: any) {
            console.error('Send push notification error:', pushError);
            if (pushError.statusCode === 410) {
              await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
            }
          }
        }

        // 2. Signal Benachrichtigungen an Teamleiter
        const { signalService } = require('../services/signal');
        const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

        if (linkedTeamleiter) {
          const signalRecipients = await query(
            `SELECT u.id, u.signal_phone_number
             FROM users u
             WHERE u.id = ANY($1) AND u.signal_enabled = true AND u.signal_phone_number IS NOT NULL`,
            [teamleiterIds]
          );

          // Beschreibung hinzufügen wenn vorhanden
          let description = '';
          if (task.description) {
            description = `\n📋 ${task.description}`;
          }

          // Zeit-Informationen formatieren (ohne Sekunden)
          let timeInfo = '';
          if (task.scheduled_time || task.start_time) {
            timeInfo += '\n\n';
            if (task.scheduled_time) timeInfo += `⏰ ${formatTime(task.scheduled_time)} Uhr\n`;
            if (task.start_time) timeInfo += `🚀 ${formatTime(task.start_time)} Uhr\n`;
            if (task.end_time) timeInfo += `🏁 ${formatTime(task.end_time)} Uhr`;
          } else if (task.end_time) {
            timeInfo += `\n\n🏁 ${formatTime(task.end_time)} Uhr`;
          }

          const signalMessage = `${notificationTitle}\n\n${task.title}${description}${timeInfo}\n\n🎪 ${task.event_name}\n👤 ${req.user!.name}`;

          for (const recipient of signalRecipients.rows) {
            try {
              const signalSent = await signalService.sendMessage(
                linkedTeamleiter.signal_account_number,
                recipient.signal_phone_number,
                signalMessage
              );

              if (signalSent) {
                console.log(`Public task complete Signal sent to teamleiter ${recipient.id}`);
              }
            } catch (signalError) {
              console.error('Signal notification error:', signalError);
            }
          }
        }
      }
      } catch (notifError) {
        console.error('Teamleiter notification error:', notifError);
      }
    }

    // Broadcast update to all connected clients
    broadcastUpdate('task', { action: 'complete_public', taskId: parseInt(taskId) });

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
    const isAdmin = req.user!.role === 'admin';

    // Prüfen ob die Zuweisung dem Benutzer gehört oder Admin
    let assignment;
    if (isAdmin) {
      assignment = await query('SELECT ta.*, t.title, t.event_id, t.status, t.scheduled_time, t.start_time, t.end_time FROM task_assignments ta JOIN tasks t ON ta.task_id = t.id WHERE ta.id = $1', [assignmentId]);
    } else {
      assignment = await query('SELECT ta.*, t.title, t.event_id, t.status, t.scheduled_time, t.start_time, t.end_time FROM task_assignments ta JOIN tasks t ON ta.task_id = t.id WHERE ta.id = $1 AND ta.user_id = $2', [
        assignmentId,
        userId,
      ]);
    }

    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden' });
    }

    const oldReminder = assignment.rows[0].reminder_minutes;
    const taskTitle = assignment.rows[0].title;
    const affectedUserId = assignment.rows[0].user_id;
    const eventId = assignment.rows[0].event_id;

    // Erinnerungszeit aktualisieren
    const result = await query(
      'UPDATE task_assignments SET reminder_minutes = $1 WHERE id = $2 RETURNING *',
      [reminder_minutes, assignmentId]
    );

    // Benachrichtigung senden wenn Admin die Zeit ändert
    if (isAdmin && affectedUserId !== userId && oldReminder !== reminder_minutes) {
      try {
        const title = 'Erinnerungszeit geändert';
        const body = `"${taskTitle}": Neue Erinnerung ${reminder_minutes} Minuten vorher`;

        // 1. Web Push
        const webpush = require('web-push');
        const userSettings = await query(
          `SELECT u.web_push_enabled, u.signal_enabled, u.signal_phone_number
           FROM users u
           WHERE u.id = $1`,
          [affectedUserId]
        );

        if (userSettings.rows.length > 0) {
          const user = userSettings.rows[0];

          // Web Push
          if (user.web_push_enabled !== false) {
            const subscriptions = await query(
              `SELECT ps.* FROM push_subscriptions ps WHERE ps.user_id = $1`,
              [affectedUserId]
            );

            const payload = JSON.stringify({
              title,
              body,
              icon: '/icon.png',
              badge: '/badge.png',
              vibrate: [200, 100, 200],
            });

            for (const sub of subscriptions.rows) {
              try {
                await webpush.sendNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: {
                      p256dh: sub.keys_p256dh,
                      auth: sub.keys_auth,
                    },
                  },
                  payload
                );
                console.log(`Reminder change Web Push sent to user ${affectedUserId}`);
              } catch (pushError: any) {
                console.error('Send reminder change notification error:', pushError);
                if (pushError.statusCode === 410) {
                  await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
                }
              }
            }
          }

          // 2. Signal
          if (user.signal_enabled && user.signal_phone_number) {
            const { signalService } = require('../services/signal');

            // Finde Teamleiter mit Signal-Account
            const teamleiterResult = await query(
              `SELECT u.id, u.signal_account_number, u.signal_linked, et.is_primary
               FROM event_teamleiter et
               JOIN users u ON et.user_id = u.id
               WHERE et.event_id = $1
               ORDER BY et.is_primary DESC, et.id ASC`,
              [eventId]
            );

            if (teamleiterResult.rows.length > 0) {
              const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

              if (linkedTeamleiter) {
                // Zeit-Informationen formatieren
                let timeInfo = '';
                const taskScheduledTime = assignment.rows[0].scheduled_time;
                const taskStartTime = assignment.rows[0].start_time;
                const taskEndTime = assignment.rows[0].end_time;

                if (taskScheduledTime || taskStartTime) {
                  timeInfo += '\n\n';
                  if (taskScheduledTime) timeInfo += `⏰ Geplant: ${taskScheduledTime} Uhr\n`;
                  if (taskStartTime) timeInfo += `🚀 Start: ${taskStartTime} Uhr\n`;
                  if (taskEndTime) timeInfo += `🏁 Ende: ${taskEndTime} Uhr`;
                } else if (taskEndTime) {
                  timeInfo += `\n\n🏁 Ende: ${taskEndTime} Uhr`;
                }

                const signalMessage = `${title}\n\n${taskTitle}${timeInfo}\n\n👤 Geändert von: ${req.user!.name}`;
                const signalSent = await signalService.sendMessage(
                  linkedTeamleiter.signal_account_number,
                  user.signal_phone_number,
                  signalMessage
                );

                if (signalSent) {
                  console.log(`Reminder change Signal sent to user ${affectedUserId}`);
                }
              }
            }
          }
        }
      } catch (notifError) {
        console.error('Reminder change notification error:', notifError);
      }
    }

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

    // Hole Task-Informationen mit Event-Name
    const taskInfo = await query(
      'SELECT t.*, e.name as event_name FROM tasks t JOIN events e ON t.event_id = e.id WHERE t.id = $1',
      [id]
    );
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

      // Mitarbeiter dürfen nur zwischen 'not_started' und 'in_progress' wechseln
      if (status !== 'in_progress' && status !== 'not_started') {
        return res.status(403).json({ error: 'Mitarbeiter können den Status nur auf "Nicht gestartet" oder "In Arbeit" setzen' });
      }
    }

    // Hole aktuelle Aufgabe für Benachrichtigungen mit Event-Name
    const current = await query(
      'SELECT t.*, e.name as event_name FROM tasks t JOIN events e ON t.event_id = e.id WHERE t.id = $1',
      [id]
    );

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

    // Wenn Status geändert wurde, sende Benachrichtigungen (nur für Admin-Änderungen)
    if (isAdmin && status !== currentTask.status) {
      try {
        // Status-Labels für Benachrichtigungen
        const statusLabels: { [key: string]: string } = {
          not_started: 'Nicht gestartet',
          in_progress: 'In Arbeit',
          completed: 'Erledigt',
          overdue: 'Überfällig',
        };

        const notificationTitle = currentTask.is_public ? 'Öffentliche Aufgabe aktualisiert' : 'Aufgaben-Status geändert';
        const notificationBody = `"${currentTask.title}" ist jetzt: ${statusLabels[status] || status}`;

        let userIds: number[] = [];

        // Bestimme welche User benachrichtigt werden sollen
        if (currentTask.is_public) {
          // Bei öffentlichen Aufgaben: Alle Mitarbeiter im Event-Pool
          const poolUsers = await query(
            `SELECT DISTINCT u.id
             FROM users u
             JOIN event_staff es ON es.user_id = u.id
             WHERE es.event_id = $1 AND u.role = 'staff'`,
            [currentTask.event_id]
          );
          userIds = poolUsers.rows.map(u => u.id);
        } else {
          // Bei privaten Aufgaben: Nur zugewiesene Mitarbeiter
          const assignedUsers = await query(
            `SELECT DISTINCT u.id
             FROM task_assignments ta
             JOIN users u ON ta.user_id = u.id
             WHERE ta.task_id = $1`,
            [id]
          );
          userIds = assignedUsers.rows.map(u => u.id);
        }

        // 1. Web Push Benachrichtigungen (ohne den User der die Änderung macht)
        const webpush = require('web-push');
        const webPushRecipients = await query(
          `SELECT DISTINCT u.id, ps.endpoint, ps.keys_p256dh, ps.keys_auth
           FROM users u
           JOIN push_subscriptions ps ON ps.user_id = u.id
           WHERE u.id = ANY($1) AND u.web_push_enabled != false AND u.id != $2`,
          [userIds, req.user!.id]
        );

        const webPushPayload = JSON.stringify({
          title: notificationTitle,
          body: notificationBody,
          icon: '/icon.png',
          badge: '/badge.png',
          vibrate: [200, 100, 200],
          requireInteraction: status === 'overdue',
        });

        for (const sub of webPushRecipients.rows) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.keys_p256dh,
                  auth: sub.keys_auth,
                },
              },
              webPushPayload
            );
            console.log(`Status change Web Push sent to user ${sub.id} for task ${id}`);
          } catch (pushError: any) {
            console.error('Send push notification error:', pushError);
            if (pushError.statusCode === 410) {
              await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
            }
          }
        }

        // 2. Signal Benachrichtigungen
        const { signalService } = require('../services/signal');

        // Finde Teamleiter mit Signal-Account
        const teamleiterResult = await query(
          `SELECT u.id, u.signal_account_number, u.signal_linked, et.is_primary
           FROM event_teamleiter et
           JOIN users u ON et.user_id = u.id
           WHERE et.event_id = $1
           ORDER BY et.is_primary DESC, et.id ASC`,
          [currentTask.event_id]
        );

        if (teamleiterResult.rows.length > 0) {
          const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

          if (linkedTeamleiter) {
            // Hole Signal-aktivierte User (ohne den User der die Änderung macht)
            const signalRecipients = await query(
              `SELECT u.id, u.signal_phone_number
               FROM users u
               WHERE u.id = ANY($1) AND u.signal_enabled = true AND u.signal_phone_number IS NOT NULL AND u.id != $2`,
              [userIds, req.user!.id]
            );

            // Zeit-Informationen formatieren
            let timeInfo = '';
            if (currentTask.scheduled_time || currentTask.start_time) {
              timeInfo += '\n\n';
              if (currentTask.scheduled_time) timeInfo += `⏰ Geplant: ${currentTask.scheduled_time} Uhr\n`;
              if (currentTask.start_time) timeInfo += `🚀 Start: ${currentTask.start_time} Uhr\n`;
              if (currentTask.end_time) timeInfo += `🏁 Ende: ${currentTask.end_time} Uhr`;
            } else if (currentTask.end_time) {
              timeInfo += `\n\n🏁 Ende: ${currentTask.end_time} Uhr`;
            }

            const signalMessage = `${notificationTitle}\n\n${currentTask.title}${timeInfo}\n\n👤 Geändert von: ${req.user!.name}`;

            for (const recipient of signalRecipients.rows) {
              try {
                const signalSent = await signalService.sendMessage(
                  linkedTeamleiter.signal_account_number,
                  recipient.signal_phone_number,
                  signalMessage
                );

                if (signalSent) {
                  console.log(`Status change Signal sent to user ${recipient.id} for task ${id}`);
                }
              } catch (signalError) {
                console.error('Signal notification error:', signalError);
              }
            }
          } else {
            console.log(`No linked Signal account found for event ${currentTask.event_id}`);
          }
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    // Benachrichtige Teamleiter wenn ein MITARBEITER (staff) den Status ändert
    if (req.user!.role === 'staff' && status !== currentTask.status) {
      try {
        // Status-Labels für Benachrichtigungen
        const statusLabels: { [key: string]: string } = {
          not_started: 'Nicht gestartet',
          in_progress: 'In Arbeit',
          completed: 'Erledigt',
          overdue: 'Überfällig',
        };

        const notificationTitle = `Status wurde zu "${statusLabels[status]}" geändert`;
        const notificationBody = `${req.user!.name}: "${currentTask.title}"`;

        // Finde alle Teamleiter des Events die Benachrichtigungen aktiviert haben
        const teamleiterResult = await query(
          `SELECT u.id, u.name, u.signal_account_number, u.signal_linked, u.teamleiter_status_notifications, et.is_primary
           FROM event_teamleiter et
           JOIN users u ON et.user_id = u.id
           WHERE et.event_id = $1 AND (u.teamleiter_status_notifications = true OR u.teamleiter_status_notifications IS NULL)
           ORDER BY et.is_primary DESC, et.id ASC`,
          [currentTask.event_id]
        );

        console.log(`[Teamleiter notification] Found ${teamleiterResult.rows.length} teamleiter for event ${currentTask.event_id}`);

        if (teamleiterResult.rows.length > 0) {
          const teamleiterIds = teamleiterResult.rows.map(tl => tl.id);

          // 1. Web Push Benachrichtigungen an Teamleiter
          const webpush = require('web-push');
          const webPushRecipients = await query(
            `SELECT DISTINCT u.id, ps.endpoint, ps.keys_p256dh, ps.keys_auth
             FROM users u
             JOIN push_subscriptions ps ON ps.user_id = u.id
             WHERE u.id = ANY($1) AND u.web_push_enabled != false`,
            [teamleiterIds]
          );

          const webPushPayload = JSON.stringify({
            title: notificationTitle,
            body: notificationBody,
            icon: '/icon.png',
            badge: '/badge.png',
            vibrate: [200, 100, 200],
            requireInteraction: status === 'overdue',
          });

          for (const sub of webPushRecipients.rows) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth,
                  },
                },
                webPushPayload
              );
              console.log(`Staff status change Web Push sent to teamleiter ${sub.id} for task ${id}`);
            } catch (pushError: any) {
              console.error('Send push notification error:', pushError);
              if (pushError.statusCode === 410) {
                await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              }
            }
          }

          // 2. Signal Benachrichtigungen an Teamleiter
          const { signalService } = require('../services/signal');
          const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

          if (linkedTeamleiter) {
            // Hole Teamleiter mit Signal-Einstellungen
            const signalRecipients = await query(
              `SELECT u.id, u.signal_phone_number, u.name
               FROM users u
               WHERE u.id = ANY($1) AND u.signal_enabled = true AND u.signal_phone_number IS NOT NULL`,
              [teamleiterIds]
            );

            // Beschreibung hinzufügen wenn vorhanden
            let description = '';
            if (currentTask.description) {
              description = `\n📋 ${currentTask.description}`;
            }

            // Zeit-Informationen formatieren (ohne Sekunden und Icons)
            let timeInfo = '';
            if (currentTask.scheduled_time || currentTask.start_time) {
              timeInfo += '\n\n';
              if (currentTask.scheduled_time) timeInfo += `Geplant: ${formatTime(currentTask.scheduled_time)} Uhr\n`;
              if (currentTask.start_time) timeInfo += `Start: ${formatTime(currentTask.start_time)} Uhr\n`;
              if (currentTask.end_time) timeInfo += `Ende: ${formatTime(currentTask.end_time)} Uhr`;
            } else if (currentTask.end_time) {
              timeInfo += `\n\nEnde: ${formatTime(currentTask.end_time)} Uhr`;
            }

            const signalMessage = `${notificationTitle}\n\n${currentTask.title}${description}${timeInfo}\n\n🎪 ${currentTask.event_name}\n👤 ${req.user!.name}`;

            for (const recipient of signalRecipients.rows) {
              try {
                const signalSent = await signalService.sendMessage(
                  linkedTeamleiter.signal_account_number,
                  recipient.signal_phone_number,
                  signalMessage
                );

                if (signalSent) {
                  console.log(`Staff status change Signal sent to teamleiter ${recipient.id} for task ${id}`);
                }
              } catch (signalError) {
                console.error('Signal notification error:', signalError);
              }
            }
          } else {
            console.log(`No linked Signal account found for event ${currentTask.event_id} teamleiter`);
          }
        }
      } catch (notifError) {
        console.error('Teamleiter notification error:', notifError);
      }
    }

    // Broadcast update to all connected clients
    broadcastUpdate('task', { action: 'status_update', task: result.rows[0] });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe aktualisieren
router.put('/:id', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Hole aktuelle Aufgabe mit Event-Name
    const current = await query(
      'SELECT t.*, e.name as event_name FROM tasks t JOIN events e ON t.event_id = e.id WHERE t.id = $1',
      [id]
    );

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
      status = currentTask.status,
      series_id = currentTask.series_id
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
        status = $9,
        series_id = $10
       WHERE id = $11 RETURNING *`,
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
        series_id || null,
        id
      ]
    );

    // Serie neu gesetzt oder gewechselt: die Mitglieder der neuen Serie
    // bekommen die Aufgabe. Fällt sie aus einer Serie heraus, bleiben ihre
    // bisherigen Zuweisungen als normale Einzelzuweisungen bestehen.
    if (series_id && series_id !== currentTask.series_id) {
      await syncSeriesAssignments(series_id);
    }

    // Wenn Status von completed weg geändert wird, alle Assignments zurücksetzen
    if (currentTask.status === 'completed' && status !== 'completed') {
      await query(
        'UPDATE task_assignments SET completed = false, completed_at = null WHERE task_id = $1',
        [id]
      );
      console.log(`Reset completed status for all assignments of task ${id}`);
    }

    // Wenn Status geändert wurde, sende Benachrichtigungen (Web Push + Signal)
    if (status !== currentTask.status) {
      try {
        const statusLabels: { [key: string]: string } = {
          not_started: 'Nicht gestartet',
          in_progress: 'In Arbeit',
          completed: 'Erledigt',
          overdue: 'Überfällig',
        };

        const notificationTitle = is_public
          ? 'Öffentliche Aufgabe aktualisiert'
          : `Status wurde zu "${statusLabels[status]}" geändert`;
        const notificationBody = `${req.user!.name}: "${title}"`;

        let userIds: number[] = [];

        // Bestimme welche User benachrichtigt werden sollen
        if (is_public) {
          // Bei öffentlichen Aufgaben: Alle Mitarbeiter im Event-Pool
          const poolUsers = await query(
            `SELECT DISTINCT u.id
             FROM users u
             JOIN event_staff es ON es.user_id = u.id
             WHERE es.event_id = $1 AND u.role = 'staff'`,
            [currentTask.event_id]
          );
          userIds = poolUsers.rows.map(u => u.id);
        } else {
          // Bei privaten Aufgaben: Nur zugewiesene Mitarbeiter
          const assignedUsers = await query(
            `SELECT DISTINCT u.id
             FROM task_assignments ta
             JOIN users u ON ta.user_id = u.id
             WHERE ta.task_id = $1`,
            [id]
          );
          userIds = assignedUsers.rows.map(u => u.id);
        }

        // 1. Web Push Benachrichtigungen (ohne den User der die Änderung macht)
        const webpush = require('web-push');
        const webPushRecipients = await query(
          `SELECT DISTINCT u.id, ps.endpoint, ps.keys_p256dh, ps.keys_auth
           FROM users u
           JOIN push_subscriptions ps ON ps.user_id = u.id
           WHERE u.id = ANY($1) AND u.web_push_enabled != false AND u.id != $2`,
          [userIds, req.user!.id]
        );

        const webPushPayload = JSON.stringify({
          title: notificationTitle,
          body: notificationBody,
          icon: '/icon.png',
          badge: '/badge.png',
          vibrate: [200, 100, 200],
          requireInteraction: status === 'overdue',
        });

        for (const sub of webPushRecipients.rows) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.keys_p256dh,
                  auth: sub.keys_auth,
                },
              },
              webPushPayload
            );
            console.log(`Task update status Web Push sent to user ${sub.id} for task ${id}`);
          } catch (pushError: any) {
            console.error('Send push notification error:', pushError);
            if (pushError.statusCode === 410) {
              await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
            }
          }
        }

        // 2. Signal Benachrichtigungen
        const { signalService } = require('../services/signal');

        // Finde Teamleiter mit Signal-Account
        const teamleiterResult = await query(
          `SELECT u.id, u.signal_account_number, u.signal_linked, et.is_primary
           FROM event_teamleiter et
           JOIN users u ON et.user_id = u.id
           WHERE et.event_id = $1
           ORDER BY et.is_primary DESC, et.id ASC`,
          [currentTask.event_id]
        );

        if (teamleiterResult.rows.length > 0) {
          const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

          if (linkedTeamleiter) {
            // Hole Signal-aktivierte User (ohne den User der die Änderung macht)
            const signalRecipients = await query(
              `SELECT u.id, u.signal_phone_number
               FROM users u
               WHERE u.id = ANY($1) AND u.signal_enabled = true AND u.signal_phone_number IS NOT NULL AND u.id != $2`,
              [userIds, req.user!.id]
            );

            // Beschreibung formatieren
            let descriptionText = '';
            if (description) {
              descriptionText = `\n📋 ${description}`;
            }

            // Zeit-Informationen formatieren (ohne Sekunden und Icons)
            let timeInfo = '';
            if (scheduled_time || start_time) {
              timeInfo += '\n\n';
              if (scheduled_time) timeInfo += `Geplant: ${formatTime(scheduled_time)} Uhr\n`;
              if (start_time) timeInfo += `Start: ${formatTime(start_time)} Uhr\n`;
              if (end_time) timeInfo += `Ende: ${formatTime(end_time)} Uhr`;
            } else if (end_time) {
              timeInfo += `\n\nEnde: ${formatTime(end_time)} Uhr`;
            }

            const signalMessage = `${notificationTitle}\n\n${title}${descriptionText}${timeInfo}\n\n🎪 ${currentTask.event_name}\n👤 ${req.user!.name}`;

            for (const recipient of signalRecipients.rows) {
              try {
                const signalSent = await signalService.sendMessage(
                  linkedTeamleiter.signal_account_number,
                  recipient.signal_phone_number,
                  signalMessage
                );

                if (signalSent) {
                  console.log(`Task update status Signal sent to user ${recipient.id} for task ${id}`);
                }
              } catch (signalError) {
                console.error('Signal notification error:', signalError);
              }
            }
          } else {
            console.log(`No linked Signal account found for event ${currentTask.event_id}`);
          }
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Fehler beim Senden von Benachrichtigungen sollte die Task-Aktualisierung nicht blockieren
      }
    }

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'update', task: result.rows[0] });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe löschen
router.delete('/:id', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    // Broadcast update for live sync
    const deletedTask = result.rows[0];
    broadcastUpdate('task', { action: 'delete', taskId: deletedTask.id, eventId: deletedTask.event_id });

    res.json({ message: 'Aufgabe gelöscht' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabenstatus für Event-Instanz abrufen (für Admin)
router.get('/status/:instanceId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
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

// Aufgabe deaktivieren (Admin only)
router.put('/:id/deactivate', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE tasks SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'deactivate', task: result.rows[0] });

    res.json({ message: 'Aufgabe wurde deaktiviert', task: result.rows[0] });
  } catch (error) {
    console.error('Deactivate task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe aktivieren (Admin only)
router.put('/:id/activate', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE tasks SET is_active = true WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'activate', task: result.rows[0] });

    res.json({ message: 'Aufgabe wurde aktiviert', task: result.rows[0] });
  } catch (error) {
    console.error('Activate task error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe nach oben verschieben (Admin only)
router.put('/:id/move-up', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Get current task
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    const currentTask = taskResult.rows[0];
    const { event_id, sort_order, day_number } = currentTask;

    // Find the task directly above (same day, highest sort_order that is less than current)
    const aboveResult = await query(
      'SELECT * FROM tasks WHERE event_id = $1 AND day_number = $2 AND sort_order < $3 ORDER BY sort_order DESC LIMIT 1',
      [event_id, day_number, sort_order]
    );

    if (aboveResult.rows.length === 0) {
      return res.json({ message: 'Aufgabe ist bereits an erster Position für diesen Tag' });
    }

    const aboveTask = aboveResult.rows[0];

    // Swap sort_order
    await query('UPDATE tasks SET sort_order = $1 WHERE id = $2', [aboveTask.sort_order, id]);
    await query('UPDATE tasks SET sort_order = $1 WHERE id = $2', [sort_order, aboveTask.id]);

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'move', taskId: parseInt(id), eventId: event_id });

    res.json({ message: 'Reihenfolge aktualisiert' });
  } catch (error) {
    console.error('Move up error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Aufgabe nach unten verschieben (Admin only)
router.put('/:id/move-down', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Get current task
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
    }

    const currentTask = taskResult.rows[0];
    const { event_id, sort_order, day_number } = currentTask;

    // Find the task directly below (same day, lowest sort_order that is greater than current)
    const belowResult = await query(
      'SELECT * FROM tasks WHERE event_id = $1 AND day_number = $2 AND sort_order > $3 ORDER BY sort_order ASC LIMIT 1',
      [event_id, day_number, sort_order]
    );

    if (belowResult.rows.length === 0) {
      return res.json({ message: 'Aufgabe ist bereits an letzter Position für diesen Tag' });
    }

    const belowTask = belowResult.rows[0];

    // Swap sort_order
    await query('UPDATE tasks SET sort_order = $1 WHERE id = $2', [belowTask.sort_order, id]);
    await query('UPDATE tasks SET sort_order = $1 WHERE id = $2', [sort_order, belowTask.id]);

    // Broadcast update for live sync
    broadcastUpdate('task', { action: 'move', taskId: parseInt(id), eventId: event_id });

    res.json({ message: 'Reihenfolge aktualisiert' });
  } catch (error) {
    console.error('Move down error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Bulk Delete Tasks
router.post('/event/:eventId/bulk-delete', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { task_ids } = req.body;

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ error: 'Keine Task-IDs angegeben' });
    }

    // Delete all tasks
    await query('DELETE FROM tasks WHERE id = ANY($1) AND event_id = $2', [task_ids, eventId]);

    broadcastUpdate('task', { action: 'bulk_delete', taskIds: task_ids, eventId: parseInt(eventId) });

    res.json({ message: `${task_ids.length} Aufgaben gelöscht`, deleted: task_ids.length });
  } catch (error) {
    console.error('Bulk delete tasks error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Bulk Assign Tasks
router.post('/instance/:instanceId/bulk-assign', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { task_ids, user_ids } = req.body;

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ error: 'Keine Task-IDs angegeben' });
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Keine User-IDs angegeben' });
    }

    let assigned = 0;

    for (const taskId of task_ids) {
      for (const userId of user_ids) {
        // Check if already assigned
        const existing = await query(
          'SELECT * FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
          [taskId, instanceId, userId]
        );

        if (existing.rows.length === 0) {
          await query(
            'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4)',
            [taskId, instanceId, userId, 15]
          );
          assigned++;
        }
      }
    }

    broadcastUpdate('task', { action: 'bulk_assign', taskIds: task_ids, userIds: user_ids, instanceId: parseInt(instanceId) });

    res.json({ message: `${assigned} Zuweisungen erstellt`, assigned });
  } catch (error) {
    console.error('Bulk assign error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// CSV Export Tasks
router.post('/event/:eventId/export-csv', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { task_ids } = req.body;

    let result;
    if (task_ids && Array.isArray(task_ids) && task_ids.length > 0) {
      result = await query(
        'SELECT id, title, description, day_number, scheduled_time, start_time, end_time, is_public, status FROM tasks WHERE id = ANY($1) AND event_id = $2 ORDER BY day_number, scheduled_time',
        [task_ids, eventId]
      );
    } else {
      result = await query(
        'SELECT id, title, description, day_number, scheduled_time, start_time, end_time, is_public, status FROM tasks WHERE event_id = $1 ORDER BY day_number, scheduled_time',
        [eventId]
      );
    }

    // Create CSV
    const headers = ['id', 'title', 'description', 'day_number', 'scheduled_time', 'start_time', 'end_time', 'is_public', 'status'];
    const rows = result.rows.map(row =>
      `${row.id},"${row.title}","${row.description || ''}",${row.day_number},${row.scheduled_time || ''},${row.start_time || ''},${row.end_time || ''},${row.is_public},${row.status}`
    );
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=tasks_event${eventId}_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// CSV Import Tasks
router.post('/event/:eventId/import-csv', authMiddleware, teamleiterOrAdminMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { eventId } = req.params;

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

    // Get max sort_order for this event
    const maxSortResult = await query('SELECT MAX(sort_order) as max_sort FROM tasks WHERE event_id = $1', [eventId]);
    let nextSortOrder = (maxSortResult.rows[0]?.max_sort || 0) + 10;

    for (let i = 1; i < lines.length; i++) {
      // Parse CSV line with quoted strings
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());

      const task: any = {};
      headers.forEach((header, idx) => {
        task[header] = values[idx];
      });

      // Create new task - always reset status to not_started on import
      await query(
        `INSERT INTO tasks (
          event_id, day_number, title, description, scheduled_time, start_time, end_time,
          reminder_minutes, is_public, status, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          eventId,
          parseInt(task.day_number) || 1,
          task.title,
          task.description || null,
          task.scheduled_time || null,
          task.start_time || null,
          task.end_time || null,
          15,
          task.is_public === 'true',
          'not_started', // Always reset status on import
          nextSortOrder
        ]
      );

      nextSortOrder += 10;
      imported++;
    }

    broadcastUpdate('task', { action: 'tasks_imported', count: imported, eventId: parseInt(eventId) });

    res.json({ message: `${imported} Aufgaben importiert`, imported });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Bulk Remove Task Assignments
router.post('/bulk-remove-assignments', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { assignment_ids } = req.body;

    if (!Array.isArray(assignment_ids) || assignment_ids.length === 0) {
      return res.status(400).json({ error: 'Keine Assignment-IDs angegeben' });
    }

    // Delete assignments
    await query('DELETE FROM task_assignments WHERE id = ANY($1)', [assignment_ids]);

    broadcastUpdate('task', { action: 'bulk_remove_assignments', assignmentIds: assignment_ids });

    res.json({ message: `${assignment_ids.length} Zuweisungen entfernt`, removed: assignment_ids.length });
  } catch (error) {
    console.error('Bulk remove assignments error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Replace Staff Member (reassign all tasks)
router.post('/replace-staff/:eventId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { old_user_id, new_user_id } = req.body;

    if (!old_user_id || !new_user_id) {
      return res.status(400).json({ error: 'Alte und neue User-ID erforderlich' });
    }

    // Get all task assignments for the old user in this event's instances
    const assignmentsResult = await query(
      `SELECT ta.id, ta.task_id, ta.event_instance_id, ta.reminder_minutes
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       WHERE t.event_id = $1 AND ta.user_id = $2`,
      [eventId, old_user_id]
    );

    let replaced = 0;

    for (const assignment of assignmentsResult.rows) {
      // Check if new user already has this assignment
      const existingResult = await query(
        'SELECT id FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
        [assignment.task_id, assignment.event_instance_id, new_user_id]
      );

      if (existingResult.rows.length === 0) {
        // Create new assignment for new user
        await query(
          'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4)',
          [assignment.task_id, assignment.event_instance_id, new_user_id, assignment.reminder_minutes]
        );
        replaced++;
      }

      // Delete old assignment
      await query('DELETE FROM task_assignments WHERE id = $1', [assignment.id]);
    }

    broadcastUpdate('task', {
      action: 'replace_staff',
      eventId: parseInt(eventId),
      oldUserId: old_user_id,
      newUserId: new_user_id,
      replaced
    });

    res.json({ message: `${replaced} Aufgaben neu zugewiesen`, replaced });
  } catch (error) {
    console.error('Replace staff error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// ===== TASK SERIES ROUTES =====

// Get all task series for an event
router.get('/task-series/event/:eventId', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `SELECT ts.*,
        (SELECT COUNT(*) FROM tasks WHERE series_id = ts.id) as task_count,
        (SELECT COUNT(*) FROM task_series_members WHERE series_id = ts.id) as member_count
       FROM task_series ts
       WHERE ts.event_id = $1
       ORDER BY ts.name`,
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get task series error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Get a single task series with details
router.get('/task-series/:seriesId', authMiddleware, async (req, res) => {
  try {
    const { seriesId } = req.params;
    console.log('Getting task series details for seriesId:', seriesId);

    const seriesResult = await query(
      'SELECT * FROM task_series WHERE id = $1',
      [seriesId]
    );

    if (seriesResult.rows.length === 0) {
      console.log('Series not found:', seriesId);
      return res.status(404).json({ error: 'Serie nicht gefunden' });
    }

    // Debug: Check raw members first
    const rawMembers = await query(
      'SELECT * FROM task_series_members WHERE series_id = $1',
      [seriesId]
    );
    console.log('Raw task_series_members:', rawMembers.rows);

    // Get members with JOIN
    const membersResult = await query(
      `SELECT u.id, u.name
       FROM task_series_members tsm
       JOIN users u ON tsm.user_id = u.id
       WHERE tsm.series_id = $1`,
      [seriesId]
    );
    console.log('Members found after JOIN:', membersResult.rows.length, membersResult.rows);

    // Get tasks in this series
    const tasksResult = await query(
      'SELECT * FROM tasks WHERE series_id = $1 ORDER BY day_number, scheduled_time',
      [seriesId]
    );
    console.log('Tasks found:', tasksResult.rows.length);

    res.json({
      ...seriesResult.rows[0],
      members: membersResult.rows,
      tasks: tasksResult.rows,
    });
  } catch (error) {
    console.error('Get task series details error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Create a new task series
router.post('/task-series', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { event_id, name, description, member_ids } = req.body;
    console.log('Creating task series:', { event_id, name, description, member_ids });

    if (!event_id || !name) {
      return res.status(400).json({ error: 'Event ID und Name sind erforderlich' });
    }

    // Create the series
    const seriesResult = await query(
      'INSERT INTO task_series (event_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [event_id, name, description || null]
    );

    const series = seriesResult.rows[0];
    console.log('Series created with id:', series.id);

    // Add members if provided
    let membersAdded = 0;
    if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
      for (const userId of member_ids) {
        const memberResult = await query(
          'INSERT INTO task_series_members (series_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
          [series.id, userId]
        );
        if (memberResult.rows.length > 0) {
          membersAdded++;
        }
        console.log('Added member:', userId, 'result:', memberResult.rows);
      }
    }
    console.log('Total members added:', membersAdded);

    // Mitgliedschaft sofort in Zuweisungen uebersetzen
    await syncSeriesAssignments(series.id);

    broadcastUpdate('task', { action: 'series_created', seriesId: series.id, eventId: event_id });

    res.status(201).json(series);
  } catch (error) {
    console.error('Create task series error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Update a task series
router.put('/task-series/:seriesId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { name, description } = req.body;

    const result = await query(
      'UPDATE task_series SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name, description || null, seriesId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Serie nicht gefunden' });
    }

    broadcastUpdate('task', { action: 'series_updated', seriesId: parseInt(seriesId) });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update task series error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Delete a task series
router.delete('/task-series/:seriesId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { seriesId } = req.params;

    // Get event_id before deleting
    const seriesResult = await query('SELECT event_id FROM task_series WHERE id = $1', [seriesId]);

    if (seriesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Serie nicht gefunden' });
    }

    const eventId = seriesResult.rows[0].event_id;

    // Delete the series (CASCADE will handle members and set tasks.series_id to NULL)
    await query('DELETE FROM task_series WHERE id = $1', [seriesId]);

    broadcastUpdate('task', { action: 'series_deleted', seriesId: parseInt(seriesId), eventId });

    res.json({ message: 'Serie gelöscht' });
  } catch (error) {
    console.error('Delete task series error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Get members of a task series
router.get('/task-series/:seriesId/members', authMiddleware, async (req, res) => {
  try {
    const { seriesId } = req.params;

    // Debug: First check raw data in task_series_members
    const rawMembers = await query(
      'SELECT * FROM task_series_members WHERE series_id = $1',
      [seriesId]
    );
    console.log('Raw task_series_members for series', seriesId, ':', rawMembers.rows);

    const result = await query(
      `SELECT u.id, u.name, u.role
       FROM task_series_members tsm
       JOIN users u ON tsm.user_id = u.id
       WHERE tsm.series_id = $1
       ORDER BY u.name`,
      [seriesId]
    );
    console.log('Joined members result:', result.rows);

    res.json(result.rows);
  } catch (error) {
    console.error('Get series members error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Add members to a task series
router.post('/task-series/:seriesId/members', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Keine User-IDs angegeben' });
    }

    let added = 0;

    for (const userId of user_ids) {
      const result = await query(
        'INSERT INTO task_series_members (series_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [seriesId, userId]
      );
      if (result.rows.length > 0) {
        added++;
      }
    }

    const assignmentsCreated = await syncSeriesAssignments(seriesId);

    broadcastUpdate('task', { action: 'series_members_added', seriesId: parseInt(seriesId), added });

    res.json({ message: `${added} Mitglieder hinzugefügt`, added, assignmentsCreated });
  } catch (error) {
    console.error('Add series members error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Remove a member from a task series
router.delete('/task-series/:seriesId/members/:userId', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { seriesId, userId } = req.params;

    await query(
      'DELETE FROM task_series_members WHERE series_id = $1 AND user_id = $2',
      [seriesId, userId]
    );

    // Zuweisungen, die nur aus der Mitgliedschaft entstanden sind, mitnehmen
    await removeSeriesAssignments(seriesId, userId);

    broadcastUpdate('task', { action: 'series_member_removed', seriesId: parseInt(seriesId), userId: parseInt(userId) });

    res.json({ message: 'Mitglied entfernt' });
  } catch (error) {
    console.error('Remove series member error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Update series members for all tasks in the series (bulk assign)
router.post('/task-series/:seriesId/assign-to-instance', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { event_instance_id } = req.body;

    if (!event_instance_id) {
      return res.status(400).json({ error: 'Event-Instanz ID erforderlich' });
    }

    // Get all members of the series
    const membersResult = await query(
      'SELECT user_id FROM task_series_members WHERE series_id = $1',
      [seriesId]
    );

    if (membersResult.rows.length === 0) {
      return res.status(400).json({ error: 'Keine Mitglieder in dieser Serie' });
    }

    const memberIds = membersResult.rows.map(r => r.user_id);

    // Get all tasks in this series
    const tasksResult = await query(
      'SELECT id FROM tasks WHERE series_id = $1',
      [seriesId]
    );

    if (tasksResult.rows.length === 0) {
      return res.status(400).json({ error: 'Keine Aufgaben in dieser Serie' });
    }

    let assigned = 0;

    // Assign each member to each task
    for (const task of tasksResult.rows) {
      for (const userId of memberIds) {
        const existing = await query(
          'SELECT id FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
          [task.id, event_instance_id, userId]
        );

        if (existing.rows.length === 0) {
          await query(
            'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4)',
            [task.id, event_instance_id, userId, 15]
          );
          assigned++;
        }
      }
    }

    broadcastUpdate('task', { action: 'series_assigned', seriesId: parseInt(seriesId), instanceId: event_instance_id, assigned });

    res.json({ message: `${assigned} Zuweisungen erstellt`, assigned });
  } catch (error) {
    console.error('Assign series to instance error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

/*
 * Serien-Mitgliedschaft in echte Zuweisungen uebersetzen.
 *
 * Eine Serie hielt ihre Mitglieder nur in task_series_members. In
 * /my-tasks wird aber ueber task_assignments gelesen - wer nur ueber eine
 * Serie zugewiesen war, sah seine Aufgaben deshalb gar nicht. Es gab zwar
 * "assign-to-instance", das musste man aber von Hand ausloesen.
 *
 * Deshalb: bei jeder Aenderung an Mitgliedern oder Aufgaben einer Serie die
 * Zuweisungen nachziehen. Erst dadurch bekommen die Aufgaben eine
 * assignment_id - ohne die koennte der Mitarbeiter sie auch nicht als
 * erledigt melden (complete-public lehnt nicht-oeffentliche Aufgaben ab).
 */
const syncSeriesAssignments = async (seriesId: number | string): Promise<number> => {
  const members = await query(
    'SELECT user_id FROM task_series_members WHERE series_id = $1',
    [seriesId]
  );
  if (members.rows.length === 0) return 0;

  const tasks = await query(
    'SELECT id, event_id, reminder_minutes FROM tasks WHERE series_id = $1',
    [seriesId]
  );
  if (tasks.rows.length === 0) return 0;

  // Alle Durchfuehrungen der zugehoerigen Veranstaltung
  const instances = await query(
    'SELECT id FROM event_instances WHERE event_id = $1',
    [tasks.rows[0].event_id]
  );

  let created = 0;

  for (const task of tasks.rows) {
    for (const instance of instances.rows) {
      for (const { user_id } of members.rows) {
        const existing = await query(
          'SELECT id FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
          [task.id, instance.id, user_id]
        );
        if (existing.rows.length === 0) {
          await query(
            'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4)',
            [task.id, instance.id, user_id, task.reminder_minutes ?? 15]
          );
          created++;
        }
      }
    }
  }

  return created;
};

/** Zuweisungen eines Mitglieds fuer alle Aufgaben einer Serie entfernen. */
const removeSeriesAssignments = async (seriesId: number | string, userId: number | string) => {
  await query(
    `DELETE FROM task_assignments
     WHERE user_id = $1
       AND task_id IN (SELECT id FROM tasks WHERE series_id = $2)`,
    [userId, seriesId]
  );
};

export default router;
