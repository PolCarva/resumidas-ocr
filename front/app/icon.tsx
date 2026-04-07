import { ImageResponse } from 'next/og';

// Ruta: /icon
export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          gap: '1px',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          background: 'linear-gradient(to bottom right, #3b82f6, #8b5cf6)',
          padding: '4px',
          borderRadius: '4px',
        }}
      >
        <div style={{ 
          width: '5px', 
          height: '60%', 
          background: 'white',
          borderRadius: '1px'
        }} />
        <div style={{ 
          width: '5px', 
          height: '80%', 
          background: 'white',
          borderRadius: '1px'
        }} />
        <div style={{ 
          width: '5px', 
          height: '40%', 
          background: 'white',
          borderRadius: '1px'
        }} />
        <div style={{ 
          width: '5px', 
          height: '70%', 
          background: 'white',
          borderRadius: '1px'
        }} />
      </div>
    ),
    {
      ...size,
    }
  );
} 
