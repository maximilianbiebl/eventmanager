import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer style={{
      backgroundColor: '#f9fafb',
      borderTop: '1px solid #e5e7eb',
      padding: '1rem',
      textAlign: 'center',
      marginTop: 'auto',
      fontSize: '0.875rem',
      color: '#6b7280'
    }}>
      <p style={{ margin: 0 }}>
        © {new Date().getFullYear()} <a
          href="https://biebl.digital"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#4f46e5',
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
