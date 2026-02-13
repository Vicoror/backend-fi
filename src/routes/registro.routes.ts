import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { resend } from '../lib/resend'; 

const router = Router();

// Generar folio único para estudiante
async function generarFolio(): Promise<string> {
  const ultimo = await prisma.user.findFirst({
    where: { role: 'STUDENT' },
    orderBy: { folio: 'desc' },
    select: { folio: true }
  });

  let numero = 1;
  if (ultimo?.folio) {
    const match = ultimo.folio.match(/EST(\d+)/);
    numero = match ? parseInt(match[1]) + 1 : 1;
  }

  return `EST${String(numero).padStart(3, '0')}`;
}

// POST /registro
router.post('/', async (req, res) => {
  try {
    const { 
      email, 
      nombre, 
      apellidoPaterno, 
      apellidoMaterno, 
      telefono, 
      cursoId 
    } = req.body;

    // Validaciones básicas
    if (!email || !nombre || !apellidoPaterno || !telefono || !cursoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos obligatorios deben completarse' 
      });
    }

    // Verificar que el curso existe y tiene cupo
    const curso = await prisma.course.findUnique({
      where: { id: cursoId }
    });

    if (!curso) {
      return res.status(404).json({ 
        success: false, 
        message: 'Curso no encontrado' 
      });
    }

    if (curso.alumnosInscritos >= curso.cupoMaximo) {
      return res.status(400).json({ 
        success: false, 
        message: 'El curso ya no tiene cupo disponible' 
      });
    }

    // 🔍 BUSCAR SI EL USUARIO YA EXISTE POR EMAIL
    const usuarioExistente = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });

    let userId: string;
    let folio: string;
    let esNuevoUsuario: boolean;
    let passwordTemporal: string = ''; // ← AGREGAR PARA GUARDAR LA CONTRASEÑA

    // 🔄 SI EL USUARIO YA EXISTE → ACTUALIZAR SUS DATOS
    if (usuarioExistente) {
      console.log(`📝 Usuario existente encontrado: ${email}`);
      
      // Actualizar perfil del usuario existente
      await prisma.profile.update({
        where: { userId: usuarioExistente.id },
        data: {
          nombre,
          apellidoPaterno,
          apellidoMaterno: apellidoMaterno || null,
          telefono
        }
      });

      userId = usuarioExistente.id;
      folio = usuarioExistente.folio;
      esNuevoUsuario = false;

      // Verificar si YA ESTÁ INSCRITO en este curso
      const inscripcionExistente = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: usuarioExistente.id,
            courseId: curso.id
          }
        }
      });

      if (inscripcionExistente) {
        // ✅ Ya está inscrito, solo devolvemos los datos
        return res.status(200).json({
          success: true,
          message: 'Ya estás inscrito en este curso',
          data: {
            userId: usuarioExistente.id,
            folio: usuarioExistente.folio,
            email: usuarioExistente.email,
            cursoId: curso.id,
            cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
            precio: curso.precio,
            yaInscrito: true
          }
        });
      }

    } else {
      // 🆕 USUARIO NUEVO → CREARLO COMPLETO
      console.log(`🆕 Nuevo usuario: ${email}`);
      
      folio = await generarFolio();
      passwordTemporal = Math.random().toString(36).slice(-8); // ← GUARDAR LA CONTRASEÑA
      const hashedPassword = await bcrypt.hash(passwordTemporal, 10);

      const nuevoUsuario = await prisma.user.create({
        data: {
          folio,
          email,
          password: hashedPassword,
          role: 'STUDENT',
          status: 'INACTIVE' // Se activa SOLO después del pago
        }
      });

      userId = nuevoUsuario.id;

      // Crear perfil
      await prisma.profile.create({
        data: {
          userId: nuevoUsuario.id,
          nombre,
          apellidoPaterno,
          apellidoMaterno: apellidoMaterno || null,
          telefono
        }
      });

      esNuevoUsuario = true;

      // 📧 📧 📧 ENVIAR EMAIL CON CONTRASEÑA TEMPORAL (AGREGAR ESTE BLOQUE) 📧 📧 📧
      try {
        if (process.env.RESEND_API_KEY) {
          await resend.emails.send({
            from: 'Français Intelligent <onboarding@resend.dev>',
            to: [email],
            subject: '🎓 Bienvenido a Français Intelligent - Tus credenciales',
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: #150354; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                  .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                  .credentials { background: #A8DADC; padding: 20px; border-radius: 8px; margin: 20px 0; }
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
                    <p>Tu registro ha sido exitoso. Bienvenido a la comunidad.</p>
                    
                    <div class="credentials">
                      <h3 style="margin-top: 0; color: #150354;">🔐 Tus credenciales de acceso</h3>
                      <p style="font-size: 16px;"><strong>Folio:</strong> ${folio}</p>
                      <p style="font-size: 16px;"><strong>Contraseña temporal:</strong> <span style="background: #fff; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 18px;">${passwordTemporal}</span></p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                      ⚠️ Esta es una contraseña temporal. Te recomendamos cambiarla después de iniciar sesión.
                    </p>
                    
                    <div style="text-align: center; margin-top: 30px;">
                      <a href="${process.env.FRONTEND_URL}/login" class="button">
                        Iniciar sesión
                      </a>
                    </div>
                    
                    <p style="margin-top: 30px; font-size: 14px; color: #666;">
                      ¿Tienes dudas? Contáctanos por el chat de la plataforma.<br>
                      <strong>¡Nos vemos en clase!</strong>
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `
          });
          console.log(`✅ Email enviado a ${email}`);
        }
      } catch (emailError) {
        console.error('❌ Error enviando email de bienvenida:', emailError);
        // No detenemos el registro si el email falla
      }
      // 📧 📧 📧 FIN DEL BLOQUE DE EMAIL 📧 📧 📧

    }

    // ➕ CREAR INSCRIPCIÓN (solo si no existía)
    if (!usuarioExistente || !await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: curso.id
        }
      }
    })) {
      await prisma.enrollment.create({
        data: {
          userId,
          courseId: curso.id
        }
      });

      // Incrementar contador de alumnos inscritos
      await prisma.course.update({
        where: { id: curso.id },
        data: {
          alumnosInscritos: { increment: 1 }
        }
      });
    }

    // ✅ RESPUESTA EXITOSA
    res.status(201).json({
      success: true,
      message: esNuevoUsuario 
        ? 'Registro exitoso' 
        : 'Datos actualizados correctamente',
      data: {
        userId,
        folio,
        email,
        cursoId: curso.id,
        cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
        precio: curso.precio,
        dias: curso.dias,       
        horario: curso.horario,  
        esNuevoUsuario
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar el registro',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

export default router;