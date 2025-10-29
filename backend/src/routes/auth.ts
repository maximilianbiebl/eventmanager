import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../database/connection';
import config from '../config';
import { LoginRequest, LoginResponse } from '../types';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body as LoginRequest;

    // Benutzer finden
    const result = await query('SELECT * FROM users WHERE name = $1', [name]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    }

    const user = result.rows[0];

    // Passwort prüfen
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    }

    // JWT Token erstellen
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const response: LoginResponse = {
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Benutzer registrieren (nur für Admin)
router.post('/register', async (req, res) => {
  try {
    const { name, password, role = 'staff' } = req.body;

    // Prüfen ob Benutzer schon existiert
    const existing = await query('SELECT * FROM users WHERE name = $1', [name]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Benutzer existiert bereits' });
    }

    // Passwort hashen
    const passwordHash = await bcrypt.hash(password, 10);

    // Benutzer erstellen
    const result = await query(
      'INSERT INTO users (name, password_hash, role) VALUES ($1, $2, $3) RETURNING id, name, role',
      [name, passwordHash, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Admin: Reset user password (ohne altes Passwort)
router.put('/admin/reset-password/:userId', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Neues Passwort erforderlich' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen lang sein' });
    }

    // Benutzer laden
    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    // Neues Passwort hashen
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Passwort aktualisieren
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'Passwort wurde erfolgreich zurückgesetzt' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// Passwort ändern
router.put('/change-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
    }

    // Aktuellen Benutzer laden
    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const user = userResult.rows[0];

    // Aktuelles Passwort prüfen
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }

    // Neues Passwort hashen
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Passwort aktualisieren
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

    res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
