import React, { createContext, useContext, useState } from 'react';

// Static registry of all available widgets in the app
export const WIDGET_REGISTRY = {
  reason: { id: 'reason', title: 'REASON' },
  qol: { id: 'qol', title: 'QUALITY OF LIFE' },
  hcho: { id: 'hcho', title: 'FORMALDEHYDE' },
  widgets: { id: 'widgets', title: 'WIDGETS' },
  aqi: { id: 'aqi', title: 'AQI' },
  pm25: { id: 'pm25', title: 'PM 2.5' },
  // New widgets requested by the user
  weather: { id: 'weather', title: 'WEATHER' },
  live_updates: { id: 'live_updates', title: 'LIVE UPDATES' },
  prediction: { id: 'prediction', title: 'PREDICTION' },
  past_records: { id: 'past_records', title: 'PAST RECORDS' },
  tips: { id: 'tips', title: 'CONSERVATORY TIPS' },
  hotspots: { id: 'hotspots', title: 'HOTSPOTS' },
  report: { id: 'report', title: 'REPORT DOWNLOAD' }
};

const DEFAULT_ACTIVE_WIDGETS = ['reason', 'qol', 'hcho', 'widgets', 'aqi', 'pm25'];
const DEFAULT_WIDGET_SIZES = {
  reason: 1,
  qol: 1,
  hcho: 1,
  widgets: 1,
  aqi: 1.5,
  pm25: 1
};

const WidgetContext = createContext();

export function WidgetProvider({ children }) {
  // Initialize from localStorage or fallback to defaults
  const [activeWidgets, setActiveWidgets] = useState(() => {
    const saved = localStorage.getItem('edcgal_activeWidgets');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return DEFAULT_ACTIVE_WIDGETS;
  });

  const [widgetSizes, setWidgetSizes] = useState(() => {
    const saved = localStorage.getItem('edcgal_widgetSizes');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return DEFAULT_WIDGET_SIZES;
  });

  const [isEditing, setIsEditing] = useState(false);

  // Persist to localStorage whenever they change
  React.useEffect(() => {
    localStorage.setItem('edcgal_activeWidgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  React.useEffect(() => {
    localStorage.setItem('edcgal_widgetSizes', JSON.stringify(widgetSizes));
  }, [widgetSizes]);

  const resizeWidget = (id, newFlexDelta) => {
    setWidgetSizes(prev => {
      const currentSize = prev[id] || 1;
      // Clamp flex size between 0.5 and 5
      const newSize = Math.max(0.5, Math.min(5, currentSize + newFlexDelta));
      return { ...prev, [id]: newSize };
    });
  };

  const addWidget = (id) => {
    if (activeWidgets.length >= 6) return;
    if (!activeWidgets.includes(id)) {
      setActiveWidgets(prev => [...prev, id]);
    }
  };

  const removeWidget = (id) => {
    // Prevent removing the 'widgets' card
    if (id === 'widgets') return;
    setActiveWidgets(prev => prev.filter(wId => wId !== id));
  };

  const insertOrReplaceWidget = (id, targetIndex) => {
    if (activeWidgets.includes(id)) return; // Already exists
    setActiveWidgets(prev => {
      const result = [...prev];
      if (targetIndex < result.length) {
        // Dropped exactly on an existing card -> REPLACE it!
        // Protect the 'widgets' card from being replaced
        if (result[targetIndex] === 'widgets') return result;
        result[targetIndex] = id;
      } else {
        // Dropped into empty space -> INSERT/APPEND
        if (result.length < 6) {
          result.push(id);
        }
      }
      return result;
    });
  };

  // Reorders the active widgets array by moving an item from one index to another
  const moveWidget = (dragIndex, hoverIndex) => {
    setActiveWidgets(prev => {
      const result = [...prev];
      const [removed] = result.splice(dragIndex, 1);
      result.splice(hoverIndex, 0, removed);
      return result;
    });
  };

  const availableWidgets = Object.keys(WIDGET_REGISTRY).filter(id => !activeWidgets.includes(id));

  return (
    <WidgetContext.Provider value={{
      activeWidgets,
      availableWidgets,
      widgetSizes,
      isEditing,
      setIsEditing,
      resizeWidget,
      addWidget,
      removeWidget,
      moveWidget,
      insertOrReplaceWidget
    }}>
      {children}
    </WidgetContext.Provider>
  );
}

export const useWidgets = () => useContext(WidgetContext);
