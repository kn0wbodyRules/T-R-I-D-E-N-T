import React from 'react';

export default function AccountModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#3F4A1F',
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '360px',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: "'Slackey', sans-serif", color: '#F5E6A0', fontSize: '32px', fontWeight: 400, margin: 0, lineHeight: 1 }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#F5E6A0', opacity: 0.7, cursor: 'pointer', padding: '4px' }}
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
        <p style={{ color: 'rgba(245, 230, 160, 0.6)', fontFamily: "'Nunito', sans-serif", fontSize: '18px', margin: 0 }}>
          Coming soon
        </p>
      </div>
    </div>
  );
}
