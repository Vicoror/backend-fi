import { Router, Request, Response } from 'express';

const router = Router();

// Endpoint para información del runtime
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

// Endpoint para conversación - VERSIÓN CORREGIDA
router.post('/openai', async (req: Request, res: Response) => {
  try {
    console.log('📨 Body recibido:', JSON.stringify(req.body, null, 2));
    
    // CopilotKit envía los mensajes en diferentes formatos
    let mensajes = [];
    
    if (req.body.messages && Array.isArray(req.body.messages)) {
      // Formato 1: { messages: [...] }
      mensajes = req.body.messages;
    } else if (req.body.message) {
      // Formato 2: { message: "texto" }
      mensajes = [{ role: 'user', content: req.body.message }];
    } else if (Array.isArray(req.body)) {
      // Formato 3: array directo
      mensajes = req.body;
    } else {
      console.log('❌ Formato no reconocido');
      return res.status(400).json({ 
        error: 'Formato de mensajes no reconocido',
        received: req.body 
      });
    }

    // Obtener el último mensaje del usuario
    const ultimoMensajeUser = [...mensajes]
      .reverse()
      .find(m => m.role === 'user' || m.role === 'human');
    
    const textoUsuario = ultimoMensajeUser?.content?.toLowerCase() || '';
    
    console.log('📝 Texto usuario:', textoUsuario);

    // Respuestas basadas en palabras clave
    let respuesta = "No entendí. ¿Puedes repetir?";
    
    if (textoUsuario.includes('hola')) {
      respuesta = "👋 ¡Hola! Soy tu asistente para practicar francés. ¿Sobre qué tema te gustaría conversar?";
    } 
    else if (textoUsuario.includes('verbo')) {
      respuesta = "📚 Los verbos en francés son muy importantes. Por ejemplo: 'parler' (hablar), 'manger' (comer), 'dormir' (dormir). ¿Quieres practicar alguno?";
    }
    else if (textoUsuario.includes('gracias')) {
      respuesta = "😊 ¡De nada! Sigue practicando. ¿Quieres seguir con otro tema?";
    }
    else if (textoUsuario.includes('adiós')) {
      respuesta = "👋 ¡Hasta luego! Vuelve cuando quieras practicar más.";
    }
    
    // CopilotKit espera este formato exacto
    res.json({
      role: 'assistant',
      content: respuesta,
      id: Date.now().toString()
    });
    
  } catch (error) {
    console.error('Error en POST /openai:', error);
    res.status(500).json({ error: 'Error en el asistente' });
  }
});

export default router;