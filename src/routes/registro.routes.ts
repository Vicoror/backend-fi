import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

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
      const passwordTemporal = Math.random().toString(36).slice(-8);
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

      // TODO: Enviar email con credenciales
      console.log(`🔐 Contraseña temporal para ${folio}: ${passwordTemporal}`);
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