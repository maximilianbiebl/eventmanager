import express from 'express';
import cors from 'cors';
import config from './config';
import { startNotificationScheduler } from './services/notificationScheduler';
import webpush from 'web-push';

// Routes
import authRoutes from './routes/auth';
import eventsRoutes from './routes/events';
import tasksRoutes from './routes/tasks';
import programRoutes from './routes/program';
import usersRoutes from './routes/users';
import notificationsRoutes from './routes/notifications';

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

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Interner Server Fehler' });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Konfiguration geladen von: ${process.env.CONFIG_PATH || 'config.json'}`);

  // Notification Scheduler starten
  startNotificationScheduler();
});

export default app;
