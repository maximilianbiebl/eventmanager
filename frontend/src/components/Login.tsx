import React, { useState, useRef } from 'react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { getRememberPreference, setRememberPreference } from '../utils/authStorage';

/*
 * Fehlermeldung passend zur Ursache.
 *
 * Vorher stand bei JEDEM Fehlschlag "Login fehlgeschlagen" - auch dann,
 * wenn gar kein Server erreichbar war. Man sucht dann den Fehler beim
 * Passwort, obwohl das Handy schlicht kein Netz hat. Genau der Fall, der
 * auf einer Freizeit staendig vorkommt.
 */
const loginFehler = (err: any): { text: string; hilfe?: string } => {
  if (err?.response) {
    const status = err.response.status;
    if (status === 401) {
      return {
        text: 'Name oder Passwort stimmt nicht.',
        hilfe: 'Achte auf Gross- und Kleinschreibung.',
      };
    }
    if (status === 429) {
      return { text: 'Zu viele Versuche.', hilfe: 'Bitte einen Moment warten und erneut versuchen.' };
    }
    if (status >= 500) {
      return {
        text: 'Der Server hat ein Problem.',
        hilfe: 'Das liegt nicht an dir. Bitte später erneut versuchen oder der Leitung Bescheid geben.',
      };
    }
    return { text: err.response.data?.error || 'Anmeldung fehlgeschlagen.' };
  }

  // Keine Antwort: Netz weg, Server aus, oder Zeitueberschreitung
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      text: 'Keine Internetverbindung.',
      hilfe: 'Die Anmeldung braucht einmal Netz. Sobald du wieder Empfang hast, klappt es.',
    };
  }
  return {
    text: 'Server nicht erreichbar.',
    hilfe: 'Prüfe deine Verbindung. Falls du Empfang hast, ist der Server gerade nicht erreichbar.',
  };
};

export const Login: React.FC = () => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; hilfe?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(getRememberPreference());
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await authApi.login({ name: name.trim(), password, remember });
      setRememberPreference(remember);
      login(response.user, response.token, remember);
    } catch (err: any) {
      setError(loginFehler(err));
      // Der Name bleibt stehen, das Passwort wird geleert und bekommt den
      // Fokus - man tippt sonst hinter die alten Zeichen.
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Event Manager</h1>
        <p style={styles.subtitle}>Kirchliche Freizeiten</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && (
            <div style={styles.error} role="alert" aria-live="assertive">
              <strong style={styles.errorText}>{error.text}</strong>
              {error.hilfe && <span style={styles.errorHint}>{error.hilfe}</span>}
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              required
              autoFocus
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Passwort</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          <label style={styles.remember}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={styles.rememberBox}
            />
            <span>
              Eingeloggt bleiben
              <span style={styles.rememberHint}>
                {remember
                  ? 'Du bleibst angemeldet, bis du dich abmeldest.'
                  : 'Die Anmeldung gilt nur, solange die App geöffnet ist.'}
              </span>
            </span>
          </label>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Anmeldung...' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  errorText: {
    display: 'block',
  },
  errorHint: {
    display: 'block',
    marginTop: '0.25rem',
    fontWeight: 400,
    fontSize: '0.8125rem',
    lineHeight: 1.4,
  },
  remember: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    marginBottom: '1.25rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    color: 'var(--c-text)',
  },
  rememberBox: {
    width: '18px',
    height: '18px',
    marginTop: '0.0625rem',
    flex: '0 0 auto',
    cursor: 'pointer',
  },
  rememberHint: {
    display: 'block',
    marginTop: '0.125rem',
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
  },
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--c-surface-muted)',
  },
  card: {
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-strong)',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '0.5rem',
    color: 'var(--c-accent-text)',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--c-text-muted)',
    marginBottom: '2rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  input: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    color: 'var(--c-text)',
  },
  button: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '1rem',
    transition: 'background-color 0.2s',
  },
  error: {
    padding: '0.75rem 0.875rem',
    marginBottom: '0.25rem',
    backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
    border: '1px solid var(--c-danger)',
    borderRadius: '6px',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
};
