import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary'; // ← AGREGAR ESTA LÍNEA
import authRoutes from './routes/auth.routes';
import checkoutRoutes from './routes/checkout';
import cursosRoutes from './routes/cursos.routes';
import registroRoutes from './routes/registro.routes';
import webhookRoutes from './routes/webhook.routes';
import verificarEmailRoutes from './routes/verificar-email.routes';
import passwordRoutes from './routes/password.routes'
import aspiranteRoutes from './routes/aspirante.routes';
import chatRoutes from './routes/chat.routes';  // ✅ Esto está bien importado
import studentRoutes from './routes/student.routes';
import carruselRoutes from './routes/carrusel.routes';
import emailRoutes from './routes/email.routes'
import claseMuestraRoutes from './routes/claseMuestraRoutes';
import temariosRoutes from './routes/temarios.routes';
// ❌ NO importar cloudinarySignatureRoutes desde ./api/

const app = express();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =============================================
// 1. PRIMERO: CORS (SIEMPRE PRIMERO)
// =============================================
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'https://francaisintelligent.vercel.app',
      'https://francaisintelligentback.vercel.app',
      'https://backend-fi.vercel.app',
    ];
    
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log('Origen bloqueado por CORS:', origin);
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// =============================================
// 2. SEGUNDO: WEBHOOKS (body crudo) - ANTES de express.json()
// =============================================
app.use('/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

// =============================================
// 3. TERCERO: MIDDLEWARES NORMALES
// =============================================
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());

// =============================================
// 4. RUTAS - ORDEN OPTIMIZADO
// =============================================
app.get('/', (req, res) => {
  res.json({
    name: 'Français Intelligent API',
    status: 'online',
    endpoints: {
      health: '/health',
      auth: '/auth',
      cursos: '/cursos',
      checkout: '/checkout',
      webhook: '/webhook (POST only)',
      chat: '/api/chat (send & health)',
      carrusel: '/api/carrusel (public) & /api/carrusel/admin (admin)'
    }
  });
});

app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    service: 'francaisintelligentback',
    timestamp: new Date().toISOString()
  });
});

// 🟢 PRIMERO: Rutas públicas (como chat)
app.use('/api', chatRoutes);  
app.use('/api/carrusel', carruselRoutes);
app.use('/clase-muestra', claseMuestraRoutes);


// 🟡 SEGUNDO: Rutas semi-públicas
app.use('/cursos', cursosRoutes);
app.use('/checkout', checkoutRoutes);

// 🔵 TERCERO: Rutas que requieren autenticación
app.use('/auth', authRoutes);                   
app.use('/usuarios', verificarEmailRoutes);
app.use('/auth', passwordRoutes);
app.use('/api', temariosRoutes);

// 🟣 CUARTO: Rutas específicas
app.use('/registro', registroRoutes);
app.use('/api/aspirantes', aspiranteRoutes);
app.use('/api/student', studentRoutes);
app.use('/api', emailRoutes)

// =============================================
// RUTA DE FIRMA DE CLOUDINARY
// =============================================
/**
 * GET /api/cloudinary-signature
 * Endpoint para obtener firma de Cloudinary para subida directa desde frontend
 */
app.get('/api/cloudinary-signature', async (req, res) => {
  try {
    // Configurar CORS adicional si es necesario
    const origin = req.headers.origin;
    if (origin && origin.includes('francaisintelligent.vercel.app')) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', 'https://francaisintelligent.vercel.app');
    }
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Verificar que las variables de entorno existen
    if (!process.env.CLOUDINARY_API_SECRET) {
      console.error('CLOUDINARY_API_SECRET no está configurado');
      return res.status(500).json({ error: 'Configuración de Cloudinary incompleta' });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Crear la firma
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder: 'carrusel',
      },
      process.env.CLOUDINARY_API_SECRET
    );

    console.log('✅ Firma de Cloudinary generada correctamente');

    res.json({
      signature,
      timestamp,
      api_key: process.env.CLOUDINARY_API_KEY,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      folder: 'carrusel',
    });
  } catch (error) {
    console.error('❌ Error generando firma de Cloudinary:', error);
    res.status(500).json({ error: 'Error al generar firma de Cloudinary' });
  }
});

export default app;