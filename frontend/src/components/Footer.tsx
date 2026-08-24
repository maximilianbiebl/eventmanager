import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer style={{
      backgroundColor: 'var(--c-surface-muted)',
      borderTop: '1px solid var(--c-border)',
      padding: '1rem',
      textAlign: 'center',
      marginTop: 'auto',
      fontSize: '0.875rem',
      color: 'var(--c-text-muted)'
    }}>
      <p style={{ margin: 0 }}>
        © {new Date().getFullYear()} <a
          href="https://biebl.digital"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--c-accent-text)',
            textDecoration: 'none',
            fontWeight: '500'
          }}
        >
          biebl.digital
        </a>
      </p>
    </footer>
  );
};
