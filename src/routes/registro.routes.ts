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

    // Verificar si el email ya existe
    const emailExistente = await prisma.user.findUnique({
      where: { email }
    });

    if (emailExistente) {
      return res.status(409).json({ 
        success: false, 
        message: 'El correo electrónico ya está registrado' 
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

    // Generar folio y contraseña temporal
    const folio = await generarFolio();
    const passwordTemporal = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(passwordTemporal, 10);

    // Crear transacción: Usuario + Perfil + Inscripción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear usuario
      const user = await tx.user.create({
        data: {
          folio,
          email,
          password: hashedPassword,
          role: 'STUDENT',
          status: 'INACTIVE'
        }
      });

      // 2. Crear perfil
      const profile = await tx.profile.create({
        data: {
          userId: user.id,
          nombre,
          apellidoPaterno,
          apellidoMaterno: apellidoMaterno || null,
          telefono
        }
      });

      // 3. Crear inscripción
      const enrollment = await tx.enrollment.create({
        data: {
          userId: user.id,
          courseId: curso.id
        }
      });

      // 4. Incrementar contador de alumnos inscritos
      await tx.course.update({
        where: { id: curso.id },
        data: {
          alumnosInscritos: { increment: 1 }
        }
      });

      return { user, profile, enrollment };
    });

    // TODO: Enviar email con credenciales (passwordTemporal)
    console.log(`🔐 Contraseña temporal para ${folio}: ${passwordTemporal}`);

    res.status(201).json({
      success: true,
      message: 'Registro exitoso',
      data: {
        userId: result.user.id,
        folio: result.user.folio,
        email: result.user.email,
        cursoId: curso.id,
        cursoNombre: `${curso.nivel} ${curso.subnivel || ''}`.trim(),
        precio: curso.precio
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