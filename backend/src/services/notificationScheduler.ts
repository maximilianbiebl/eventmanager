import cron from 'node-cron';
import { query } from '../database/connection';
import webpush from 'web-push';
import config from '../config';
import { signalService } from './signal';

// Helper function to format time without seconds (hh:mm)
function formatTime(time: string | null): string {
  if (!time) return '';
  // Remove seconds from time string (e.g., "14:30:00" -> "14:30")
  return time.substring(0, 5);
}

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
      const reminderMinutes = task.reminder_minutes || 15;
      console.log(`[Notification Scheduler] Task "${task.title}" - reminder_minutes: ${reminderMinutes}, scheduled_time: ${task.scheduled_time}, start_time: ${task.start_time}`);

      // Erinnerung für scheduled_time
      if (task.scheduled_time) {
        const [hours, minutes] = task.scheduled_time.split(':');
        const taskTime = new Date(now);
        taskTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        const reminderTime = new Date(taskTime.getTime() - reminderMinutes * 60 * 1000);
        const timeDiff = reminderTime.getTime() - now.getTime();
        console.log(`[Notification Scheduler] scheduled_time check - taskTime: ${taskTime.toLocaleTimeString()}, reminderTime: ${reminderTime.toLocaleTimeString()}, timeDiff: ${Math.floor(timeDiff/1000)}s`);

        if (timeDiff > 0 && timeDiff < 60000) {
          console.log(`[Notification Scheduler] Sending scheduled_time reminder for task "${task.title}" to user ${task.user_id}`);

          const alreadySent = await query(
            `SELECT * FROM notifications_log
             WHERE user_id = $1 AND task_id = $2 AND event_instance_id = $3 AND notification_type = 'scheduled'
               AND sent_at > (NOW() - INTERVAL '1 hour')`,
            [task.user_id, task.id, instance.id]
          );

          if (alreadySent.rows.length === 0) {
            await sendTaskNotification(task.user_id, task, instance, reminderMinutes, 'scheduled_time');

            await query(
              `INSERT INTO notifications_log (user_id, task_id, event_instance_id, notification_type)
               VALUES ($1, $2, $3, 'scheduled')`,
              [task.user_id, task.id, instance.id]
            );
          }
        }
      }

      // Erinnerung für start_time (X Minuten vorher)
      if (task.start_time && task.scheduled_time !== task.start_time) {
        const [hours, minutes] = task.start_time.split(':');
        const taskTime = new Date(now);
        taskTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        const reminderTime = new Date(taskTime.getTime() - reminderMinutes * 60 * 1000);
        const timeDiff = reminderTime.getTime() - now.getTime();
        console.log(`[Notification Scheduler] start_time check - taskTime: ${taskTime.toLocaleTimeString()}, reminderTime: ${reminderTime.toLocaleTimeString()}, timeDiff: ${Math.floor(timeDiff/1000)}s`);

        if (timeDiff > 0 && timeDiff < 60000) {
          console.log(`[Notification Scheduler] ✓ Sending start_time reminder (${reminderMinutes} min before) for task "${task.title}" to user ${task.user_id}`);

          const alreadySent = await query(
            `SELECT * FROM notifications_log
             WHERE user_id = $1 AND task_id = $2 AND event_instance_id = $3 AND notification_type = 'start_reminder'
               AND sent_at > (NOW() - INTERVAL '1 hour')`,
            [task.user_id, task.id, instance.id]
          );

          if (alreadySent.rows.length === 0) {
            await sendTaskNotification(task.user_id, task, instance, reminderMinutes, 'start_time');

            await query(
              `INSERT INTO notifications_log (user_id, task_id, event_instance_id, notification_type)
               VALUES ($1, $2, $3, 'start_reminder')`,
              [task.user_id, task.id, instance.id]
            );
          } else {
            console.log(`[Notification Scheduler] Already sent start_time reminder for task ${task.id}`);
          }
        } else {
          console.log(`[Notification Scheduler] ✗ Skipping start_time reminder - timeDiff ${Math.floor(timeDiff/1000)}s is ${timeDiff <= 0 ? 'in the past' : 'too far in future'}`);
        }
      }

      // Zusätzliche Erinnerung zur start_time wenn Task noch nicht in_progress
      // Nur wenn der Benutzer diese Benachrichtigung aktiviert hat
      if (task.start_time && task.status !== 'in_progress' && task.status !== 'completed') {
        // Prüfe ob Benutzer start_notification aktiviert hat
        const userSettingsResult = await query(
          'SELECT start_notification_enabled FROM users WHERE id = $1',
          [task.user_id]
        );

        const startNotificationEnabled = userSettingsResult.rows[0]?.start_notification_enabled || false;

        if (startNotificationEnabled) {
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
}

async function sendTaskNotification(userId: number, task: any, instance: any, reminderMinutes: number, timeType: string = 'scheduled_time') {
  try {
    console.log(`[sendTaskNotification] Called for user ${userId}, task ${task.id}, reminder ${reminderMinutes} minutes, type ${timeType}`);

    // Hole User-Settings für Web Push und Signal
    const userResult = await query(
      `SELECT u.web_push_enabled, u.signal_enabled, u.signal_phone_number
       FROM users u
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log(`[sendTaskNotification] User ${userId} not found`);
      return;
    }

    const user = userResult.rows[0];
    console.log(`[sendTaskNotification] User settings - web_push: ${user.web_push_enabled}, signal: ${user.signal_enabled}`);

    const title = timeType === 'start_time'
      ? 'Erinnerung: Aufgabe startet bald'
      : 'Aufgaben-Erinnerung';

    // Zeit-Informationen für body formatieren
    let timeInfo = '';
    if (task.scheduled_time) timeInfo += `⏰ ${task.scheduled_time} Uhr `;
    if (task.start_time) timeInfo += `🚀 ${task.start_time} Uhr `;
    if (task.end_time) timeInfo += `🏁 ${task.end_time} Uhr`;

    const body = timeType === 'start_time'
      ? `Aufgabe startet in ${reminderMinutes} Minuten: ${task.title}${timeInfo ? '\n' + timeInfo : ''}`
      : `In ${reminderMinutes} Minuten: ${task.title}${timeInfo ? '\n' + timeInfo : ''}`;

    // 1. Web Push Notifications (wenn aktiviert)
    if (user.web_push_enabled !== false) {
      const subscriptions = await query(
        `SELECT ps.* FROM push_subscriptions ps
         WHERE ps.user_id = $1`,
        [userId]
      );

      console.log(`[sendTaskNotification] Found ${subscriptions.rows.length} web push subscriptions for user ${userId}`);

      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon.png',
        badge: '/badge.png',
        tag: `task-${timeType}-${task.id}-${instance.id}`,
        vibrate: [200, 100, 200],
        requireInteraction: false,
        data: {
          taskId: task.id,
          instanceId: instance.id,
          assignmentId: task.assignment_id,
          type: timeType,
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

          console.log(`[sendTaskNotification] ✓ Web Push sent to user ${userId}`);
        } catch (error: any) {
          console.error('Push notification error:', error);

          // Subscription entfernen wenn ungültig
          if (error.statusCode === 410) {
            await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
          }
        }
      }
    }

    // 2. Signal Notifications (wenn aktiviert)
    if (user.signal_enabled && user.signal_phone_number) {
      try {
        // Finde alle Teamleiter des Events (primärer Teamleiter zuerst, dann Co-Teamleiter)
        const teamleiterResult = await query(
          `SELECT u.id, u.signal_account_number, u.signal_linked, et.is_primary
           FROM event_teamleiter et
           JOIN users u ON et.user_id = u.id
           WHERE et.event_id = $1
           ORDER BY et.is_primary DESC, et.id ASC`,
          [task.event_id]
        );

        if (teamleiterResult.rows.length > 0) {
          // Finde den ersten Teamleiter mit gekoppeltem Signal-Account
          // (primärer Teamleiter wird bevorzugt durch ORDER BY)
          const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

          if (linkedTeamleiter) {
            const fromNumber = linkedTeamleiter.signal_account_number;
            const toNumber = user.signal_phone_number;

            // Beschreibung hinzufügen
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

            const signalMessage = `${title}\n\n${task.title}${description}${timeInfo}\n\n🎪 ${instance.event_name}`;

            const signalSent = await signalService.sendMessage(fromNumber, toNumber, signalMessage);

            if (signalSent) {
              console.log(`[sendTaskNotification] ✓ Signal message sent to ${toNumber} from teamleiter ${linkedTeamleiter.id}`);
            }
          } else {
            console.log(`[sendTaskNotification] No linked Signal account found for event ${task.event_id} teamleiter`);
          }
        } else {
          console.log(`[sendTaskNotification] No teamleiter found for event ${task.event_id}`);
        }
      } catch (error) {
        console.error('Signal notification error:', error);
      }
    }
  } catch (error) {
    console.error('Send task notification error:', error);
  }
}

async function sendStartTimeNotification(userId: number, task: any, instance: any) {
  try {
    // Hole User-Settings für Web Push und Signal
    const userResult = await query(
      `SELECT u.web_push_enabled, u.signal_enabled, u.signal_phone_number, u.start_notification_enabled
       FROM users u
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log(`[sendStartTimeNotification] User ${userId} not found`);
      return;
    }

    const user = userResult.rows[0];

    // Prüfen ob Start-Benachrichtigungen aktiviert sind
    if (!user.start_notification_enabled) {
      console.log(`[sendStartTimeNotification] Start notifications disabled for user ${userId}`);
      return;
    }

    const title = 'Aufgabe startet jetzt!';
    const body = `Es ist Zeit zu starten: ${task.title}`;

    // 1. Web Push Notifications (wenn aktiviert)
    if (user.web_push_enabled !== false) {
      const subscriptions = await query(
        `SELECT ps.* FROM push_subscriptions ps
         WHERE ps.user_id = $1`,
        [userId]
      );

      console.log(`[sendStartTimeNotification] Found ${subscriptions.rows.length} web push subscriptions for user ${userId}`);

      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon.png',
        badge: '/badge.png',
        tag: `task-start-${task.id}-${instance.id}`,
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: true,
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

          console.log(`[sendStartTimeNotification] ✓ Web Push sent to user ${userId} for task "${task.title}"`);
        } catch (error: any) {
          console.error('Push notification error:', error);

          // Subscription entfernen wenn ungültig
          if (error.statusCode === 410) {
            await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
          }
        }
      }
    }

    // 2. Signal Notifications (wenn aktiviert)
    if (user.signal_enabled && user.signal_phone_number) {
      try {
        // Finde alle Teamleiter des Events
        const teamleiterResult = await query(
          `SELECT u.id, u.signal_account_number, u.signal_linked, et.is_primary
           FROM event_teamleiter et
           JOIN users u ON et.user_id = u.id
           WHERE et.event_id = $1
           ORDER BY et.is_primary DESC, et.id ASC`,
          [task.event_id]
        );

        if (teamleiterResult.rows.length > 0) {
          const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

          if (linkedTeamleiter) {
            const fromNumber = linkedTeamleiter.signal_account_number;
            const toNumber = user.signal_phone_number;

            // Beschreibung hinzufügen
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

            const signalMessage = `${title}\n\n${task.title}${description}${timeInfo}\n\n🎪 ${instance.event_name}`;

            const signalSent = await signalService.sendMessage(fromNumber, toNumber, signalMessage);

            if (signalSent) {
              console.log(`[sendStartTimeNotification] ✓ Signal message sent to ${toNumber} from teamleiter ${linkedTeamleiter.id}`);
            }
          } else {
            console.log(`[sendStartTimeNotification] No linked Signal account found for event ${task.event_id} teamleiter`);
          }
        } else {
          console.log(`[sendStartTimeNotification] No teamleiter found for event ${task.event_id}`);
        }
      } catch (error) {
        console.error('Signal notification error:', error);
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
    `SELECT ei.*, e.days, e.name as event_name
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

        // Sende Benachrichtigungen (Web Push + Signal) an zugewiesene Mitarbeiter
        if (task.user_id) {
          // Hole User-Settings
          const userResult = await query(
            `SELECT u.web_push_enabled, u.signal_enabled, u.signal_phone_number
             FROM users u
             WHERE u.id = $1`,
            [task.user_id]
          );

          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];

            const title = 'Aufgabe überfällig';
            const body = `"${task.title}" ist jetzt überfällig`;

            // 1. Web Push
            if (user.web_push_enabled !== false) {
              const subscriptions = await query(
                `SELECT ps.* FROM push_subscriptions ps
                 WHERE ps.user_id = $1`,
                [task.user_id]
              );

              const payload = JSON.stringify({
                title,
                body,
                icon: '/icon.png',
                badge: '/badge.png',
                tag: `task-overdue-${task.id}`,
                vibrate: [500, 200, 500],
                requireInteraction: true,
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
                  console.log(`[updateOverdueTasks] ✓ Web Push sent to user ${task.user_id}`);
                } catch (error: any) {
                  console.error('Push notification error:', error);
                  if (error.statusCode === 410) {
                    await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
                  }
                }
              }
            }

            // 2. Signal
            if (user.signal_enabled && user.signal_phone_number) {
              try {
                const teamleiterResult = await query(
                  `SELECT u.id, u.signal_account_number, u.signal_linked, et.is_primary
                   FROM event_teamleiter et
                   JOIN users u ON et.user_id = u.id
                   WHERE et.event_id = $1
                   ORDER BY et.is_primary DESC, et.id ASC`,
                  [task.event_id]
                );

                if (teamleiterResult.rows.length > 0) {
                  const linkedTeamleiter = teamleiterResult.rows.find(tl => tl.signal_linked);

                  if (linkedTeamleiter) {
                    // Zeit-Informationen formatieren
                    let timeInfo = '';
                    if (task.scheduled_time || task.start_time) {
                      timeInfo += '\n\n';
                      if (task.scheduled_time) timeInfo += `⏰ Geplant: ${task.scheduled_time} Uhr\n`;
                      if (task.start_time) timeInfo += `🚀 Start: ${task.start_time} Uhr\n`;
                      if (task.end_time) timeInfo += `🏁 Ende: ${task.end_time} Uhr`;
                    } else if (task.end_time) {
                      timeInfo += `\n\n🏁 Ende: ${task.end_time} Uhr`;
                    }

                    const signalMessage = `${title}\n\n${task.title}${timeInfo}\n\n🎪 ${instance.event_name}`;
                    const signalSent = await signalService.sendMessage(
                      linkedTeamleiter.signal_account_number,
                      user.signal_phone_number,
                      signalMessage
                    );

                    if (signalSent) {
                      console.log(`[updateOverdueTasks] ✓ Signal sent to ${user.signal_phone_number}`);
                    }
                  }
                }
              } catch (error) {
                console.error('Signal notification error:', error);
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
