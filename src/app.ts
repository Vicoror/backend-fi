import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import checkoutRoutes from './routes/checkout';
import cursosRoutes from './routes/cursos.routes';
import registroRoutes from './routes/registro.routes';
import emailRoutes from './routes/email.routes';
import webhookRoutes from './routes/webhook.routes';

const app = express();

// =============================================
// 1. PRIMERO: CORS (SIEMPRE PRIMERO)
// =============================================
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'https://francaisintelligent.vercel.app',
      'https://francaisintelligentback.vercel.app',
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
app.use(express.json());
app.use(cookieParser());

// =============================================
// 4. RUTAS
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
      webhook: '/webhook (POST only)'
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

app.use('/auth', authRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/cursos', cursosRoutes);
app.use('/registro', registroRoutes);
app.use('/api', emailRoutes);

export default app;