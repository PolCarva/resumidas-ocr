import { ImageResponse } from 'next/og';

// Ruta: /opengraph-image
export const runtime = 'nodejs';
export const alt = 'Resumidas Cuentas - Finanzas Personales';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

export default async function Image() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(to bottom right, #EEF2FF, #E0E7FF)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 40,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                background: 'linear-gradient(to bottom right, #3b82f6, #8b5cf6)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 20,
                color: 'white',
                fontSize: 36,
                fontWeight: 'bold',
              }}
            >
              RC
            </div>
            <div
              style={{
                fontSize: 60,
                fontWeight: 'bold',
                background: 'linear-gradient(to bottom right, #3b82f6, #8b5cf6)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Resumidas Cuentas
            </div>
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#4B5563',
              maxWidth: 800,
              textAlign: 'center',
              marginBottom: 40,
            }}
          >
            Analiza y categoriza automáticamente tus gastos para tomar el control de tus finanzas personales
          </div>
          <div
            style={{
              display: 'flex',
              gap: 20,
            }}
          >
            <div
              style={{
                background: 'white',
                padding: '12px 24px',
                borderRadius: 12,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#10B981',
                }}
              />
              <div style={{ color: '#374151', fontSize: 24 }}>Fácil de usar</div>
            </div>
            <div
              style={{
                background: 'white',
                padding: '12px 24px',
                borderRadius: 12,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#3B82F6',
                }}
              />
              <div style={{ color: '#374151', fontSize: 24 }}>Datos encriptados</div>
            </div>
            <div
              style={{
                background: 'white',
                padding: '12px 24px',
                borderRadius: 12,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#8B5CF6',
                }}
              />
              <div style={{ color: '#374151', fontSize: 24 }}>Impulsado por IA</div>
            </div>
          </div>
        </div>
      ),
      {
        ...size,
      }
    );
  } catch (e) {
    console.error(e);
    return new Response('Failed to generate image', { status: 500 });
  }
} 
