import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import checkoutRoutes from './routes/checkout';
import cursosRoutes from './routes/cursos.routes';

const app = express();

// CORS - Configuración para aceptar requests del frontend
app.use(cors({
  origin: function (origin, callback) {
    // Lista de orígenes permitidos
    const allowedOrigins = [
      'http://localhost:5173',
      'https://francaisintelligent.vercel.app',
      'https://francaisintelligentback.vercel.app',
    ];
    
    // Permitir requests sin origen (Postman, mobile apps)
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

app.use(express.json());
app.use(cookieParser());

// Rutas
app.use('/auth', authRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/cursos', cursosRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    service: 'francaisintelligentback',
    timestamp: new Date().toISOString()
  });
});

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Backend ejecutándose en http://localhost:${PORT}`);
  });
}

export default app;