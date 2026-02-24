import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { transporter } from '../lib/nodemailer';

// Validar email
function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length <= 50;
}

// Validar horario (formato HH:00)
function isValidHorario(horario: string): boolean {
  const regex = /^([01]?[0-9]|2[0-3]):00$/;
  return regex.test(horario);
}

// Niveles permitidos
const nivelesPermitidos = [
  'A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 
  'DELF A2', 'DELF B1', 'DELF B2'
];

export async function registrarAspirante(req: Request, res: Response) {
  try {
    const { email, horario1, horario2, nivel } = req.body;

    // Validaciones
    if (!email || !horario1 || !horario2 || !nivel) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son obligatorios' 
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email inválido o muy largo (máx. 50 caracteres)' 
      });
    }

    if (!isValidHorario(horario1) || !isValidHorario(horario2)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Formato de horario inválido (debe ser HH:00)' 
      });
    }

    if (!nivelesPermitidos.includes(nivel)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nivel no válido' 
      });
    }

    // Guardar en base de datos
    const aspirante = await prisma.aspirante.create({
      data: {
        email,
        horario1,
        horario2,
        nivel
      }
    });

    console.log('✅ Aspirante registrado:', aspirante.id);

    // Enviar email de confirmación
    try {
      await transporter.sendMail({
        from: `"Français Intelligent" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject: '🙏 Gracias por tu interés en Français Intelligent',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Work Sans', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #150354; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #F2F4F7; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { background: #A8DADC; color: #150354; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="font-family: 'Jua', sans-serif;">🎓 Français Intelligent</h1>
              </div>
              <div class="content">
                <h2 style="color: #150354;">¡Gracias por tu interés!</h2>
                
                <p>Hemos recibido tu solicitud de notificación para el nivel <strong>${nivel}</strong>.</p>
                
                <p>Te compartiremos los cursos cuando estén disponibles. Mientras tanto, te invitamos a:</p>
                
                <ul>
                  <li>Explorar nuestros cursos disponibles actualmente</li>
                  <li>Realizar nuestro test de nivel si aún no lo has hecho</li>
                  <li>Seguirnos en redes sociales para estar al tanto de novedades</li>
                </ul>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL}/cursos" class="button">
                    Ver cursos disponibles
                  </a>
                </div>

                <p><strong>Datos registrados:</strong></p>
                <ul>
                  <li>📧 Email: ${email}</li>
                  <li>⏰ Horario preferente 1: ${horario1}</li>
                  <li>⏰ Horario preferente 2: ${horario2}</li>
                  <li>📚 Nivel de interés: ${nivel}</li>
                </ul>

                <p style="margin-top: 30px; font-size: 0.9em; color: #666;">
                  ¿Tienes dudas? Contáctanos respondiendo a este correo.<br>
                  <strong>¡Te esperamos pronto!</strong>
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      });
      console.log('✅ Email de confirmación enviado a:', email);
    } catch (error) {
      console.error('❌ Error enviando email:', error);
    }

    res.status(201).json({
      success: true,
      message: 'Registro exitoso. Te notificaremos cuando haya disponibilidad.',
      data: {
        id: aspirante.id,
        email: aspirante.email,
        nivel: aspirante.nivel
      }
    });

  } catch (error) {
    console.error('❌ Error registrando aspirante:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar la solicitud' 
    });
  }
}

// Obtener horarios disponibles (para el select)
export function getHorariosDisponibles(req: Request, res: Response) {
  const horarios = [];
  for (let i = 7; i <= 21; i++) {
    horarios.push(`${i.toString().padStart(2, '0')}:00`);
  }
  res.json({ horarios });
}

// Obtener niveles disponibles (para el select)
export function getNivelesDisponibles(req: Request, res: Response) {
  res.json({ niveles: nivelesPermitidos });
}