import React from 'react';
import ReasonCard from './ReasonCard';
import QualityOfLifeCard from './QualityOfLifeCard';
import HCHOCard from './HCHOCard';
import WidgetsCard from './WidgetsCard';

const CenterColumn = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', width: '100%' }}>
      {/* Reason: tallest card (~33%) */}
      <div style={{ flex: '0 0 33%', minHeight: 0 }}>
        <ReasonCard />
      </div>
      
      {/* Quality of Life: medium (~25%) */}
      <div style={{ flex: '0 0 25%', minHeight: 0 }}>
        <QualityOfLifeCard />
      </div>
      
      {/* Formaldehyde: medium (~25%) */}
      <div style={{ flex: '0 0 25%', minHeight: 0 }}>
        <HCHOCard />
      </div>
      
      {/* Widgets: shortest (~17%) */}
      <div style={{ flex: '1', minHeight: 0 }}>
        <WidgetsCard />
      </div>
    </div>
  );
};

export default CenterColumn;
