import { NextRequest, NextResponse } from 'next/server'; // To handle the request and response
import { promises as fs } from 'fs'; // To save the file temporarily
import { v4 as uuidv4 } from 'uuid'; // To generate a unique filename
import PDFParser from 'pdf2json'; // To parse the pdf
import path from 'path';
import os from 'os';

export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Configurar límites de tamaño para la carga de archivos
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Interfaz para el parser de PDF
interface PDFParserInstance {
  on(event: string, callback: (data?: unknown) => void): void;
  loadPDF(filePath: string): void;
  getRawTextContent(): string;
  data?: {
    Pages?: Array<{
      Texts?: Array<{
        R?: Array<{
          T?: string;
        }>;
      }>;
    }>;
  };
}

export async function POST(req: NextRequest) {
  console.log('Entrando a la función POST de upload');
  try {
    const formData = await req.formData();
    
    // Intentar obtener el archivo con diferentes nombres de campo
    let uploadedFile = formData.get('file') as File;
    if (!uploadedFile) {
      uploadedFile = formData.get('filepond') as File;
    }
    
    const action = formData.get('action') as string;
    console.log('Archivo recibido:', uploadedFile?.name, 'Tamaño:', uploadedFile?.size, 'Acción:', action);

    if (!uploadedFile) {
      console.log('No se encontró archivo en la petición. Campos disponibles:', Array.from(formData.keys()).join(', '));
      return NextResponse.json(
        { error: 'No se proporcionó archivo PDF' },
        { status: 400 }
      );
    }

    // Verificar que sea un PDF
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf') && uploadedFile.type !== 'application/pdf') {
      console.log('El archivo no es un PDF:', uploadedFile.type);
      return NextResponse.json(
        { error: 'El archivo debe ser un PDF' },
        { status: 400 }
      );
    }

    // Usar el directorio temporal del sistema
    const tmpDir = os.tmpdir();
    const fileName = uuidv4();
    const tempFilePath = path.join(tmpDir, `${fileName}.pdf`);
    console.log('Ruta temporal:', tempFilePath);

    try {
      // Guardar archivo
      const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
      console.log('Buffer creado, tamaño:', fileBuffer.length);
      await fs.writeFile(tempFilePath, fileBuffer);
      console.log('Archivo guardado en:', tempFilePath);

      // Si la acción es obtener el número de páginas
      if (action === 'getPageCount') {
        try {
          // Parsear el PDF para obtener el número de páginas
          const pdfParser = new (PDFParser as unknown as { new(arg1: null, arg2: number): PDFParserInstance })(null, 1);
          
          const pdfData = await new Promise<PDFParserInstance['data']>((resolve, reject) => {
            // Establecer un timeout para evitar que se quede colgado
            const timeout = setTimeout(() => {
              reject(new Error('Timeout al procesar el PDF'));
            }, 20000); // 20 segundos
            
            pdfParser.on('pdfParser_dataError', (errData: unknown) => {
              clearTimeout(timeout);
              console.error('Error en el parser:', errData);
              const typedError = errData as { parserError?: string };
              reject(typedError.parserError || 'Error al parsear el PDF');
            });
            
            pdfParser.on('pdfParser_dataReady', () => {
              clearTimeout(timeout);
              console.log('PDF parseado correctamente');
              try {
                resolve(pdfParser.data);
              } catch (extractError) {
                console.error('Error al extraer contenido:', extractError);
                reject(new Error('Error al extraer el contenido del PDF'));
              }
            });
            
            console.log('Iniciando parseo del PDF');
            pdfParser.loadPDF(tempFilePath);
          });
          
          // Obtener el número de páginas
          const pageCount = pdfData?.Pages?.length || 0;
          console.log(`PDF tiene ${pageCount} páginas`);
          
          // Limpiar archivo temporal
          try {
            await fs.unlink(tempFilePath);
            console.log('Archivo temporal eliminado');
          } catch (cleanupError) {
            console.warn('No se pudo eliminar el archivo temporal:', cleanupError);
          }
          
          return NextResponse.json({
            success: true,
            pageCount
          });
        } catch (error) {
          console.error('Error al obtener el número de páginas:', error);
          
          // Limpiar el archivo temporal en caso de error
          try {
            await fs.unlink(tempFilePath);
          } catch (cleanupError) {
            console.warn('No se pudo eliminar el archivo temporal:', cleanupError);
          }
          
          return NextResponse.json(
            { 
              error: 'Error al procesar el PDF', 
              details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
          );
        }
      }

      // Parsear PDF
      const pdfParser = new (PDFParser as unknown as { new(arg1: null, arg2: number): PDFParserInstance })(null, 1);
      console.log('Parser PDF creado');

      const parsedText = await new Promise<string>((resolve, reject) => {
        // Establecer un timeout para evitar que se quede colgado
        const timeout = setTimeout(() => {
          reject(new Error('Timeout al procesar el PDF'));
        }, 30000); // 30 segundos

        pdfParser.on('pdfParser_dataError', (errData: unknown) => {
          clearTimeout(timeout);
          console.error('Error en el parser:', errData);
          const typedError = errData as { parserError?: string };
          reject(typedError.parserError || 'Error al parsear el PDF');
        });

        pdfParser.on('pdfParser_dataReady', () => {
          clearTimeout(timeout);
          console.log('PDF parseado correctamente');
          try {
            const content = pdfParser.getRawTextContent();
            console.log('Contenido extraído, longitud:', content.length);
            
            // Verificar que el contenido no esté vacío
            if (!content || content.trim().length === 0) {
              reject(new Error('El PDF no contiene texto extraíble'));
              return;
            }
            
            resolve(content);
          } catch (extractError) {
            console.error('Error al extraer contenido:', extractError);
            reject(new Error('Error al extraer el contenido del PDF'));
          }
        });
        
        console.log('Iniciando parseo del PDF');
        pdfParser.loadPDF(tempFilePath);
      });

      // Limpiar archivo temporal
      try {
        await fs.unlink(tempFilePath);
        console.log('Archivo temporal eliminado');
      } catch (cleanupError) {
        console.warn('No se pudo eliminar el archivo temporal:', cleanupError);
        // Continuamos de todos modos
      }

      const response = {
        fileName,
        contenido: parsedText,
        nombreOriginal: uploadedFile.name
      };

      console.log('Enviando respuesta exitosa');
      return NextResponse.json(response, {
        headers: {
          'Content-Type': 'application/json',
          'FileName': fileName
        }
      });

    } catch (parseError: unknown) {
      const typedError = parseError as Error;
      console.error('Error detallado al procesar PDF:', typedError);
      // Intentar limpiar el archivo temporal si existe
      try {
        await fs.access(tempFilePath);
        await fs.unlink(tempFilePath);
        console.log('Archivo temporal eliminado después del error');
      } catch (e) {
        console.log('No se pudo eliminar el archivo temporal:', e);
      }
      
      return NextResponse.json(
        { 
          error: 'Error al procesar el PDF', 
          detalles: typedError?.message || String(typedError) || 'Error desconocido'
        },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    const typedError = error as Error;
    console.error('Error general en el servidor:', typedError);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor', 
        detalles: typedError?.message || String(typedError) || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}