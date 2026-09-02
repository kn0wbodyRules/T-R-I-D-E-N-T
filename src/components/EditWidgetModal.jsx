import React, { useState, useEffect } from 'react';
import { useWidgets, WIDGET_REGISTRY } from '../context/WidgetContext';
import WidgetRenderer from './WidgetRenderer';

export default function EditWidgetModal() {
  const { 
    activeWidgets, availableWidgets, widgetSizes, 
    setIsEditing, addWidget, removeWidget, moveWidget, resizeWidget, insertOrReplaceWidget 
  } = useWidgets();
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Split columns logically for visual feedback exactly like Dashboard
  const col2Widgets = activeWidgets.slice(0, 4);
  const col3Widgets = activeWidgets.slice(4, 6);

  // --- DND Handlers ---
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    setTimeout(() => {
      if (e.target) e.target.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = '1';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDropOnSlot = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;

    const sourceIndex = activeWidgets.indexOf(draggedId);
    if (sourceIndex > -1) {
      moveWidget(sourceIndex, targetIndex);
    } else {
      insertOrReplaceWidget(draggedId, Math.min(targetIndex, activeWidgets.length));
    }
  };

  const handleDropToTrash = (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId) {
      removeWidget(draggedId);
    }
  };

  // --- Custom Flex Resize Handle ---
  const handleResizePointerDown = (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    
    let lastY = e.clientY;
    
    const onPointerMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - lastY;
      // 1 flex unit is roughly 50px of drag
      const flexDelta = deltaY / 100; 
      resizeWidget(id, flexDelta);
      lastY = moveEvent.clientY;
    };
    
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const renderDraggableActiveWidget = (id, index) => {
    return (
      <div 
        key={id}
        draggable
        onDragStart={(e) => handleDragStart(e, id)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDropOnSlot(e, index)}
        style={{ 
          flex: widgetSizes[id] || 1, 
          position: 'relative', 
          cursor: 'grab',
          minHeight: '100px',
          border: '2px dashed transparent', // So it doesn't jump when hovered
        }}
        onDragEnter={e => { e.currentTarget.style.border = '2px dashed rgba(245, 230, 160, 0.8)'; }}
        onDragLeave={e => { e.currentTarget.style.border = '2px dashed transparent'; }}
      >
        <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
          <WidgetRenderer id={id} />
        </div>
        
        {/* Remove Button (Hide for protected 'widgets' card) */}
        {id !== 'widgets' && (
          <div 
            style={{ position: 'absolute', top: '-10px', left: '-10px', background: '#FF4B4B', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer', zIndex: 10, pointerEvents: 'auto' }}
            onClick={(e) => { e.stopPropagation(); removeWidget(id); }}
            title="Remove Widget"
          >
            <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>remove</span>
          </div>
        )}

        {/* Drag-to-Resize Handle */}
        <div 
          style={{ 
            position: 'absolute', 
            bottom: '-10px', 
            right: '-10px', 
            background: '#2D8FE0', 
            color: 'white', 
            borderRadius: '50%', 
            width: '28px', 
            height: '28px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)', 
            cursor: 'ns-resize', 
            zIndex: 10, 
            pointerEvents: 'auto' 
          }}
          onPointerDown={(e) => handleResizePointerDown(e, id)}
          title="Drag up/down to resize"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '18px', transform: 'rotate(45deg)' }}>height</span>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#3F4A1F',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 48px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'scale(1)' : 'scale(0.95)',
        transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '32px', position: 'relative', flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Slackey', sans-serif", fontSize: '42px', color: '#F5E6A0', margin: 0, lineHeight: 1 }}>
            Edit Widget Section
          </h2>
          <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: '18px', color: '#F5E6A0', margin: '8px 0 0 0', opacity: 0.9 }}>
            Drag to rearrange. Drag the blue corner handle up or down to resize perfectly! Drag to right panel to remove.
          </p>
        </div>
        
        <button
          onClick={() => {
            setMounted(false);
            setTimeout(() => setIsEditing(false), 300);
          }}
          style={{
            position: 'absolute',
            right: 0,
            background: '#F5E6A0',
            color: '#3F4A1F',
            border: 'none',
            borderRadius: '24px',
            padding: '12px 24px',
            fontFamily: "'Slackey', sans-serif",
            fontSize: '18px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          Save Layout
        </button>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: '32px' }}>
        
        {/* --- LEFT SIDE: Active Canvas (Mirrors Dashboard Layout) --- */}
        <div style={{ flex: '1', display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 0.7fr)', gap: '16px' }}>
          
          {/* Column 2 Replica */}
          <div 
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0, border: '2px dashed rgba(245, 230, 160, 0.2)', borderRadius: '32px', padding: '8px' }}
            onDragOver={handleDragOver}
            onDrop={(e) => { e.preventDefault(); handleDropOnSlot(e, col2Widgets.length); }} // Drop at end of col 2
          >
            {col2Widgets.map((id, idx) => renderDraggableActiveWidget(id, idx))}
            {col2Widgets.length === 0 && (
               <div style={{ flex: 1, minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(245,230,160,0.4)', fontFamily: "'Nunito'" }}>Drop Here</div>
            )}
          </div>

          {/* Column 3 Replica */}
          <div 
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0, border: '2px dashed rgba(245, 230, 160, 0.2)', borderRadius: '32px', padding: '8px' }}
            onDragOver={handleDragOver}
            onDrop={(e) => { e.preventDefault(); handleDropOnSlot(e, col2Widgets.length + col3Widgets.length); }} // Drop at end of col 3
          >
            {col3Widgets.map((id, idx) => renderDraggableActiveWidget(id, idx + col2Widgets.length))}
            {col3Widgets.length === 0 && (
               <div style={{ flex: 1, minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(245,230,160,0.4)', fontFamily: "'Nunito'" }}>Drop Here</div>
            )}
          </div>

        </div>

        {/* --- DIVIDER --- */}
        <div style={{ width: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <div style={{ width: '1px', height: '100%', borderLeft: '2px dotted rgba(245, 230, 160, 0.4)' }}></div>
          <div style={{ position: 'absolute', top: '15%', transform: 'translateY(-50%)' }}>
             <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: "'Slackey', sans-serif", fontSize: '24px', color: '#F5E6A0', letterSpacing: '0.1em' }}>REPLACE</span>
          </div>
          <div style={{ position: 'absolute', bottom: '15%', transform: 'translateY(50%)' }}>
             <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: "'Slackey', sans-serif", fontSize: '24px', color: '#F5E6A0', letterSpacing: '0.1em' }}>RESIZE</span>
          </div>
        </div>

        {/* --- RIGHT SIDE: Available Widgets (Drop to Remove) --- */}
        <div 
          onDragOver={handleDragOver}
          onDrop={handleDropToTrash}
          style={{ flex: '1', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '120px', gap: '16px', overflowY: 'auto', padding: '12px' }}
        >
          {availableWidgets.map(id => {
            const config = WIDGET_REGISTRY[id];
            return (
              <div 
                key={id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, id)}
                onDragEnd={handleDragEnd}
                style={{ 
                  background: '#F5E6A0', 
                  borderRadius: '32px', 
                  padding: '24px', 
                  cursor: 'grab',
                  opacity: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'transform 0.1s',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
                onClick={() => addWidget(id)}
              >
                <div style={{ position: 'absolute', top: '-10px', left: '-10px', background: '#4C7A3D', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>add</span>
                </div>
                <h3 style={{ 
                  fontFamily: "'Caesar Dressing', system-ui", 
                  fontWeight: 400, 
                  fontSize: '24px', 
                  color: '#3F4A1F', 
                  textAlign: 'center', 
                  margin: 0,
                  lineHeight: 1.1 
                }}>
                  {config.title}
                </h3>
              </div>
            )
          })}
        </div>
        
      </div>
    </div>
  );
}
