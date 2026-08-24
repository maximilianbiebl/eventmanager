import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  duration = 3000,
  onClose
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const backgroundColor = {
    success: 'var(--c-success)',
    error: 'var(--c-danger)',
    info: 'var(--c-accent)'
  }[type];

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        backgroundColor,
        color: 'var(--c-text-inverse)',
        padding: '0.75rem 1.25rem',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: '400px',
        animation: 'slideIn 0.3s ease-out',
        fontSize: '0.875rem',
        fontWeight: '500'
      }}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--c-text-inverse)',
          fontSize: '1.25rem',
          cursor: 'pointer',
          padding: 0,
          marginLeft: 'auto',
          opacity: 0.8,
          lineHeight: '1'
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
      >
        ×
      </button>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
