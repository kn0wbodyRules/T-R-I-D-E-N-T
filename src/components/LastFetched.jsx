import React from 'react';
import { mockLastFetched } from '../data/mockData';

export default function LastFetched() {
  const { timestamp, isPending } = mockLastFetched;

  return (
    <div style={{ textAlign: 'center', padding: '8px 0 4px 0' }}>
      <p style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: '11px',
        color: 'rgba(245, 230, 160, 0.4)',
        margin: 0,
      }}>
        Last data fetched on{' '}
        {isPending || !timestamp ? (
          <span style={{ opacity: 0.6 }}>—</span>
        ) : (
          <span>{timestamp}</span>
        )}
      </p>
    </div>
  );
}
