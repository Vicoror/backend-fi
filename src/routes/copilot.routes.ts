import { Router, Request, Response } from 'express';

const router = Router();

// Endpoint para información del runtime
router.get('/openai/info', async (req: Request, res: Response) => {
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
});

// Endpoint universal para TODO
router.post('/openai', async (req: Request, res: Response) => {
  try {
    console.log('📨 POST /openai - Body completo:', JSON.stringify(req.body, null, 2));

    // CASO 1: Es un mensaje de conexión (agent/connect)
    if (req.body.method === 'agent/connect') {
      console.log('🔌 Mensaje de conexión detectado');
      return res.json({
        type: 'connection',
        agentId: req.body.params?.agentId || 'default',
        status: 'connected'
      });
    }

    // CASO 2: Extraer mensajes del usuario de cualquier formato
    let textoUsuario = '';
    
    // Buscar en diferentes lugares donde puede venir el mensaje
    if (req.body.messages && Array.isArray(req.body.messages)) {
      // Formato estándar: { messages: [...] }
      const ultimoMensaje = req.body.messages
        .filter((m: any) => m.role === 'user' || m.role === 'human')
        .pop();
      textoUsuario = ultimoMensaje?.content || '';
    } 
    else if (req.body.message) {
      // Formato simple: { message: "texto" }
      textoUsuario = req.body.message;
    }
    else if (req.body.content) {
      // Formato directo: { content: "texto" }
      textoUsuario = req.body.content;
    }

    console.log('📝 Texto extraído:', textoUsuario);

    // Respuestas basadas en palabras clave
    let respuesta = "No entendí. ¿Puedes repetir?";
    const textoLower = textoUsuario.toLowerCase();
    
    if (textoLower.includes('hola')) {
      respuesta = "👋 ¡Hola! Soy tu asistente para practicar francés. ¿Sobre qué tema te gustaría conversar?";
    } 
    else if (textoLower.includes('verbo')) {
      respuesta = "📚 Los verbos en francés son muy importantes. Por ejemplo: 'parler' (hablar), 'manger' (comer), 'dormir' (dormir). ¿Quieres practicar alguno?";
    }
    else if (textoLower.includes('gracias')) {
      respuesta = "😊 ¡De nada! Sigue practicando. ¿Quieres seguir con otro tema?";
    }
    else if (textoLower.includes('adiós')) {
      respuesta = "👋 ¡Hasta luego! Vuelve cuando quieras practicar más.";
    }
    
    // Formato de respuesta que CopilotKit espera
    res.json({
      role: 'assistant',
      content: respuesta,
      id: Date.now().toString()
    });
    
  } catch (error) {
    console.error('❌ Error en POST /openai:', error);
    res.status(500).json({ error: 'Error en el asistente' });
  }
});

export default router;