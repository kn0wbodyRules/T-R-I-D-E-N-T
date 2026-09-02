import React from 'react';
import Card from './Card';

export default function AQICard() {
  return (
    <Card title="AQI" style={{ height: '100%' }}>
      {/* The AQI card in the new wireframe is completely empty below the title */}
      <div style={{ flex: 1 }}></div>
    </Card>
  );
}
