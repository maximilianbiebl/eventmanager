import React from 'react';

interface DescriptionModalProps {
  title: string;
  description: string;
  onClose: () => void;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  title,
  description,
  onClose
}) => {
  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="app-modal-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--c-overlay)',
          zIndex: 9998,
          animation: 'fadeIn 0.2s ease-out'
        }}
      />

      {/* Modal */}
      <div
        className="app-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--c-surface)',
          border: '1px solid var(--c-border-strong)',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          maxWidth: '90vw',
          maxHeight: '80vh',
          width: '500px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem',
            borderBottom: '1px solid var(--c-border-strong)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: 'var(--c-text)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--c-text-muted)',
              padding: 0,
              lineHeight: '1'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--c-text)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--c-text-muted)'}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '1.25rem',
            overflowY: 'auto',
            flex: 1,
            color: 'var(--c-text)',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap'
          }}
        >
          {description}
        </div>

        {/* Footer */}
        {/* Bewusst OHNE app-modal-actions: dieses Modal ist als flex-Spalte
            gebaut, der Inhalt scrollt und der Fuss steht ohnehin fest. Die
            klebende Leiste rechnet mit --modal-pad am Modal selbst - hier
            sitzt das Padding aber in den einzelnen Abschnitten. */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--c-border-strong)',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: 'var(--c-accent)',
              color: 'var(--c-text-inverse)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.875rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--c-accent-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--c-accent)'}
          >
            Schließen
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            transform: translate(-50%, -40%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};
