import React from 'react';
import ReasonCard from './ReasonCard';
import QualityOfLifeCard from './QualityOfLifeCard';
import HCHOCard from './HCHOCard';
import WidgetsCard from './WidgetsCard';
import AQICard from './AQICard';
import PollutantCarousel from './PollutantCarousel';
import Card from './Card';

export default function WidgetRenderer({ id, overrideFlex }) {
  // If an overrideFlex is passed, inject it as inline style to override CSS Grid/Flexbox defaults if needed
  const styleObj = overrideFlex ? { flex: overrideFlex, height: '100%' } : { height: '100%' };
  
  switch (id) {
    case 'reason':
      return <ReasonCard style={styleObj} />;
    case 'qol':
      return <QualityOfLifeCard style={styleObj} />;
    case 'hcho':
      return <HCHOCard style={styleObj} />;
    case 'widgets':
      return <WidgetsCard style={styleObj} />;
    case 'aqi':
      return <AQICard style={styleObj} />;
    case 'pm25':
      return <PollutantCarousel style={styleObj} />;
    case 'weather':
      return <Card title="WEATHER" style={styleObj} />;
    case 'live_updates':
      return <Card title="LIVE UPDATES" style={styleObj} />;
    case 'prediction':
      return <Card title="PREDICTION" style={styleObj} />;
    case 'past_records':
      return <Card title="PAST RECORDS" style={styleObj} />;
    case 'tips':
      return <Card title="CONSERVATORY TIPS" style={styleObj} />;
    case 'hotspots':
      return <Card title="HOTSPOTS" style={styleObj} />;
    case 'report':
      return <Card title="REPORT DOWNLOAD" style={styleObj} />;
    default:
      return null;
  }
}
