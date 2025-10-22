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
    } catch (error) {
      console.error('Notification scheduler error:', error);
    }
  });
}

async function sendTaskReminders() {
  // Aktuelle Zeit + Reminder-Minuten
  const now = new Date();

  // Finde alle Event-Instanzen die heute laufen
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

    if (currentDay < 1 || currentDay > instance.days) {
      continue;
    }

    // Finde Aufgaben die bald anstehen
    const tasksResult = await query(
      `SELECT
        t.*,
        ta.id as assignment_id,
        ta.user_id,
        ta.completed
       FROM tasks t
       JOIN task_assignments ta ON t.id = ta.task_id
       WHERE ta.event_instance_id = $1
         AND t.day_number = $2
         AND t.scheduled_time IS NOT NULL
         AND ta.completed = false`,
      [instance.id, currentDay]
    );

    for (const task of tasksResult.rows) {
      // Berechne die Reminder-Zeit
      const [hours, minutes] = task.scheduled_time.split(':');
      const taskTime = new Date(now);
      taskTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      const reminderTime = new Date(taskTime.getTime() - task.reminder_minutes * 60 * 1000);

      // Prüfe ob jetzt der richtige Zeitpunkt ist (innerhalb der nächsten Minute)
      const timeDiff = reminderTime.getTime() - now.getTime();

      if (timeDiff > 0 && timeDiff < 60000) {
        // Prüfe ob bereits gesendet
        const alreadySent = await query(
          `SELECT * FROM notifications_log
           WHERE user_id = $1 AND task_id = $2 AND event_instance_id = $3
             AND sent_at > (NOW() - INTERVAL '1 hour')`,
          [task.user_id, task.id, instance.id]
        );

        if (alreadySent.rows.length === 0) {
          await sendTaskNotification(task.user_id, task, instance);

          // Log erstellen
          await query(
            'INSERT INTO notifications_log (user_id, task_id, event_instance_id) VALUES ($1, $2, $3)',
            [task.user_id, task.id, instance.id]
          );
        }
      }
    }
  }
}

async function sendTaskNotification(userId: number, task: any, instance: any) {
  try {
    // Hole alle Push Subscriptions des Benutzers
    const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

    const payload = JSON.stringify({
      title: 'Aufgaben-Erinnerung',
      body: `In ${task.reminder_minutes} Minuten: ${task.title}`,
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

        console.log(`Notification sent to user ${userId} for task ${task.id}`);
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
