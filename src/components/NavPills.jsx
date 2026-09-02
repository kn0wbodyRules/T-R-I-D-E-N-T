import React from 'react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/reports', icon: 'description', label: 'Report' }, // Note: Singular 'Report' per wireframe
];

export default function NavPills() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start', width: '100%' }}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          style={{ textDecoration: 'none' }}
        >
          {({ isActive }) => (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 24px 8px 16px',
                borderRadius: '32px',
                fontSize: '24px',
                fontFamily: "'Slackey', sans-serif",
                fontWeight: 400,
                cursor: 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
                ...(isActive
                  ? { background: '#F5E6A0', color: '#3F4A1F' }
                  : { background: 'transparent', color: '#F5E6A0' }),
              }}
            >
              <span
                className={`material-symbols-rounded ${isActive ? 'filled' : ''}`}
                style={{ fontSize: '28px', paddingTop: '4px' }}
              >
                {item.icon}
              </span>
              <span style={{ paddingTop: '6px' }}>{item.label}</span>
            </div>
          )}
        </NavLink>
      ))}
    </div>
  );
}
