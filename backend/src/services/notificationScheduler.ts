import cron from 'node-cron';
import { query } from '../database/connection';
import webpush from 'web-push';
import config from '../config';

// Jeden Minute prüfen ob Benachrichtigungen gesendet werden müssen
export function startNotificationScheduler() {
  console.log('Starting notification scheduler...');

  cron.schedule('* * * * *', async () => {
    try {
      await sendTaskReminders();
      await updateOverdueTasks();
    } catch (error) {
      console.error('Notification scheduler error:', error);
    }
  });
}

async function sendTaskReminders() {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  console.log(`[Notification Scheduler] Checking for reminders at ${currentTime}`);

  // Finde alle Event-Instanzen die heute laufen
  const instancesResult = await query(
    `SELECT ei.*, e.days, e.name as event_name
     FROM event_instances ei
     JOIN events e ON ei.event_id = e.id
     WHERE ei.start_date <= CURRENT_DATE
       AND (ei.start_date + INTERVAL '1 day' * e.days) >= CURRENT_DATE`
  );

  console.log(`[Notification Scheduler] Found ${instancesResult.rows.length} active event instances`);

  for (const instance of instancesResult.rows) {
    // Berechne den aktuellen Tag der Veranstaltung
    const instanceStartDate = new Date(instance.start_date);
    const daysDiff = Math.floor((now.getTime() - instanceStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentDay = daysDiff + 1;

    if (currentDay < 1 || currentDay > instance.days) {
      continue;
    }

    console.log(`[Notification Scheduler] Checking instance: ${instance.event_name} #${instance.instance_number}, Day ${currentDay}`);

    // Finde Aufgaben die bald anstehen - mit scheduled_time ODER start_time
    const tasksResult = await query(
      `SELECT
        t.*,
        ta.id as assignment_id,
        ta.user_id,
        ta.completed,
        COALESCE(ta.reminder_minutes, t.reminder_minutes) as reminder_minutes
       FROM tasks t
       JOIN task_assignments ta ON t.id = ta.task_id
       WHERE ta.event_instance_id = $1
         AND t.day_number = $2
         AND (t.scheduled_time IS NOT NULL OR t.start_time IS NOT NULL)
         AND ta.completed = false`,
      [instance.id, currentDay]
    );

    console.log(`[Notification Scheduler] Found ${tasksResult.rows.length} tasks for today`);

    for (const task of tasksResult.rows) {
      // Nutze start_time als Fallback wenn scheduled_time nicht gesetzt
      const timeToUse = task.scheduled_time || task.start_time;
      if (!timeToUse) continue;

      const [hours, minutes] = timeToUse.split(':');
      const taskTime = new Date(now);
      taskTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      const reminderMinutes = task.reminder_minutes || 15;
      const reminderTime = new Date(taskTime.getTime() - reminderMinutes * 60 * 1000);

      // Prüfe ob jetzt der richtige Zeitpunkt ist (innerhalb der nächsten Minute)
      const timeDiff = reminderTime.getTime() - now.getTime();

      if (timeDiff > 0 && timeDiff < 60000) {
        console.log(`[Notification Scheduler] Sending reminder for task "${task.title}" to user ${task.user_id}`);

        // Prüfe ob bereits gesendet
        const alreadySent = await query(
          `SELECT * FROM notifications_log
           WHERE user_id = $1 AND task_id = $2 AND event_instance_id = $3
             AND sent_at > (NOW() - INTERVAL '1 hour')`,
          [task.user_id, task.id, instance.id]
        );

        if (alreadySent.rows.length === 0) {
          await sendTaskNotification(task.user_id, task, instance, reminderMinutes);

          // Log erstellen
          await query(
            'INSERT INTO notifications_log (user_id, task_id, event_instance_id) VALUES ($1, $2, $3)',
            [task.user_id, task.id, instance.id]
          );
        }
      }

      // Zusätzliche Erinnerung zur start_time wenn Task noch nicht in_progress
      if (task.start_time && task.status !== 'in_progress' && task.status !== 'completed') {
        const [startHours, startMinutes] = task.start_time.split(':');
        const startTime = new Date(now);
        startTime.setHours(parseInt(startHours, 10), parseInt(startMinutes, 10), 0, 0);

        // Prüfe ob jetzt genau die start_time ist (innerhalb der nächsten Minute)
        const startTimeDiff = startTime.getTime() - now.getTime();

        if (startTimeDiff > 0 && startTimeDiff < 60000) {
          console.log(`[Notification Scheduler] Sending start_time reminder for task "${task.title}" to user ${task.user_id}`);

          // Prüfe ob bereits gesendet (mit speziellem Tag für start_time)
          const alreadySent = await query(
            `SELECT * FROM notifications_log
             WHERE user_id = $1 AND task_id = $2 AND event_instance_id = $3 AND notification_type = 'start_time'
               AND sent_at > (NOW() - INTERVAL '1 hour')`,
            [task.user_id, task.id, instance.id]
          );

          if (alreadySent.rows.length === 0) {
            await sendStartTimeNotification(task.user_id, task, instance);

            // Log erstellen mit speziellem Type
            await query(
              `INSERT INTO notifications_log (user_id, task_id, event_instance_id, notification_type)
               VALUES ($1, $2, $3, 'start_time')`,
              [task.user_id, task.id, instance.id]
            );
          }
        }
      }
    }
  }
}

async function sendTaskNotification(userId: number, task: any, instance: any, reminderMinutes: number) {
  try {
    // Hole alle Push Subscriptions des Benutzers
    const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

    console.log(`[sendTaskNotification] Found ${subscriptions.rows.length} subscriptions for user ${userId}`);

    const payload = JSON.stringify({
      title: 'Aufgaben-Erinnerung',
      body: `In ${reminderMinutes} Minuten: ${task.title}`,
      icon: '/icon.png',
      tag: `task-${task.id}-${instance.id}`,
      data: {
        taskId: task.id,
        instanceId: instance.id,
        assignmentId: task.assignment_id,
      },
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

        console.log(`[sendTaskNotification] ✓ Notification sent to user ${userId} for task "${task.title}"`);
      } catch (error: any) {
        console.error('Push notification error:', error);

        // Subscription entfernen wenn ungültig
        if (error.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
    }
  } catch (error) {
    console.error('Send task notification error:', error);
  }
}

async function sendStartTimeNotification(userId: number, task: any, instance: any) {
  try {
    // Hole alle Push Subscriptions des Benutzers
    const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

    console.log(`[sendStartTimeNotification] Found ${subscriptions.rows.length} subscriptions for user ${userId}`);

    const payload = JSON.stringify({
      title: 'Aufgabe startet jetzt!',
      body: `Es ist Zeit zu starten: ${task.title}`,
      icon: '/icon.png',
      tag: `task-start-${task.id}-${instance.id}`,
      data: {
        taskId: task.id,
        instanceId: instance.id,
        assignmentId: task.assignment_id,
        type: 'start_time',
      },
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

        console.log(`[sendStartTimeNotification] ✓ Start notification sent to user ${userId} for task "${task.title}"`);
      } catch (error: any) {
        console.error('Push notification error:', error);

        // Subscription entfernen wenn ungültig
        if (error.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
    }
  } catch (error) {
    console.error('Send start time notification error:', error);
  }
}

async function updateOverdueTasks() {
  const now = new Date();

  // Finde alle Event-Instanzen die heute oder in der Vergangenheit laufen
  const instancesResult = await query(
    `SELECT ei.*, e.days
     FROM event_instances ei
     JOIN events e ON ei.event_id = e.id
     WHERE ei.start_date <= CURRENT_DATE
       AND (ei.start_date + INTERVAL '1 day' * e.days) >= CURRENT_DATE`
  );

  for (const instance of instancesResult.rows) {
    // Berechne den aktuellen Tag der Veranstaltung
    const instanceStartDate = new Date(instance.start_date);
    const daysDiff = Math.floor((now.getTime() - instanceStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentDay = daysDiff + 1;

    // Finde Tasks die überfällig sind
    const tasksResult = await query(
      `SELECT t.*, ta.user_id, ta.id as assignment_id
       FROM tasks t
       LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.event_instance_id = $1
       WHERE t.event_id = $2
         AND t.status NOT IN ('completed', 'overdue')
         AND t.end_time IS NOT NULL
         AND (
           t.day_number < $3
           OR (t.day_number = $3 AND t.end_time < $4)
         )`,
      [instance.id, instance.event_id, currentDay, now.toTimeString().substring(0, 5)]
    );

    for (const task of tasksResult.rows) {
      try {
        // Update Task Status zu overdue
        await query(
          'UPDATE tasks SET status = $1 WHERE id = $2',
          ['overdue', task.id]
        );

        console.log(`Task ${task.id} marked as overdue`);

        // Sende Push-Benachrichtigung an zugewiesene Mitarbeiter
        if (task.user_id) {
          const subscriptions = await query(
            `SELECT ps.* FROM push_subscriptions ps
             JOIN users u ON ps.user_id = u.id
             WHERE ps.user_id = $1 AND u.push_enabled = true`,
            [task.user_id]
          );

          const payload = JSON.stringify({
            title: 'Aufgabe überfällig',
            body: `"${task.title}" ist jetzt überfällig`,
            icon: '/icon.png',
            tag: `task-overdue-${task.id}`,
            data: {
              taskId: task.id,
              instanceId: instance.id,
              assignmentId: task.assignment_id,
            },
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
            } catch (error: any) {
              console.error('Push notification error:', error);
              if (error.statusCode === 410) {
                await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error updating overdue task ${task.id}:`, error);
      }
    }
  }
}
