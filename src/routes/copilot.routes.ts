// copilot.routes.ts
import { Router, Request, Response } from 'express';

const router = Router();

// Endpoint para información del runtime - ¡CRÍTICO!
router.get('/openai/info', async (req: Request, res: Response) => {
  try {
    res.json({
      actions: [],
      version: '1.0.0',
      agents: [{
        name: 'default',
        description: 'Asistente de francés',
        instructions: 'Eres un asistente amigable para aprender francés.',
        tools: []
      }]
    });
  } catch (error) {
    console.error('Error en /info:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Endpoint para conversación
router.post('/openai', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Mensajes inválidos' });
    }

    const ultimoMensaje = messages[messages.length - 1]?.content || '';
    
    // Respuestas basadas en palabras clave
    let respuesta = "No entendí. ¿Puedes repetir?";
    
    if (ultimoMensaje.toLowerCase().includes('hola')) {
      respuesta = "👋 ¡Hola! Soy tu asistente para practicar francés. ¿Sobre qué tema te gustaría conversar?";
    } 
    else if (ultimoMensaje.toLowerCase().includes('verbo')) {
      respuesta = "📚 Los verbos en francés son muy importantes. Por ejemplo: 'parler' (hablar), 'manger' (comer), 'dormir' (dormir). ¿Quieres practicar alguno?";
    }
    else if (ultimoMensaje.toLowerCase().includes('gracias')) {
      respuesta = "😊 ¡De nada! Sigue practicando. ¿Quieres seguir con otro tema?";
    }
    else if (ultimoMensaje.toLowerCase().includes('adiós')) {
      respuesta = "👋 ¡Hasta luego! Vuelve cuando quieras practicar más.";
    }
    
    res.json({
      role: 'assistant',
      content: respuesta
    });
    
  } catch (error) {
    console.error('Error en POST /openai:', error);
    res.status(500).json({ error: 'Error en el asistente' });
  }
});

export default router;