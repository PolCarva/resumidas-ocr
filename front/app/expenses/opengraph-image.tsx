import { ImageResponse } from 'next/og';

// Ruta: /expenses/opengraph-image
export const runtime = 'nodejs';
export const alt = 'Análisis de Gastos - Resumidas Cuentas';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

const chartColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#0ea5e9'];

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
            background: 'linear-gradient(to bottom right, #EBF5FF, #E0F2FE)',
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
                background: 'linear-gradient(to bottom right, #3b82f6, #0284c7)',
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
                background: 'linear-gradient(to bottom right, #3b82f6, #0284c7)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Análisis de Gastos
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
            Visualiza y analiza tus gastos con gráficos interactivos para tomar mejores decisiones financieras
          </div>
          
          {/* Gráficos simulados */}
          <div
            style={{
              display: 'flex',
              gap: 30,
              marginTop: 20,
            }}
          >
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              {chartColors.slice(0, 6).map((color) => (
                <div
                  key={color}
                  style={{
                    flex: 1,
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
            
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                height: 200,
                gap: 15,
              }}
            >
              {[80, 120, 60, 180, 100, 150, 90].map((height, i) => (
                <div
                  key={i}
                  style={{
                    width: 30,
                    height: height,
                    backgroundColor: chartColors[i],
                    borderRadius: '4px 4px 0 0',
                  }}
                />
              ))}
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
