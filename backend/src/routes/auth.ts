import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../database/connection';
import config from '../config';
import { LoginRequest, LoginResponse } from '../types';

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

export default router;
