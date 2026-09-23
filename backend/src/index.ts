import express from 'express';
import cors from 'cors';
import config from './config';
import { startNotificationScheduler } from './services/notificationScheduler';
import { migriereBeimStart } from './database/migrationen';
import webpush from 'web-push';

// Routes
import authRoutes from './routes/auth';
import eventsRoutes from './routes/events';
import tasksRoutes from './routes/tasks';
import programRoutes from './routes/program';
import usersRoutes from './routes/users';
import notificationsRoutes from './routes/notifications';
import sseRoutes from './routes/sse';
import signalRoutes from './routes/signal';

const app = express();
const PORT = process.env.PORT || config.ports.backend;

// VAPID Keys konfigurieren
if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

// Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/program', programRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/signal', signalRoutes);

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Interner Server Fehler' });
});

// Server starten
app.listen(PORT, async () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Konfiguration geladen von: ${process.env.CONFIG_PATH || 'config.json'}`);

  /*
   * Offene Migrationen nachholen, bevor der Wecker loslaeuft.
   *
   * Eine vergessene Migration hat den Mitarbeiterbereich einmal
   * vollstaendig lahmgelegt: ohne task_assignments.reminder_at scheiterte
   * JEDER Abruf der eigenen Aufgaben. Siehe database/migrationen.
   */
  await migriereBeimStart();

  // Notification Scheduler starten
  startNotificationScheduler();
});

export default app;
