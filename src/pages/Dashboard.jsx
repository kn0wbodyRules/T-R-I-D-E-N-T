import React, { useState } from 'react';
import MapCard from '../components/MapCard';
import WidgetRenderer from '../components/WidgetRenderer';
import NavPills from '../components/NavPills';
import EditWidgetModal from '../components/EditWidgetModal';
import { useWidgets } from '../context/WidgetContext';

export default function Dashboard() {
  const { activeWidgets, widgetSizes, isEditing } = useWidgets();
  
  const col2Widgets = activeWidgets.slice(0, 4);
  const col3Widgets = activeWidgets.slice(4, 6);

  return (
    <div
      style={{
        height: '100vh',
        background: '#3F4A1F', // The main background is olive green
        padding: '24px',
        fontFamily: "'Nunito', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Main 4-column layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.9fr) minmax(0, 0.7fr) minmax(0, 0.5fr)',
          gap: '16px',
          minHeight: 0,
        }}
      >
        {/* ── Column 1: Map ── */}
        <div style={{ minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <MapCard />
        </div>

        {/* ── Column 2: Stacked cards (first 4 widgets) ── */}
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {col2Widgets.map(id => (
            <div key={id} style={{ flex: widgetSizes[id] || 1, minHeight: 0 }}>
              <WidgetRenderer id={id} />
            </div>
          ))}
        </div>

        {/* ── Column 3: Stacked cards (next 2 widgets) ── */}
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {col3Widgets.map(id => (
            <div key={id} style={{ flex: widgetSizes[id] || 1, minHeight: 0 }}>
              <WidgetRenderer id={id} />
            </div>
          ))}
        </div>

        {/* ── Column 4: Brand + Nav ── */}
        <div
          style={{
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '24px',
            overflow: 'hidden',
            paddingLeft: '8px',
          }}
        >
          {/* Wordmark */}
          <h1
            style={{
              fontFamily: "'Slackey', sans-serif",
              fontWeight: 400,
              fontSize: '2.5rem',
              lineHeight: 1.1,
              color: '#F5E6A0',
              margin: 0,
              paddingTop: '16px',
            }}
          >
            Shamil<br />Predicts
          </h1>

          {/* Nav pills */}
          <NavPills />
        </div>
      </div>
      {/* Edit Widget Control Center Overlay */}
      {isEditing && <EditWidgetModal />}
    </div>
  );
}
