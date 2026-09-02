import React from 'react';
import { useWidgets } from '../context/WidgetContext';

const WidgetsCard = ({ style }) => {
  const { setIsEditing } = useWidgets();
  return (
    <div
      style={{
        background: '#F5E6A0',
        borderRadius: '32px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <h3
        style={{
          fontFamily: "'Slackey', sans-serif",
          fontWeight: 400,
          fontSize: '36px',
          color: 'transparent',
          WebkitTextStroke: '2px #3F4A1F',
          margin: 0,
          paddingBottom: '8px',
          lineHeight: 1,
        }}
      >
        Widgets
      </h3>
      
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flex: 1 }}>
        <span style={{ fontSize: '13px', fontFamily: "'Nunito', sans-serif", color: '#3F4A1F', fontWeight: 600, paddingBottom: '4px' }}>
          Resize and edit the widgets
        </span>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#3F4A1F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '24px', fontWeight: 600 }}>edit</span>
        </button>
      </div>
    </div>
  );
};

export default WidgetsCard;
