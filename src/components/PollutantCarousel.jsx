import React, { useState } from 'react';
import { mockPollutants } from '../data/mockData';

export default function PollutantCarousel() {
  const [currentIndex, setCurrentIndex] = useState(4); // PM 2.5 per wireframe

  const pollutant = mockPollutants[currentIndex];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + mockPollutants.length) % mockPollutants.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % mockPollutants.length);
  };

  return (
    <div
      style={{
        background: '#F5E6A0',
        borderRadius: '32px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '24px',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <button
          onClick={handlePrev}
          style={{ background: 'none', border: 'none', color: '#3F4A1F', cursor: 'pointer', padding: '4px' }}
        >
          {/* Using text chevrons to match the exact jagged look of the Caesar Dressing font if it was typed, 
              but standard icon is also fine. Let's use the icon for now. */}
          <span className="material-symbols-rounded" style={{ fontSize: '24px', fontWeight: 700 }}>chevron_left</span>
        </button>

        <div
          style={{
            fontFamily: "'Caesar Dressing', system-ui",
            fontWeight: 400,
            fontSize: '36px',
            color: '#3F4A1F',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '0 8px',
          }}
        >
          {pollutant.label}
        </div>

        <button
          onClick={handleNext}
          style={{ background: 'none', border: 'none', color: '#3F4A1F', cursor: 'pointer', padding: '4px' }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '24px', fontWeight: 700 }}>chevron_right</span>
        </button>
      </div>
    </div>
  );
}
