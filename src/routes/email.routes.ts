import { Router } from 'express';
import { resend } from '../lib/resend';

const router = Router();

router.post('/enviar-email', async (req, res) => {
  try {
    const { to, nombre, folio, curso, horario, dias, precio } = req.body;

    const { data, error } = await resend.emails.send({
      from: 'Français Intelligent <onboarding@resend.com>',
      to: [to],
      subject: '🎓 Confirmación de inscripción - Français Intelligent',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #150354; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #F2F4F7; padding: 30px; border-radius: 0 0 10px 10px; }
            .curso-info { background: #A8DADC; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            .button { background: #150354; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Français Intelligent</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${nombre}!</h2>
              <p>Tu inscripción ha sido confirmada exitosamente.</p>
              
              <div class="curso-info">
                <h3 style="margin-top: 0;">Detalles del curso:</h3>
                <p><strong>Curso:</strong> ${curso}</p>
                <p><strong>Horario:</strong> ${dias} • ${horario}</p>
                <p><strong>Folio:</strong> ${folio}</p>
                <p><strong>Monto pagado:</strong> $${precio} MXN</p>
              </div>

              <h3>Próximos pasos:</h3>
              <ol>
                <li>Recibirás un correo con el acceso a la plataforma 24 horas antes del inicio.</li>
                <li>Prepara tu material: cuaderno, diccionario y muchas ganas de aprender.</li>
                <li>Únete a nuestro grupo de WhatsApp (el enlace está en tu perfil).</li>
              </ol>

              <p style="text-align: center; margin-top: 30px;">
                <a href="${process.env.FRONTEND_URL}/mis-cursos" class="button">
                  Ver mis cursos
                </a>
              </p>

              <p>¿Tienes dudas? Responde a este correo o contáctanos por el chat de la plataforma.</p>
              
              <p>¡Nos vemos en clase!<br>
              <strong>Equipo Français Intelligent</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Français Intelligent. Todos los derechos reservados.</p>
              <p>Este es un correo automático, por favor no respondas directamente.</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      return res.status(400).json({ error });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error enviando email:', error);
    res.status(500).json({ error: 'Error al enviar el email' });
  }
});

export default router;