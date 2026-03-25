// backend/src/controllers/claseMuestraController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

// Configurar transporter de nodemailer (ya deberías tenerlo configurado)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // true para 465, false para otros
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export class ClaseMuestraController {
  static async create(req: Request, res: Response) {
    try {
      const { correo, tipoCurso, nivel, diaPreferido, horario } = req.body;

      // Validaciones existentes...
      if (!correo || !tipoCurso || !nivel || !diaPreferido || !horario) {
        return res.status(400).json({
          error: 'Todos los campos son requeridos'
        });
      }

      const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
      if (!emailRegex.test(correo)) {
        return res.status(400).json({
          error: 'Formato de correo inválido'
        });
      }

      const tiposPermitidos = ['Individuales', 'Grupales'];
      if (!tiposPermitidos.includes(tipoCurso)) {
        return res.status(400).json({
          error: 'Tipo de curso no válido'
        });
      }

      const nivelesPermitidos = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2'];
      if (!nivelesPermitidos.includes(nivel)) {
        return res.status(400).json({
          error: 'Nivel no válido'
        });
      }

      const fechaPreferida = new Date(diaPreferido);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      if (isNaN(fechaPreferida.getTime())) {
        return res.status(400).json({
          error: 'Fecha no válida'
        });
      }
      
      if (fechaPreferida < hoy) {
        return res.status(400).json({
          error: 'La fecha debe ser hoy o una fecha futura'
        });
      }

      // Guardar en base de datos
      const claseMuestra = await prisma.claseMuestra.create({
        data: {
          correo,
          tipoCurso,
          nivel,
          diaPreferido: fechaPreferida,
          horario
        }
      });

      // =============================================
      // ENVIAR CORREO DE NOTIFICACIÓN
      // =============================================
      
      // Formatear fecha para mostrar bonito
      const fechaFormateada = fechaPreferida.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      // Email para TI (notificación)
      const adminEmail = process.env.EMAIL_USER || 'infofrancaisintelligent@gmail.com'; // Cambia por tu email
      
      const adminMailOptions = {
        from: process.env.SMTP_FROM || '"Français Intelligent" <noreply@francaisintelligent.com>',
        to: adminEmail,
        subject: '📚 NUEVA SOLICITUD DE CLASE MUESTRA',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #150354; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #150354; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .label { font-weight: bold; color: #150354; }
              .button { background: #150354; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
              .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎓 Nueva Solicitud</h1>
                <p>Clase Muestra - Français Intelligent</p>
              </div>
              <div class="content">
                <h2>¡Alguien quiere una clase muestra!</h2>
                <p>Se ha recibido una nueva solicitud de clase muestra. Aquí están los detalles:</p>
                
                <div class="info-box">
                  <p><span class="label">📧 Correo del alumno:</span> ${correo}</p>
                  <p><span class="label">📚 Tipo de curso:</span> ${tipoCurso}</p>
                  <p><span class="label">🎯 Nivel:</span> ${nivel}</p>
                  <p><span class="label">📅 Día preferido:</span> ${fechaFormateada}</p>
                  <p><span class="label">⏰ Horario preferido:</span> ${horario}</p>
                  <p><span class="label">🆔 ID de solicitud:</span> ${claseMuestra.id}</p>
                </div>
                
                <p><strong>Próximos pasos:</strong></p>
                <ol>
                  <li>Contactar al alumno para confirmar disponibilidad</li>
                  <li>Coordinar el horario exacto</li>
                  <li>Enviar el enlace de la clase muestra</li>
                </ol>
                
                <a href="mailto:${correo}" class="button">📧 Responder al alumno</a>
              </div>
              <div class="footer">
                <p>Français Intelligent - Escuela de Francés</p>
                <p>Este es un correo automático de notificación</p>
              </div>
            </div>
          </body>
          </html>
        `
      };
      
      // Email de confirmación para el alumno (opcional pero recomendado)
      const studentMailOptions = {
        from: process.env.SMTP_FROM || '"Français Intelligent" <noreply@francaisintelligent.com>',
        to: correo,
        subject: '🎓 ¡Hemos recibido tu solicitud de clase muestra!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #150354; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #A8DADC; }
              .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎓 ¡Gracias por tu interés!</h1>
                <p>Clase Muestra - Français Intelligent</p>
              </div>
              <div class="content">
                <h2>¡Hola!</h2>
                <p>Hemos recibido tu solicitud de clase muestra. Estos son los datos que nos enviaste:</p>
                
                <div class="info-box">
                  <p><strong>📚 Tipo de curso:</strong> ${tipoCurso}</p>
                  <p><strong>🎯 Nivel:</strong> ${nivel}</p>
                  <p><strong>📅 Día preferido:</strong> ${fechaFormateada}</p>
                  <p><strong>⏰ Horario preferido:</strong> ${horario}</p>
                </div>
                
                <p><strong>📧 ¿Qué sigue?</strong></p>
                <p>En las próximas 24 horas, uno de nuestros asesores se pondrá en contacto contigo para confirmar la disponibilidad y enviarte el enlace de la clase muestra.</p>
                
                <p>Si tienes alguna pregunta, no dudes en contactarnos respondiendo a este correo.</p>
                
                <p>¡Saludos y bienvenido a Français Intelligent! 🇫🇷</p>
              </div>
              <div class="footer">
                <p>Français Intelligent - Escuela de Francés</p>
                <p>Este es un correo automático, por favor no responder directamente a este mensaje</p>
              </div>
            </div>
          </body>
          </html>
        `
      };
      
      // Enviar correos
      try {
        await transporter.sendMail(adminMailOptions);
        console.log('✅ Correo de notificación enviado al admin');
        
        await transporter.sendMail(studentMailOptions);
        console.log('✅ Correo de confirmación enviado al alumno');
      } catch (emailError) {
        console.error('❌ Error al enviar correos:', emailError);
        // No lanzamos error para que la solicitud se guarde igual
      }

      res.status(201).json({
        message: 'Solicitud de clase muestra registrada exitosamente',
        data: claseMuestra
      });

    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(400).json({
          error: 'Este correo ya tiene una solicitud activa'
        });
      }

      console.error('Error al crear clase muestra:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Obtener todas las solicitudes (admin)
  static async getAll(req: Request, res: Response) {
    try {
      const solicitudes = await prisma.claseMuestra.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json(solicitudes);
    } catch (error) {
      console.error('Error al obtener solicitudes:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Obtener solicitud por ID
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const solicitud = await prisma.claseMuestra.findUnique({
        where: { id }
      });

      if (!solicitud) {
        return res.status(404).json({
          error: 'Solicitud no encontrada'
        });
      }

      res.status(200).json(solicitud);
    } catch (error) {
      console.error('Error al obtener solicitud:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Eliminar solicitud (admin)
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      await prisma.claseMuestra.delete({
        where: { id }
      });

      res.status(200).json({
        message: 'Solicitud eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar solicitud:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }
}