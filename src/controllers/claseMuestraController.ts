// backend/src/controllers/claseMuestraController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { transporter } from '../lib/nodemailer'; // ← Importar desde lib

const prisma = new PrismaClient();

export class ClaseMuestraController {
  static async create(req: Request, res: Response) {
    try {
      const { correo, tipoCurso, nivel, diaPreferido, horario } = req.body;

      console.log('📝 Datos recibidos:', { correo, tipoCurso, nivel, diaPreferido, horario });

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

      console.log('✅ Solicitud guardada, ID:', claseMuestra.id);

      // =============================================
      // ENVIAR CORREOS USANDO EL TRANSPORTER DE LIB
      // =============================================
      
      // Formatear fecha
      const fechaFormateada = fechaPreferida.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      const adminEmail = process.env.EMAIL_USER || 'infofrancaisintelligent@gmail.com';
      
      // Email para ADMIN (notificación)
      const adminMailOptions = {
        from: `"Français Intelligent" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: '📚 NUEVA SOLICITUD DE CLASE MUESTRA',
        text: `
Nueva solicitud de clase muestra:

Correo del alumno: ${correo}
Tipo de curso: ${tipoCurso}
Nivel: ${nivel}
Día preferido: ${fechaFormateada}
Horario preferido: ${horario}
ID de solicitud: ${claseMuestra.id}

Responde a este correo para coordinar la clase muestra.
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #150354;">🎓 Nueva Solicitud de Clase Muestra</h2>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p><strong>📧 Correo del alumno:</strong> ${correo}</p>
              <p><strong>📚 Tipo de curso:</strong> ${tipoCurso}</p>
              <p><strong>🎯 Nivel:</strong> ${nivel}</p>
              <p><strong>📅 Día preferido:</strong> ${fechaFormateada}</p>
              <p><strong>⏰ Horario preferido:</strong> ${horario}</p>
              <p><strong>🆔 ID:</strong> ${claseMuestra.id}</p>
            </div>
            <p>Responde a este correo para coordinar la clase muestra.</p>
            <hr>
            <p style="font-size: 12px; color: #666;">Français Intelligent - Escuela de Francés</p>
          </div>
        `
      };
      
      // Email para ALUMNO (confirmación)
      const studentMailOptions = {
        from: `"Français Intelligent" <${process.env.SMTP_USER}>`,
        to: correo,
        subject: '🎓 ¡Hemos recibido tu solicitud de clase muestra!',
        text: `
¡Hola!

Hemos recibido tu solicitud de clase muestra. Estos son los datos que nos enviaste:

Tipo de curso: ${tipoCurso}
Nivel: ${nivel}
Día preferido: ${fechaFormateada}
Horario preferido: ${horario}

En las próximas 24 horas, uno de nuestros asesores se pondrá en contacto contigo para confirmar la disponibilidad y enviarte el enlace de la clase muestra.

¡Saludos y bienvenid@ a Français Intelligent! 🇫🇷
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #150354;">🎓 ¡Gracias por tu interés!</h2>
            <p>Hemos recibido tu solicitud de clase muestra. Estos son los datos que nos enviaste:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p><strong>📚 Tipo de curso:</strong> ${tipoCurso}</p>
              <p><strong>🎯 Nivel:</strong> ${nivel}</p>
              <p><strong>📅 Día preferido:</strong> ${fechaFormateada}</p>
              <p><strong>⏰ Horario preferido:</strong> ${horario}</p>
            </div>
            <p>📧 En las próximas 24 horas, uno de nuestros asesores se pondrá en contacto contigo para confirmar la disponibilidad y enviarte el enlace de la clase muestra.</p>
            <p>Si tienes alguna pregunta, no dudes en contactarnos respondiendo a este correo.</p>
            <p>¡Saludos y bienvenido a Français Intelligent! 🇫🇷</p>
            <hr>
            <p style="font-size: 12px; color: #666;">Français Intelligent - Escuela de Francés</p>
          </div>
        `
      };
      
      // Enviar correos
      let adminEmailSent = false;
      let studentEmailSent = false;
      
      try {
        console.log('📧 Enviando correo al admin...');
        await transporter.sendMail(adminMailOptions);
        console.log('✅ Correo admin enviado');
        adminEmailSent = true;
      } catch (adminError) {
        console.error('❌ Error enviando correo admin:', adminError);
      }
      
      try {
        console.log('📧 Enviando correo al alumno...');
        await transporter.sendMail(studentMailOptions);
        console.log('✅ Correo alumno enviado');
        studentEmailSent = true;
      } catch (studentError) {
        console.error('❌ Error enviando correo alumno:', studentError);
      }

      res.status(201).json({
        message: 'Solicitud de clase muestra registrada exitosamente',
        data: claseMuestra,
        emailsSent: {
          admin: adminEmailSent,
          student: studentEmailSent
        }
      });

    } catch (error: any) {
      console.error('❌ Error general:', error);
      
      if (error.code === 'P2002') {
        return res.status(400).json({
          error: 'Este correo ya tiene una solicitud activa'
        });
      }

      res.status(500).json({
        error: 'Error interno del servidor',
        details: error.message
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