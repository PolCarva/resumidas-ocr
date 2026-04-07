/**
 * Utilidades para encriptar y desencriptar datos en el cliente
 * Usa Web Crypto API para operaciones criptográficas seguras
 */

// Clave de encriptación derivada de una contraseña
// En producción, esta clave debería obtenerse de forma segura (ej. de variables de entorno)
const ENCRYPTION_KEY_SALT = 'resumidas-cuentas-salt';
const ENCRYPTION_KEY_ITERATIONS = 100000;
const ENCRYPTION_KEY_LENGTH = 32; // 256 bits

/**
 * Deriva una clave criptográfica a partir de una contraseña
 * @param password - Contraseña para derivar la clave
 * @returns Clave derivada como ArrayBuffer
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  // Convertir la contraseña y salt a ArrayBuffer
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(ENCRYPTION_KEY_SALT);
  
  // Importar la contraseña como material criptográfico
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Derivar la clave usando PBKDF2
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ENCRYPTION_KEY_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encripta datos usando AES-GCM
 * @param data - Datos a encriptar (objeto o string)
 * @param password - Contraseña para encriptar
 * @returns Datos encriptados en formato string
 */
export async function encrypt(data: any, password: string): Promise<string> {
  try {
    // Convertir datos a string JSON si es un objeto
    const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const encoder = new TextEncoder();
    const plaintextBuffer = encoder.encode(plaintext);
    
    // Generar un IV aleatorio
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Derivar clave de encriptación
    const key = await deriveKey(password);
    
    // Encriptar los datos
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      plaintextBuffer
    );
    
    // Combinar IV y datos encriptados
    const result = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Convertir a string base64 usando un método compatible con TypeScript
    return btoa(Array.from(result).map(byte => String.fromCharCode(byte)).join(''));
  } catch (error) {
    console.error('Error al encriptar datos:', error);
    throw new Error('Error al encriptar datos');
  }
}

/**
 * Desencripta datos previamente encriptados
 * @param encryptedData - Datos encriptados en formato base64
 * @param password - Contraseña para desencriptar
 * @param parseJson - Si debe intentar parsear el resultado como JSON
 * @returns Datos desencriptados
 */
export async function decrypt(encryptedData: string, password: string, parseJson = true): Promise<any> {
  try {
    // Convertir de base64 a ArrayBuffer
    const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extraer IV (primeros 12 bytes) y datos encriptados
    const iv = encryptedBytes.slice(0, 12);
    const encryptedBuffer = encryptedBytes.slice(12);
    
    // Derivar clave de desencriptación
    const key = await deriveKey(password);
    
    // Desencriptar los datos
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encryptedBuffer
    );
    
    // Convertir a string
    const decoder = new TextDecoder();
    const decryptedText = decoder.decode(decryptedBuffer);
    
    // Intentar parsear como JSON si se solicita
    if (parseJson) {
      try {
        return JSON.parse(decryptedText);
      } catch (e) {
        // Si no es JSON válido, devolver como string
        return decryptedText;
      }
    }
    
    return decryptedText;
  } catch (error) {
    console.error('Error al desencriptar datos:', error);
    throw new Error('Error al desencriptar datos');
  }
}

/**
 * Obtiene la clave de encriptación del almacenamiento local o la genera
 * @returns Clave de encriptación
 */
export function getEncryptionPassword(): string {
  // Primero intentar obtener la clave de las variables de entorno
  const envKey = process.env.NEXT_PUBLIC_ENCRYPTION_KEY;
  
  if (envKey) {
    return envKey;
  }
  
  // Si no hay clave en las variables de entorno, intentar obtenerla del almacenamiento local
  let password = typeof window !== 'undefined' ? localStorage.getItem('encryption_password') : null;
  
  if (!password) {
    // Generar una clave aleatoria solo si estamos en el navegador
    if (typeof window !== 'undefined') {
      const randomBytes = window.crypto.getRandomValues(new Uint8Array(16));
      password = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('encryption_password', password);
    } else {
      // Clave por defecto para entorno de servidor (solo para desarrollo)
      password = 'default-encryption-key-for-server-side';
    }
  }
  
  return password;
} 