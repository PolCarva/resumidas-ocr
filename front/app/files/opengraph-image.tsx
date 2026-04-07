import { ImageResponse } from 'next/og';

// Ruta: /files/opengraph-image
export const runtime = 'nodejs';
export const alt = 'Historial de Análisis - Resumidas Cuentas';
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
            background: 'linear-gradient(to bottom right, #F5F3FF, #EDE9FE)',
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
                background: 'linear-gradient(to bottom right, #8b5cf6, #6d28d9)',
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
                background: 'linear-gradient(to bottom right, #8b5cf6, #6d28d9)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Historial de Análisis
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
            Accede a tu historial de análisis financieros y gestiona tus extractos bancarios analizados
          </div>
          
          {/* Tarjetas de análisis simuladas */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 20,
            }}
          >
            {['Enero 2023', 'Febrero 2023', 'Marzo 2023'].map((month, i) => (
              <div
                key={i}
                style={{
                  width: 280,
                  height: 180,
                  background: 'white',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: `hsl(${260 + i * 30}, 80%, 60%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 18,
                      fontWeight: 'bold',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: '#1F2937',
                    }}
                  >
                    {month}
                  </div>
                </div>
                
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 12,
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
                  <div style={{ color: '#4B5563', fontSize: 18 }}>
                    {`${10 + i * 5} categorías`}
                  </div>
                </div>
                
                <div
                  style={{
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
                      background: '#EC4899',
                    }}
                  />
                  <div style={{ color: '#4B5563', fontSize: 18 }}>
                    {`${30 + i * 12} transacciones`}
                  </div>
                </div>
                
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: '#1F2937',
                  }}
                >
                  {`$${(5000 + i * 1200).toLocaleString()}`}
                </div>
              </div>
            ))}
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
