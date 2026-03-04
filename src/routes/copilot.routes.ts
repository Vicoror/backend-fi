// routes/copilot.routes.ts
import { Router, Request, Response } from 'express';

const router = Router();

// Endpoint para CopilotKit - versión SIN OpenAI
router.post('/openai', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    const ultimoMensaje = messages[messages.length - 1]?.content || '';
    
    // Respuestas basadas en palabras clave
    let respuesta = "No entendí. ¿Puedes repetir?";
    
    if (ultimoMensaje.includes('hola') || ultimoMensaje.includes('Hola')) {
      respuesta = "👋 ¡Hola! Soy tu asistente para practicar francés. ¿Sobre qué tema te gustaría conversar?";
    } 
    else if (ultimoMensaje.includes('verbo') || ultimoMensaje.includes('Verbo')) {
      respuesta = "📚 Los verbos en francés son muy importantes. Por ejemplo: 'parler' (hablar), 'manger' (comer), 'dormir' (dormir). ¿Quieres practicar alguno?";
    }
    else if (ultimoMensaje.includes('gracias') || ultimoMensaje.includes('Gracias')) {
      respuesta = "😊 ¡De nada! Sigue practicando, el francés es un idioma hermoso. ¿Quieres seguir con otro tema?";
    }
    else if (ultimoMensaje.includes('adiós') || ultimoMensaje.includes('Adiós')) {
      respuesta = "👋 ¡Hasta luego! Vuelve cuando quieras practicar más.";
    }
    
    res.json({
      role: 'assistant',
      content: respuesta
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error en el asistente' });
  }
});

export default router;