import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import rateLimit from 'express-rate-limit';

const router = Router();
const chatController = new ChatController();

// Rate limiting específico para el chat
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 mensajes por IP
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Has enviado demasiados mensajes. Por favor, espera 15 minutos.',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rutas del chat
router.post('/chat/send', chatLimiter, chatController.sendMessage);

// Endpoint de salud para el chat
router.get('/chat/health', (req, res) => {
  res.json({
    success: true,
    message: 'Chat service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

export default router;