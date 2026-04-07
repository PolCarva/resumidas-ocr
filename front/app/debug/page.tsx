'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Clipboard, ClipboardCheck, Wrench } from 'lucide-react';

export default function DebugPage() {
  const [invalidResponse, setInvalidResponse] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [repairedJson, setRepairedJson] = useState<string | null>(null);
  const [repairAttempted, setRepairAttempted] = useState(false);

  useEffect(() => {
    // Cargar la última respuesta no válida desde localStorage
    const lastInvalidResponse = localStorage.getItem('lastInvalidResponse');
    if (lastInvalidResponse) {
      setInvalidResponse(lastInvalidResponse);
    }
  }, []);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(invalidResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem('lastInvalidResponse');
    setInvalidResponse('');
    setRepairedJson(null);
    setRepairAttempted(false);
  };

  const attemptRepairJson = () => {
    if (!invalidResponse) return;
    
    try {
      // Intentar parsear primero (puede que ya sea válido)
      JSON.parse(invalidResponse);
      setRepairedJson(invalidResponse);
      setRepairAttempted(true);
      return;
    } catch (error) {
      console.log('Intentando reparar JSON incompleto...', error);
      
      let repairedJson = invalidResponse;
      
      // Verificar si el JSON comienza correctamente
      if (!repairedJson.trim().startsWith('{')) {
        repairedJson = '{' + repairedJson;
      }
      
      // Contar llaves abiertas y cerradas para detectar desbalance
      const openBraces = (repairedJson.match(/{/g) || []).length;
      const closeBraces = (repairedJson.match(/}/g) || []).length;
      
      // Añadir llaves faltantes al final
      if (openBraces > closeBraces) {
        const missingBraces = openBraces - closeBraces;
        repairedJson = repairedJson + '}'.repeat(missingBraces);
      }
      
      // Verificar si hay arrays incompletos
      const openBrackets = (repairedJson.match(/\[/g) || []).length;
      const closeBrackets = (repairedJson.match(/\]/g) || []).length;
      
      if (openBrackets > closeBrackets) {
        const missingBrackets = openBrackets - closeBrackets;
        
        // Buscar el último array abierto
        const lastOpenBracketPos = repairedJson.lastIndexOf('[');
        const lastCloseBracePos = repairedJson.lastIndexOf('}');
        
        if (lastOpenBracketPos > lastCloseBracePos) {
          // Si el último array está abierto al final, cerrarlo
          repairedJson = repairedJson + ']'.repeat(missingBrackets);
        } else {
          // Intentar insertar los corchetes antes de la última llave
          const parts = repairedJson.split('}');
          if (parts.length > 1) {
            parts[parts.length - 2] += ']'.repeat(missingBrackets);
            repairedJson = parts.join('}');
          }
        }
      }
      
      // Verificar si el JSON reparado es válido
      try {
        JSON.parse(repairedJson);
        console.log('JSON reparado exitosamente');
        setRepairedJson(repairedJson);
      } catch (repairError) {
        console.error('No se pudo reparar el JSON', repairError);
        setRepairedJson(null);
      }
      
      setRepairAttempted(true);
    }
  };

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Depuración de Respuestas</h1>
        <Link href="/">
          <Button variant="outline">Volver al Inicio</Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Última Respuesta No Válida</h2>
        
        {invalidResponse ? (
          <>
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold">Respuesta:</h3>
              <div className="space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopyToClipboard}
                >
                  {copied ? (
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                  ) : (
                    <Clipboard className="mr-2 h-4 w-4" />
                  )}
                  {copied ? "¡Copiado!" : "Copiar"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClear}
                >
                  Limpiar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={attemptRepairJson}
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  Intentar reparar
                </Button>
              </div>
            </div>
            
            <div className="bg-gray-100 p-4 rounded-md mb-4 overflow-auto max-h-[500px]">
              <pre className="whitespace-pre-wrap break-words text-sm">
                {invalidResponse}
              </pre>
            </div>

            {repairAttempted && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4">
                  {repairedJson ? "JSON reparado exitosamente:" : "No se pudo reparar el JSON"}
                </h2>
                
                {repairedJson && (
                  <div className="bg-green-50 p-4 rounded-md overflow-auto max-h-96 border border-green-200">
                    <pre className="whitespace-pre-wrap break-all">{repairedJson}</pre>
                  </div>
                )}
                
                {repairedJson && (
                  <div className="mt-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        navigator.clipboard.writeText(repairedJson);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? (
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                      ) : (
                        <Clipboard className="mr-2 h-4 w-4" />
                      )}
                      {copied ? "¡Copiado!" : "Copiar JSON reparado"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-gray-500">No hay respuestas no válidas guardadas.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold mb-4">Instrucciones de Depuración</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Cuando OpenAI devuelve una respuesta que no es un JSON válido, se guarda automáticamente en esta página.</li>
          <li>También se guarda un archivo de texto en el servidor para referencia adicional.</li>
          <li>Puedes copiar la respuesta para analizarla o compartirla con el soporte técnico.</li>
          <li>Revisa el formato de la respuesta para identificar por qué no es un JSON válido.</li>
          <li>Posibles problemas incluyen: formato incorrecto, caracteres especiales, o respuestas parciales.</li>
        </ol>
      </div>
    </main>
  );
} 