import { Metadata } from 'next';

type MetadataOptions = {
  title?: string;
  description?: string;
  keywords?: string[];
  path?: string;
  noIndex?: boolean;
  type?: 'website' | 'article';
};

/**
 * Genera metadatos consistentes para las páginas de Next.js
 * 
 * IMPORTANTE: Esta función debe ser utilizada en uno de estos dos escenarios:
 * 1. En un archivo de metadatos separado (metadata.ts) que se importa en una página cliente ('use client')
 * 2. Directamente en una página de servidor (sin 'use client')
 * 
 * NO debe exportarse directamente desde un componente marcado con 'use client'
 * 
 * @example
 * // En un archivo metadata.ts (para páginas cliente)
 * import { generateMetadata } from "@/lib/hooks/useMetadata";
 * export default generateMetadata({ title: "Mi Página" });
 * 
 * @example
 * // En una página de servidor (sin 'use client')
 * import { generateMetadata } from "@/lib/hooks/useMetadata";
 * export const metadata = generateMetadata({ title: "Mi Página" });
 * 
 * @param options Opciones de metadatos específicas para la página
 * @returns Objeto Metadata compatible con Next.js
 */
export function generateMetadata(options: MetadataOptions): Metadata {
  // Valores por defecto
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://resumidascuentas.com';
  const defaultTitle = 'Resumidas Cuentas - Finanzas Personales';
  const defaultDescription = 'Analiza y categoriza automáticamente tus gastos para tomar el control de tus finanzas personales';
  const defaultKeywords = [
    'finanzas personales',
    'análisis de gastos',
    'categorización automática',
    'gestión financiera',
    'extractos bancarios',
  ];

  // Combinar valores por defecto con opciones proporcionadas
  const title = options.title || defaultTitle;
  const description = options.description || defaultDescription;
  const keywords = [...defaultKeywords, ...(options.keywords || [])];
  const type = options.type || 'website';
  const url = options.path ? `${baseUrl}${options.path}` : baseUrl;

  // Construir objeto de metadatos
  const metadata: Metadata = {
    title,
    description,
    keywords,
    openGraph: {
      type,
      locale: 'es_ES',
      url,
      siteName: 'Resumidas Cuentas',
      title,
      description,
      // Las imágenes se generan dinámicamente con la API de Next.js
      // No es necesario especificarlas aquí
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      // Las imágenes se generan dinámicamente con la API de Next.js
      // No es necesario especificarlas aquí
    },
    icons: {
      icon: '/icon',
      apple: [
        {
          url: '/apple-icon',
          type: 'image/png',
          sizes: '180x180',
        },
        {
          url: '/apple-icon-simple',
          type: 'image/png',
          sizes: '180x180',
        }
      ],
    },
  };

  // Añadir robots si se especifica noIndex
  if (options.noIndex) {
    metadata.robots = {
      index: false,
      follow: false,
    };
  }

  return metadata;
} 