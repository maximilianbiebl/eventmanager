import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, adminMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { CreateEventRequest } from '../types';
import { broadcastUpdate } from './sse';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Alle Events abrufen (rollenbasiert)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    let result;

    if (userRole === 'admin') {
      // Admin sieht alle Events
      result = await query(`
        SELECT e.*, u.name as creator_name
        FROM events e
        LEFT JOIN users u ON e.created_by = u.id
        ORDER BY e.is_template DESC, e.start_date DESC
      `);
    } else if (userRole === 'teamleiter') {
      // Teamleiter sieht nur Vorlagen und eigene Events
      result = await query(`
        SELECT e.*, u.name as creator_name
        FROM events e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.is_template = true OR e.created_by = $1
        ORDER BY e.is_template DESC, e.start_date DESC
      `, [userId]);
    } else {
      // Staff sieht keine Events in der Verwaltung
      result = { rows: [] };
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event mit Details abrufen
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Event Basis-Daten
    const eventResult = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const event = eventResult.rows[0];

    // Event Instanzen
    const instancesResult = await query(
      'SELECT * FROM event_instances WHERE event_id = $1 ORDER BY instance_number',
      [id]
    );

    // Programmpunkte
    const programResult = await query(
      'SELECT * FROM program_items WHERE event_id = $1 ORDER BY day_number, time',
      [id]
    );

    // Aufgaben
    const tasksResult = await query(
      'SELECT * FROM tasks WHERE event_id = $1 ORDER BY day_number, scheduled_time',
      [id]
    );

    res.json({
      ...event,
      instances: instancesResult.rows,
      program_items: programResult.rows,
      tasks: tasksResult.rows,
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event-Instanzen abrufen
router.get('/:eventId/instances', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    const instancesResult = await query(
      'SELECT * FROM event_instances WHERE event_id = $1 ORDER BY instance_number',
      [eventId]
    );

    res.json(instancesResult.rows);
  } catch (error) {
    console.error('Get event instances error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event erstellen
router.post('/', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description, start_date, days, instance_count, is_template, co_teamleiter_ids } = req.body as CreateEventRequest;

    // Nur Admin kann Vorlagen erstellen
    const templateValue = (req.user!.role === 'admin' && is_template) ? true : false;

    // Event erstellen
    const eventResult = await query(
      'INSERT INTO events (name, description, start_date, days, created_by, is_template) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, start_date, days, req.user!.id, templateValue]
    );

    const event = eventResult.rows[0];

    // Ersteller als primären Teamleiter hinzufügen
    await query(
      'INSERT INTO event_teamleiter (event_id, user_id, is_primary) VALUES ($1, $2, $3)',
      [event.id, req.user!.id, true]
    );

    // Ersteller zu event_staff hinzufügen
    await query(
      'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2)',
      [event.id, req.user!.id]
    );

    // Co-Teamleiter hinzufügen (falls vorhanden)
    if (co_teamleiter_ids && Array.isArray(co_teamleiter_ids) && co_teamleiter_ids.length > 0) {
      for (const coTeamleiterId of co_teamleiter_ids) {
        // Als Co-Teamleiter hinzufügen
        await query(
          'INSERT INTO event_teamleiter (event_id, user_id, is_primary) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING',
          [event.id, coTeamleiterId, false]
        );

        // Zu event_staff hinzufügen
        await query(
          'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING',
          [event.id, coTeamleiterId]
        );
      }
    }

    // Event Instanzen erstellen
    const instances = [];
    for (let i = 0; i < instance_count; i++) {
      const instanceStartDate = new Date(start_date);
      instanceStartDate.setDate(instanceStartDate.getDate() + i * days);

      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [event.id, i + 1, instanceStartDate.toISOString().split('T')[0]]
      );

      instances.push(instanceResult.rows[0]);
    }

    // SSE Update senden
    broadcastUpdate('event', { action: 'event_created', eventId: event.id });

    res.status(201).json({
      ...event,
      instances,
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event aktualisieren
router.put('/:id', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, start_date, days, is_template } = req.body;

    // Event prüfen
    const eventCheck = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const event = eventCheck.rows[0];

    // Teamleiter dürfen nur ihre eigenen Events bearbeiten
    if (req.user!.role === 'teamleiter' && event.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Event' });
    }

    // Nur Admin kann Template-Status ändern
    const templateValue = req.user!.role === 'admin' && is_template !== undefined ? is_template : event.is_template;

    const result = await query(
      'UPDATE events SET name = $1, description = $2, start_date = $3, days = $4, is_template = $5 WHERE id = $6 RETURNING *',
      [name, description, start_date, days, templateValue, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event zu Vorlage machen oder umgekehrt (nur Admin)
router.put('/:id/toggle-template', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { is_template } = req.body;

    const result = await query(
      'UPDATE events SET is_template = $1 WHERE id = $2 RETURNING *',
      [is_template, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    // SSE Broadcast für instant updates
    broadcastUpdate('event', { action: 'template_toggled', eventId: id, isTemplate: is_template });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle template error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Vorlage verwenden und neue Veranstaltung erstellen
router.post('/:id/create-from-template', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, start_date, instance_count, days, co_teamleiter_ids } = req.body;

    // Prüfen ob Template existiert
    const templateResult = await query('SELECT * FROM events WHERE id = $1 AND is_template = true', [id]);

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vorlage nicht gefunden' });
    }

    const template = templateResult.rows[0];

    // Tage aus request oder von Vorlage
    const eventDays = days || template.days;

    // Neues Event erstellen (keine Vorlage)
    const newEventResult = await query(
      'INSERT INTO events (name, description, start_date, days, created_by, is_template) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, template.description, start_date, eventDays, req.user!.id, false]
    );

    const newEvent = newEventResult.rows[0];

    // Ersteller als primären Teamleiter hinzufügen
    await query(
      'INSERT INTO event_teamleiter (event_id, user_id, is_primary) VALUES ($1, $2, $3)',
      [newEvent.id, req.user!.id, true]
    );

    // Ersteller zu event_staff hinzufügen
    await query(
      'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2)',
      [newEvent.id, req.user!.id]
    );

    // Co-Teamleiter hinzufügen (falls vorhanden)
    if (co_teamleiter_ids && Array.isArray(co_teamleiter_ids) && co_teamleiter_ids.length > 0) {
      for (const coTeamleiterId of co_teamleiter_ids) {
        // Als Co-Teamleiter hinzufügen
        await query(
          'INSERT INTO event_teamleiter (event_id, user_id, is_primary) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING',
          [newEvent.id, coTeamleiterId, false]
        );

        // Zu event_staff hinzufügen
        await query(
          'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING',
          [newEvent.id, coTeamleiterId]
        );
      }
    }

    // Event Instanzen erstellen
    const instanceCountToCreate = instance_count || 1;
    const instances = [];
    for (let i = 0; i < instanceCountToCreate; i++) {
      const instanceStartDate = new Date(start_date);
      instanceStartDate.setDate(instanceStartDate.getDate() + i * eventDays);

      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [newEvent.id, i + 1, instanceStartDate.toISOString().split('T')[0]]
      );

      instances.push(instanceResult.rows[0]);
    }

    // Programmpunkte von der Vorlage kopieren mit Bulk INSERT
    const templateProgram = await query('SELECT * FROM program_items WHERE event_id = $1 ORDER BY id', [id]);
    const programItemIdMap = new Map<number, number>();

    if (templateProgram.rows.length > 0) {
      const programValues = templateProgram.rows.map((p, idx) =>
        `($1, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, $${idx * 4 + 5})`
      ).join(', ');
      const programParams = [newEvent.id];
      templateProgram.rows.forEach(p => {
        programParams.push(p.day_number, p.time, p.title, p.description);
      });

      const newProgramItems = await query(
        `INSERT INTO program_items (event_id, day_number, time, title, description)
         VALUES ${programValues} RETURNING id`,
        programParams
      );

      templateProgram.rows.forEach((program, idx) => {
        programItemIdMap.set(program.id, newProgramItems.rows[idx].id);
      });
    }

    // Alle Tasks von der Vorlage kopieren mit Bulk INSERT
    const templateTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [id]);

    if (templateTasks.rows.length > 0) {
      const taskValues = templateTasks.rows.map((t, idx) => {
        const baseIdx = idx * 12 + 2;
        return `($1, $${baseIdx}, $${baseIdx+1}, $${baseIdx+2}, $${baseIdx+3}, $${baseIdx+4}, $${baseIdx+5}, $${baseIdx+6}, $${baseIdx+7}, $${baseIdx+8}, $${baseIdx+9}, $${baseIdx+10}, $${baseIdx+11})`;
      }).join(', ');

      const taskParams = [newEvent.id];
      templateTasks.rows.forEach(task => {
        const newProgramItemId = task.program_item_id ? programItemIdMap.get(task.program_item_id) : null;
        taskParams.push(
          newProgramItemId || null,
          task.day_number,
          task.title,
          task.description,
          task.scheduled_time,
          task.start_time,
          task.end_time,
          task.reminder_minutes,
          task.is_public,
          'not_started',
          task.is_active !== undefined ? task.is_active : true,
          task.sort_order || 0
        );
      });

      await query(
        `INSERT INTO tasks (
          event_id, program_item_id, day_number, title, description,
          scheduled_time, start_time, end_time, reminder_minutes, is_public, status, is_active, sort_order
        ) VALUES ${taskValues}`,
        taskParams
      );
    }

    // SSE Broadcast für instant updates
    broadcastUpdate('event', { action: 'event_created', eventId: newEvent.id, fromTemplate: id });

    res.status(201).json({
      ...newEvent,
      instances,
      message: 'Event erfolgreich aus Vorlage erstellt',
    });
  } catch (error) {
    console.error('Create from template error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event als Vorlage kopieren (Admin only) - erstellt Kopie ohne Zuweisungen/Datum
router.post('/:id/copy-to-template', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Original Event abrufen
    const originalEvent = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (originalEvent.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const original = originalEvent.rows[0];

    // Vorlage erstellen (ohne Datum, ohne Zuweisungen)
    const templateResult = await query(
      'INSERT INTO events (name, description, start_date, days, created_by, is_template, is_template_suggestion) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [original.name, original.description, null, original.days, req.user!.id, true, false]
    );

    const template = templateResult.rows[0];

    // Event Instanzen erstellen (wie bei duplicate, damit Frontend Tasks anzeigen kann)
    const instanceCountToCreate = 1; // Vorlagen bekommen 1 Instanz mit null start_date
    const instances = [];
    for (let i = 0; i < instanceCountToCreate; i++) {
      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [template.id, i + 1, null] // null als start_date für Vorlagen
      );
      instances.push(instanceResult.rows[0]);
    }

    // Programmpunkte kopieren mit Bulk INSERT
    const originalProgram = await query('SELECT * FROM program_items WHERE event_id = $1 ORDER BY id', [id]);
    console.log(`Copy to template: Found ${originalProgram.rows.length} program items for event ${id}`);
    const programItemIdMap = new Map<number, number>();

    if (originalProgram.rows.length > 0) {
      // Bulk INSERT für Programmpunkte
      const programValues = originalProgram.rows.map((p, idx) =>
        `($1, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, $${idx * 4 + 5})`
      ).join(', ');
      const programParams = [template.id];
      originalProgram.rows.forEach(p => {
        programParams.push(p.day_number, p.time, p.title, p.description);
      });

      const newProgramItems = await query(
        `INSERT INTO program_items (event_id, day_number, time, title, description)
         VALUES ${programValues} RETURNING id`,
        programParams
      );

      // ID-Mapping erstellen (Reihenfolge ist garantiert gleich)
      originalProgram.rows.forEach((program, idx) => {
        programItemIdMap.set(program.id, newProgramItems.rows[idx].id);
      });
    }

    // Alle Tasks kopieren mit Bulk INSERT
    const originalTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [id]);
    console.log(`Copy to template: Found ${originalTasks.rows.length} tasks for event ${id}`);

    if (originalTasks.rows.length > 0) {
      // Bulk INSERT für Tasks
      const taskValues = originalTasks.rows.map((t, idx) => {
        const baseIdx = idx * 12 + 2;
        return `($1, $${baseIdx}, $${baseIdx+1}, $${baseIdx+2}, $${baseIdx+3}, $${baseIdx+4}, $${baseIdx+5}, $${baseIdx+6}, $${baseIdx+7}, $${baseIdx+8}, $${baseIdx+9}, $${baseIdx+10}, $${baseIdx+11})`;
      }).join(', ');

      const taskParams = [template.id];
      originalTasks.rows.forEach(task => {
        const newProgramItemId = task.program_item_id ? programItemIdMap.get(task.program_item_id) : null;
        taskParams.push(
          newProgramItemId || null,
          task.day_number,
          task.title,
          task.description,
          task.scheduled_time,
          task.start_time,
          task.end_time,
          task.reminder_minutes,
          task.is_public,
          'not_started',
          task.is_active !== undefined ? task.is_active : true,
          task.sort_order || 0
        );
      });

      await query(
        `INSERT INTO tasks (
          event_id, program_item_id, day_number, title, description,
          scheduled_time, start_time, end_time, reminder_minutes, is_public, status, is_active, sort_order
        ) VALUES ${taskValues}`,
        taskParams
      );
    }

    // Prüfe ob Daten tatsächlich kopiert wurden
    const verifyTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [template.id]);
    const verifyProgram = await query('SELECT * FROM program_items WHERE event_id = $1', [template.id]);
    console.log(`Verification: Template ${template.id} has ${verifyTasks.rows.length} tasks and ${verifyProgram.rows.length} program items`);

    // SSE Broadcast für instant updates
    broadcastUpdate('event', { action: 'template_created', eventId: template.id });

    res.status(201).json({
      ...template,
      message: 'Event erfolgreich als Vorlage kopiert',
      debug: {
        copiedTasks: verifyTasks.rows.length,
        copiedProgram: verifyProgram.rows.length
      }
    });
  } catch (error) {
    console.error('Copy to template error:', error);
    res.status(500).json({ error: 'Server Fehler', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Event als Vorlagenvorschlag markieren (Teamleiter)
router.put('/:id/suggest-as-template', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Event prüfen
    const eventCheck = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const event = eventCheck.rows[0];

    // Teamleiter können nur eigene Events vorschlagen
    if (req.user!.role === 'teamleiter' && event.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Event' });
    }

    const result = await query(
      'UPDATE events SET is_template_suggestion = $1 WHERE id = $2 RETURNING *',
      [true, id]
    );

    // SSE Broadcast für instant updates
    broadcastUpdate('event', { action: 'template_suggested', eventId: id });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Suggest as template error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Vorlagenvorschlag genehmigen (Admin) - kopiert zu Vorlage
router.post('/:id/approve-suggestion', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Event prüfen
    const originalEvent = await query('SELECT * FROM events WHERE id = $1 AND is_template_suggestion = true', [id]);

    if (originalEvent.rows.length === 0) {
      return res.status(404).json({ error: 'Vorlagenvorschlag nicht gefunden' });
    }

    const original = originalEvent.rows[0];

    // Vorlage erstellen
    const templateResult = await query(
      'INSERT INTO events (name, description, start_date, days, created_by, is_template, is_template_suggestion) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [original.name, original.description, null, original.days, req.user!.id, true, false]
    );

    const template = templateResult.rows[0];

    // Event Instanzen erstellen (wie bei duplicate, damit Frontend Tasks anzeigen kann)
    const instanceCountToCreate = 1; // Vorlagen bekommen 1 Instanz mit null start_date
    const instances = [];
    for (let i = 0; i < instanceCountToCreate; i++) {
      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [template.id, i + 1, null] // null als start_date für Vorlagen
      );
      instances.push(instanceResult.rows[0]);
    }

    // Programmpunkte kopieren mit Bulk INSERT
    const originalProgram = await query('SELECT * FROM program_items WHERE event_id = $1 ORDER BY id', [id]);
    console.log(`Approve suggestion: Found ${originalProgram.rows.length} program items for event ${id}`);
    const programItemIdMap = new Map<number, number>();

    if (originalProgram.rows.length > 0) {
      const programValues = originalProgram.rows.map((p, idx) =>
        `($1, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, $${idx * 4 + 5})`
      ).join(', ');
      const programParams = [template.id];
      originalProgram.rows.forEach(p => {
        programParams.push(p.day_number, p.time, p.title, p.description);
      });

      const newProgramItems = await query(
        `INSERT INTO program_items (event_id, day_number, time, title, description)
         VALUES ${programValues} RETURNING id`,
        programParams
      );

      originalProgram.rows.forEach((program, idx) => {
        programItemIdMap.set(program.id, newProgramItems.rows[idx].id);
      });
    }

    // Tasks kopieren mit Bulk INSERT
    const originalTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [id]);
    console.log(`Approve suggestion: Found ${originalTasks.rows.length} tasks for event ${id}`);

    if (originalTasks.rows.length > 0) {
      const taskValues = originalTasks.rows.map((t, idx) => {
        const baseIdx = idx * 12 + 2;
        return `($1, $${baseIdx}, $${baseIdx+1}, $${baseIdx+2}, $${baseIdx+3}, $${baseIdx+4}, $${baseIdx+5}, $${baseIdx+6}, $${baseIdx+7}, $${baseIdx+8}, $${baseIdx+9}, $${baseIdx+10}, $${baseIdx+11})`;
      }).join(', ');

      const taskParams = [template.id];
      originalTasks.rows.forEach(task => {
        const newProgramItemId = task.program_item_id ? programItemIdMap.get(task.program_item_id) : null;
        taskParams.push(
          newProgramItemId || null,
          task.day_number,
          task.title,
          task.description,
          task.scheduled_time,
          task.start_time,
          task.end_time,
          task.reminder_minutes,
          task.is_public,
          'not_started',
          task.is_active !== undefined ? task.is_active : true,
          task.sort_order || 0
        );
      });

      await query(
        `INSERT INTO tasks (
          event_id, program_item_id, day_number, title, description,
          scheduled_time, start_time, end_time, reminder_minutes, is_public, status, is_active, sort_order
        ) VALUES ${taskValues}`,
        taskParams
      );
    }

    // Prüfe ob Daten tatsächlich kopiert wurden
    const verifyTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [template.id]);
    const verifyProgram = await query('SELECT * FROM program_items WHERE event_id = $1', [template.id]);
    console.log(`Verification: Template ${template.id} has ${verifyTasks.rows.length} tasks and ${verifyProgram.rows.length} program items`);

    // Vorschlag-Flag beim Original entfernen
    await query('UPDATE events SET is_template_suggestion = false WHERE id = $1', [id]);

    // SSE Broadcast für instant updates
    broadcastUpdate('event', { action: 'suggestion_approved', originalEventId: id, templateId: template.id });

    res.status(201).json({
      ...template,
      message: 'Vorlagenvorschlag wurde genehmigt und Vorlage erstellt',
      debug: {
        copiedTasks: verifyTasks.rows.length,
        copiedProgram: verifyProgram.rows.length
      }
    });
  } catch (error) {
    console.error('Approve suggestion error:', error);
    res.status(500).json({ error: 'Server Fehler', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Event duplizieren
router.post('/:id/duplicate', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, start_date, instance_count } = req.body;

    // Original Event abrufen
    const originalEvent = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (originalEvent.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const original = originalEvent.rows[0];

    // Prüfen ob Teamleiter nur eigene Events duplizieren darf
    if (req.user!.role === 'teamleiter' && original.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Event' });
    }

    // Neues Event erstellen (behält Template-Status bei wenn Admin, sonst normales Event)
    const isTemplate = req.user!.role === 'admin' ? original.is_template : false;

    const newEventResult = await query(
      'INSERT INTO events (name, description, start_date, days, created_by, is_template) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name || `${original.name} (Kopie)`, original.description, start_date || original.start_date, original.days, req.user!.id, isTemplate]
    );

    const newEvent = newEventResult.rows[0];

    // Event Instanzen erstellen
    const instanceCountToCreate = instance_count || 1;
    const instances = [];
    for (let i = 0; i < instanceCountToCreate; i++) {
      const instanceStartDate = new Date(start_date || original.start_date);
      instanceStartDate.setDate(instanceStartDate.getDate() + i * original.days);

      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [newEvent.id, i + 1, instanceStartDate.toISOString().split('T')[0]]
      );

      instances.push(instanceResult.rows[0]);
    }

    // Programmpunkte kopieren mit Bulk INSERT
    const originalProgram = await query('SELECT * FROM program_items WHERE event_id = $1 ORDER BY id', [id]);
    const programItemIdMap = new Map<number, number>();

    if (originalProgram.rows.length > 0) {
      const programValues = originalProgram.rows.map((p, idx) =>
        `($1, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, $${idx * 4 + 5})`
      ).join(', ');
      const programParams = [newEvent.id];
      originalProgram.rows.forEach(p => {
        programParams.push(p.day_number, p.time, p.title, p.description);
      });

      const newProgramItems = await query(
        `INSERT INTO program_items (event_id, day_number, time, title, description)
         VALUES ${programValues} RETURNING id`,
        programParams
      );

      originalProgram.rows.forEach((program, idx) => {
        programItemIdMap.set(program.id, newProgramItems.rows[idx].id);
      });
    }

    // Alle Tasks kopieren mit Bulk INSERT
    const originalTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [id]);

    if (originalTasks.rows.length > 0) {
      const taskValues = originalTasks.rows.map((t, idx) => {
        const baseIdx = idx * 12 + 2;
        return `($1, $${baseIdx}, $${baseIdx+1}, $${baseIdx+2}, $${baseIdx+3}, $${baseIdx+4}, $${baseIdx+5}, $${baseIdx+6}, $${baseIdx+7}, $${baseIdx+8}, $${baseIdx+9}, $${baseIdx+10}, $${baseIdx+11})`;
      }).join(', ');

      const taskParams = [newEvent.id];
      originalTasks.rows.forEach(task => {
        const newProgramItemId = task.program_item_id ? programItemIdMap.get(task.program_item_id) : null;
        taskParams.push(
          newProgramItemId || null,
          task.day_number,
          task.title,
          task.description,
          task.scheduled_time,
          task.start_time,
          task.end_time,
          task.reminder_minutes,
          task.is_public,
          'not_started', // Reset status for new event
          task.is_active !== undefined ? task.is_active : true,
          task.sort_order || 0
        );
      });

      await query(
        `INSERT INTO tasks (
          event_id, program_item_id, day_number, title, description,
          scheduled_time, start_time, end_time, reminder_minutes, is_public, status, is_active, sort_order
        ) VALUES ${taskValues}`,
        taskParams
      );
    }

    res.status(201).json({
      ...newEvent,
      instances,
      message: 'Event erfolgreich dupliziert',
    });
  } catch (error) {
    console.error('Duplicate event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Event löschen
router.delete('/:id', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Event prüfen
    const eventCheck = await query('SELECT * FROM events WHERE id = $1', [id]);

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }

    const event = eventCheck.rows[0];

    // Teamleiter dürfen nur ihre eigenen Events löschen
    if (req.user!.role === 'teamleiter' && event.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Event' });
    }

    // Teamleiter dürfen vorgeschlagene Events nicht löschen
    if (req.user!.role === 'teamleiter' && event.is_template_suggestion) {
      return res.status(403).json({ error: 'Vorgeschlagene Events können nicht gelöscht werden' });
    }

    const result = await query('DELETE FROM events WHERE id = $1 RETURNING *', [id]);

    res.json({ message: 'Event gelöscht' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Bulk Delete Events
router.post('/bulk-delete', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Keine IDs angegeben' });
    }

    // Check permissions for each event
    for (const id of ids) {
      const eventCheck = await query('SELECT * FROM events WHERE id = $1', [id]);
      if (eventCheck.rows.length === 0) continue;

      const event = eventCheck.rows[0];

      // Teamleiter dürfen nur ihre eigenen Events löschen
      if (req.user!.role === 'teamleiter' && event.created_by !== req.user!.id) {
        return res.status(403).json({ error: 'Keine Berechtigung für alle ausgewählten Events' });
      }

      // Teamleiter dürfen vorgeschlagene Events nicht löschen
      if (req.user!.role === 'teamleiter' && event.is_template_suggestion) {
        return res.status(403).json({ error: 'Vorgeschlagene Events können nicht gelöscht werden' });
      }
    }

    // Delete all events
    await query('DELETE FROM events WHERE id = ANY($1)', [ids]);

    res.json({ message: `${ids.length} Events gelöscht`, deleted: ids.length });
  } catch (error) {
    console.error('Bulk delete events error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Bulk Approve Suggestions
router.post('/bulk-approve-suggestions', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Keine IDs angegeben' });
    }

    const createdTemplates = [];

    for (const id of ids) {
      // Event prüfen
      const originalEvent = await query('SELECT * FROM events WHERE id = $1 AND is_template_suggestion = true', [id]);

      if (originalEvent.rows.length === 0) continue;

      const original = originalEvent.rows[0];

      // Vorlage erstellen
      const templateResult = await query(
        'INSERT INTO events (name, description, start_date, days, created_by, is_template, is_template_suggestion) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [original.name, original.description, null, original.days, req.user!.id, true, false]
      );

      const template = templateResult.rows[0];

      // Event Instanzen erstellen
      const instanceResult = await query(
        'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3) RETURNING *',
        [template.id, 1, null]
      );

      // Programmpunkte kopieren
      const originalProgram = await query('SELECT * FROM program_items WHERE event_id = $1 ORDER BY id', [id]);
      const programItemIdMap = new Map<number, number>();

      if (originalProgram.rows.length > 0) {
        const programValues = originalProgram.rows.map((p, idx) =>
          `($1, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, $${idx * 4 + 5})`
        ).join(', ');
        const programParams = [template.id];
        originalProgram.rows.forEach(p => {
          programParams.push(p.day_number, p.time, p.title, p.description);
        });

        const newProgramItems = await query(
          `INSERT INTO program_items (event_id, day_number, time, title, description)
           VALUES ${programValues} RETURNING id`,
          programParams
        );

        originalProgram.rows.forEach((program, idx) => {
          programItemIdMap.set(program.id, newProgramItems.rows[idx].id);
        });
      }

      // Tasks kopieren
      const originalTasks = await query('SELECT * FROM tasks WHERE event_id = $1', [id]);

      if (originalTasks.rows.length > 0) {
        const taskValues = originalTasks.rows.map((t, idx) => {
          const baseIdx = idx * 12 + 2;
          return `($1, $${baseIdx}, $${baseIdx+1}, $${baseIdx+2}, $${baseIdx+3}, $${baseIdx+4}, $${baseIdx+5}, $${baseIdx+6}, $${baseIdx+7}, $${baseIdx+8}, $${baseIdx+9}, $${baseIdx+10}, $${baseIdx+11})`;
        }).join(', ');

        const taskParams = [template.id];
        originalTasks.rows.forEach(task => {
          const newProgramItemId = task.program_item_id ? programItemIdMap.get(task.program_item_id) : null;
          taskParams.push(
            newProgramItemId || null,
            task.day_number,
            task.title,
            task.description,
            task.scheduled_time,
            task.start_time,
            task.end_time,
            task.reminder_minutes,
            task.is_public,
            'not_started',
            task.is_active !== undefined ? task.is_active : true,
            task.sort_order || 0
          );
        });

        await query(
          `INSERT INTO tasks (
            event_id, program_item_id, day_number, title, description,
            scheduled_time, start_time, end_time, reminder_minutes, is_public, status, is_active, sort_order
          ) VALUES ${taskValues}`,
          taskParams
        );
      }

      // Vorschlag-Flag beim Original entfernen
      await query('UPDATE events SET is_template_suggestion = false WHERE id = $1', [id]);

      createdTemplates.push(template);
    }

    broadcastUpdate('event', { action: 'bulk_suggestions_approved', count: createdTemplates.length });

    res.status(201).json({
      message: `${createdTemplates.length} Vorschläge genehmigt`,
      templates: createdTemplates,
    });
  } catch (error) {
    console.error('Bulk approve suggestions error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// CSV Export Events
router.post('/export-csv', authMiddleware, teamleiterOrAdminMiddleware, async (req, res) => {
  try {
    const { ids, withTasks } = req.body;

    let result;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      result = await query('SELECT id, name, description, start_date, days, is_template FROM events WHERE id = ANY($1) ORDER BY name', [ids]);
    } else {
      result = await query('SELECT id, name, description, start_date, days, is_template FROM events ORDER BY name');
    }

    if (withTasks) {
      // Export as two CSV files (events and tasks)
      const dateStr = new Date().toISOString().split('T')[0];

      // Create Events CSV
      const eventsHeaders = ['id', 'name', 'description', 'start_date', 'days', 'is_template'];
      const eventsRows = result.rows.map(row =>
        `${row.id},"${row.name}","${row.description || ''}",${row.start_date || ''},${row.days},${row.is_template}`
      );
      const eventsCSV = [eventsHeaders.join(','), ...eventsRows].join('\n');

      // Create Tasks CSV (for all events)
      const eventIds = result.rows.map(e => e.id);
      let tasksCSV = '';
      if (eventIds.length > 0) {
        const tasksResult = await query(
          'SELECT event_id, title, description, day_number, scheduled_time, start_time, end_time, is_public FROM tasks WHERE event_id = ANY($1) ORDER BY event_id, day_number, sort_order',
          [eventIds]
        );
        const tasksHeaders = ['event_id', 'title', 'description', 'day_number', 'scheduled_time', 'start_time', 'end_time', 'is_public'];
        const tasksRows = tasksResult.rows.map(row =>
          `${row.event_id},"${row.title}","${row.description || ''}",${row.day_number},"${row.scheduled_time || ''}","${row.start_time || ''}","${row.end_time || ''}",${row.is_public}`
        );
        tasksCSV = [tasksHeaders.join(','), ...tasksRows].join('\n');
      }

      // Send both CSVs as JSON response
      res.json({
        type: 'multi-csv',
        files: [
          {
            name: `events_${dateStr}.csv`,
            content: eventsCSV,
            mimeType: 'text/csv'
          },
          {
            name: `tasks_${dateStr}.csv`,
            content: tasksCSV,
            mimeType: 'text/csv'
          }
        ]
      });
    } else {
      // Create CSV (events only)
      const headers = ['id', 'name', 'description', 'start_date', 'days', 'is_template'];
      const rows = result.rows.map(row =>
        `${row.id},"${row.name}","${row.description || ''}",${row.start_date || ''},${row.days},${row.is_template}`
      );
      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=events_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    }
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// CSV Import Events
router.post('/import-csv', authMiddleware, teamleiterOrAdminMiddleware, upload.fields([{ name: 'file' }, { name: 'tasksFile' }]), async (req: AuthRequest, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files || !files.file || !files.file[0]) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const eventsFile = files.file[0];
    const tasksFile = files.tasksFile ? files.tasksFile[0] : null;

    // Check if import as template is requested via query param
    const forceAsTemplate = req.query.asTemplate === 'true';

    const csvText = eventsFile.buffer.toString('utf-8');
    const lines = csvText.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV ist leer oder ungültig' });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    let imported = 0;
    const eventIdMapping: { [oldId: string]: number } = {}; // Map old ID to new ID

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

      const event: any = {};
      headers.forEach((header, idx) => {
        event[header] = values[idx];
      });

      // Save old ID for mapping
      const oldEventId = event.id;

      // Import as template if: query param set OR CSV field is true (admin only for CSV field)
      const isTemplate = forceAsTemplate || (event.is_template === 'true' && req.user!.role === 'admin');

      // Create new event
      const eventResult = await query(
        'INSERT INTO events (name, description, start_date, days, created_by, is_template) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [
          event.name,
          event.description || null,
          isTemplate ? null : (event.start_date || null), // Templates have no start date
          parseInt(event.days) || 1,
          req.user!.id,
          isTemplate
        ]
      );

      const newEvent = eventResult.rows[0];

      // Store mapping of old ID to new ID
      if (oldEventId) {
        eventIdMapping[oldEventId] = newEvent.id;
      }

      // Create event instances
      const instanceCount = 1;
      for (let j = 0; j < instanceCount; j++) {
        const startDate = event.start_date || null;
        await query(
          'INSERT INTO event_instances (event_id, instance_number, start_date) VALUES ($1, $2, $3)',
          [newEvent.id, j + 1, startDate]
        );
      }

      imported++;
    }

    // Import tasks if tasksFile is provided
    let tasksImported = 0;
    if (tasksFile) {
      const tasksCSVText = tasksFile.buffer.toString('utf-8');
      const tasksLines = tasksCSVText.split('\n').filter(line => line.trim());

      if (tasksLines.length >= 2) {
        const tasksHeaders = tasksLines[0].split(',').map(h => h.trim());

        for (let i = 1; i < tasksLines.length; i++) {
          // Parse CSV line with quoted strings
          const values: string[] = [];
          let currentValue = '';
          let inQuotes = false;

          for (let j = 0; j < tasksLines[i].length; j++) {
            const char = tasksLines[i][j];
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
          tasksHeaders.forEach((header, idx) => {
            task[header] = values[idx];
          });

          // Map old event_id to new event_id
          const oldEventId = task.event_id;
          const newEventId = eventIdMapping[oldEventId];

          if (newEventId) {
            // Insert task with new event_id
            await query(
              'INSERT INTO tasks (event_id, title, description, day_number, scheduled_time, start_time, end_time, is_public) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
              [
                newEventId,
                task.title,
                task.description || null,
                parseInt(task.day_number) || 1,
                task.scheduled_time || null,
                task.start_time || null,
                task.end_time || null,
                task.is_public === 'true'
              ]
            );
            tasksImported++;
          }
        }
      }
    }

    broadcastUpdate('event', { action: 'events_imported', count: imported });

    res.json({
      message: `${imported} Events${tasksImported > 0 ? ` und ${tasksImported} Aufgaben` : ''} importiert`,
      imported,
      tasksImported
    });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
