import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';

// Aumentar el límite de timeout para videos grandes en Vercel
export const config = {
  api: {
    bodyParser: false, // Importante: desactivar bodyParser de Vercel para uploads
    externalResolver: true,
    sizeLimit: '100mb', // Aumentar límite a 100mb
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CONFIGURACIÓN CORS MEJORADA - EJECUTAR ANTES QUE EXPRESS
  const allowedOrigins = [
    'http://localhost:5173',
    'https://francaisintelligent.vercel.app',
    'https://francaisintelligentback.vercel.app',
    'https://backend-fi.vercel.app'
  ];
  
  const origin = req.headers.origin;
  
  // Headers CORS para todas las respuestas
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Para requests sin origin o no permitidos, usar el frontend por defecto
    res.setHeader('Access-Control-Allow-Origin', 'https://francaisintelligent.vercel.app');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight por 24 horas
  
  // Manejar OPTIONS (preflight) inmediatamente
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Pasar el control a Express
  return app(req, res);
}