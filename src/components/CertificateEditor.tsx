"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Award, Move, Maximize2, RotateCcw, AlignCenter } from 'lucide-react';

interface ElementPosition {
  x: number;          // Normalized [0, 1]
  y: number;          // Normalized [0, 1]
  width?: number;     // Normalized [0, 1]
  height?: number;    // Normalized [0, 1]
}

interface EditorProps {
  backgroundImageUrl: string;
  nameConfig: {
    x: number;
    y: number;
    maxWidth: number;
    fontFamily: string;
    fontSize: number;
    color: string;
    alignment: 'left' | 'center' | 'right';
    transformation?: 'uppercase' | 'none';
    minFontSize: number;
  };
  signature1?: {
    active: boolean;
    imageUrl?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  signature2?: {
    active: boolean;
    imageUrl?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  onChange: (updates: {
    nameConfig?: any;
    signature1?: any;
    signature2?: any;
  }) => void;
}

export default function CertificateEditor({
  backgroundImageUrl,
  nameConfig,
  signature1,
  signature2,
  onChange,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [dragState, setDragState] = useState<{
    element: 'name' | 'signature1' | 'signature2';
    action: 'drag' | 'resize';
    startX: number;
    startY: number;
    initialCoords: ElementPosition;
  } | null>(null);

  // Mouse handlers for drag and resize
  const handleMouseDown = (
    e: React.MouseEvent,
    element: 'name' | 'signature1' | 'signature2',
    action: 'drag' | 'resize'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    let initialCoords: ElementPosition = { x: 0, y: 0 };
    if (element === 'name') {
      initialCoords = { x: nameConfig.x, y: nameConfig.y, width: nameConfig.maxWidth };
    } else if (element === 'signature1' && signature1) {
      initialCoords = { x: signature1.x, y: signature1.y, width: signature1.width, height: signature1.height };
    } else if (element === 'signature2' && signature2) {
      initialCoords = { x: signature2.x, y: signature2.y, width: signature2.width, height: signature2.height };
    }

    setDragState({
      element,
      action,
      startX: e.clientX,
      startY: e.clientY,
      initialCoords,
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !dragState) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const deltaX = (e.clientX - dragState.startX) / containerRect.width;
      const deltaY = (e.clientY - dragState.startY) / containerRect.height;

      const { element, action, initialCoords } = dragState;

      if (action === 'drag') {
        let newX = Math.max(0, Math.min(1, (initialCoords.x || 0) + deltaX));
        let newY = Math.max(0, Math.min(1, (initialCoords.y || 0) + deltaY));

        if (element === 'name') {
          onChange({ nameConfig: { ...nameConfig, x: newX, y: newY } });
        } else if (element === 'signature1' && signature1) {
          onChange({ signature1: { ...signature1, x: newX, y: newY } });
        } else if (element === 'signature2' && signature2) {
          onChange({ signature2: { ...signature2, x: newX, y: newY } });
        }
      } else if (action === 'resize') {
        if (element === 'name') {
          let newWidth = Math.max(0.1, Math.min(1 - nameConfig.x, (initialCoords.width || 0.5) + deltaX));
          onChange({ nameConfig: { ...nameConfig, maxWidth: newWidth } });
        } else {
          // Signature resizing
          const currentSig = element === 'signature1' ? signature1 : signature2;
          if (currentSig && initialCoords.width && initialCoords.height) {
            let newWidth = Math.max(0.05, Math.min(1 - currentSig.x, initialCoords.width + deltaX));
            // Keep aspect ratio by using delta proportional change
            const ratio = initialCoords.height / initialCoords.width;
            let newHeight = Math.max(0.02, Math.min(1 - currentSig.y, newWidth * ratio));

            if (element === 'signature1') {
              onChange({ signature1: { ...signature1, width: newWidth, height: newHeight } });
            } else {
              onChange({ signature2: { ...signature2, width: newWidth, height: newHeight } });
            }
          }
        }
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, nameConfig, signature1, signature2, onChange]);

  // Center elements helper
  const handleCenterElement = (element: 'name' | 'signature1' | 'signature2') => {
    if (element === 'name') {
      onChange({ nameConfig: { ...nameConfig, x: 0.5 } });
    } else if (element === 'signature1' && signature1) {
      onChange({ signature1: { ...signature1, x: 0.5 - (signature1.width / 2) } });
    } else if (element === 'signature2' && signature2) {
      onChange({ signature2: { ...signature2, x: 0.5 - (signature2.width / 2) } });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Editor controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Zoom da Área de Trabalho:</span>
          <input 
            type="range" 
            min="50" 
            max="150" 
            value={zoom} 
            onChange={e => setZoom(Number(e.target.value))}
            style={{ width: 120, accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{zoom}%</span>
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => handleCenterElement('name')}
            style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <AlignCenter size={12} /> Centralizar Nome
          </button>
          {signature1?.active && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => handleCenterElement('signature1')}
              style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <AlignCenter size={12} /> Centralizar Assinatura 1
            </button>
          )}
          {signature2?.active && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => handleCenterElement('signature2')}
              style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <AlignCenter size={12} /> Centralizar Assinatura 2
            </button>
          )}
        </div>
      </div>

      {/* Workspace container */}
      <div 
        style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          overflow: 'auto', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: 'var(--radius-md)', 
          padding: 32,
          minHeight: 400
        }}
      >
        {/* scaled canvas wrapper */}
        <div 
          ref={containerRef}
          style={{
            position: 'relative',
            width: `${841.89 * (zoom / 100)}px`,
            aspectRatio: '841.89 / 595.28',
            backgroundImage: `url(${backgroundImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            userSelect: 'none'
          }}
        >
          {/* 1. Name Drag / Area element */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'name', 'drag')}
            style={{
              position: 'absolute',
              left: `${nameConfig.alignment === 'center' ? (nameConfig.x - nameConfig.maxWidth / 2) * 100 : nameConfig.alignment === 'right' ? (nameConfig.x - nameConfig.maxWidth) * 100 : nameConfig.x * 100}%`,
              top: `${nameConfig.y * 100}%`,
              width: `${nameConfig.maxWidth * 100}%`,
              transform: 'translateY(-50%)',
              border: dragState?.element === 'name' ? '1px dashed var(--primary)' : '1px dashed rgba(255,255,255,0.25)',
              background: dragState?.element === 'name' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.02)',
              cursor: 'move',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}
          >
            {/* Title handle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, pointerEvents: 'none', opacity: 0.6, fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Move size={8} /> Campo do Nome</span>
              <span>L: {(nameConfig.maxWidth * 100).toFixed(0)}%</span>
            </div>

            {/* Simulated text */}
            <div
              style={{
                fontFamily: nameConfig.fontFamily.includes('Great') || nameConfig.fontFamily.includes('Brush') ? 'cursive' : 'sans-serif',
                fontSize: `${nameConfig.fontSize * (zoom / 100) * 0.7}px`, // Proportional preview
                color: nameConfig.color || '#000000',
                textAlign: nameConfig.alignment,
                fontWeight: nameConfig.fontFamily.includes('Bold') || nameConfig.fontFamily.includes('Medium') ? 'bold' : 'normal',
                textTransform: nameConfig.transformation === 'uppercase' ? 'uppercase' : 'none',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis'
              }}
            >
              {nameConfig.transformation === 'uppercase' ? 'NOME DO PARTICIPANTE' : 'Nome do Participante'}
            </div>

            {/* Resize handle (right side width scaling) */}
            <div
              onMouseDown={(e) => handleMouseDown(e, 'name', 'resize')}
              style={{
                position: 'absolute',
                right: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 8,
                height: 16,
                background: 'var(--primary)',
                border: '1px solid white',
                borderRadius: 2,
                cursor: 'ew-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
          </div>

          {/* 2. Signature 1 if active */}
          {signature1 && signature1.active && (
            <div
              onMouseDown={(e) => handleMouseDown(e, 'signature1', 'drag')}
              style={{
                position: 'absolute',
                left: `${signature1.x * 100}%`,
                top: `${signature1.y * 100}%`,
                width: `${signature1.width * 100}%`,
                height: `${signature1.height * 100}%`,
                border: dragState?.element === 'signature1' ? '1px dashed var(--primary)' : '1px dashed rgba(255,255,255,0.25)',
                background: signature1.imageUrl ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                cursor: 'move',
                boxSizing: 'border-box'
              }}
            >
              {signature1.imageUrl ? (
                <img 
                  src={signature1.imageUrl} 
                  alt="Assinatura 1" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} 
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: 4 }}>
                  <Award size={16} style={{ marginBottom: 2, opacity: 0.7 }} />
                  <span style={{ fontSize: '0.55rem', fontWeight: 600, opacity: 0.8 }}>Assinatura 1</span>
                </div>
              )}

              {/* Resize Handle (bottom-right) */}
              <div
                onMouseDown={(e) => handleMouseDown(e, 'signature1', 'resize')}
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -4,
                  width: 10,
                  height: 10,
                  background: 'var(--primary)',
                  border: '1px solid white',
                  cursor: 'se-resize',
                  borderRadius: '50%'
                }}
              />
            </div>
          )}

          {/* 3. Signature 2 if active */}
          {signature2 && signature2.active && (
            <div
              onMouseDown={(e) => handleMouseDown(e, 'signature2', 'drag')}
              style={{
                position: 'absolute',
                left: `${signature2.x * 100}%`,
                top: `${signature2.y * 100}%`,
                width: `${signature2.width * 100}%`,
                height: `${signature2.height * 100}%`,
                border: dragState?.element === 'signature2' ? '1px dashed var(--primary)' : '1px dashed rgba(255,255,255,0.25)',
                background: signature2.imageUrl ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                cursor: 'move',
                boxSizing: 'border-box'
              }}
            >
              {signature2.imageUrl ? (
                <img 
                  src={signature2.imageUrl} 
                  alt="Assinatura 2" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} 
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: 4 }}>
                  <Award size={16} style={{ marginBottom: 2, opacity: 0.7 }} />
                  <span style={{ fontSize: '0.55rem', fontWeight: 600, opacity: 0.8 }}>Assinatura 2</span>
                </div>
              )}

              {/* Resize Handle (bottom-right) */}
              <div
                onMouseDown={(e) => handleMouseDown(e, 'signature2', 'resize')}
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -4,
                  width: 10,
                  height: 10,
                  background: 'var(--primary)',
                  border: '1px solid white',
                  cursor: 'se-resize',
                  borderRadius: '50%'
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
