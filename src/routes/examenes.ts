// backend/src/routes/examenes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { upload, uploadToCloudinary } from '../middlewares/upload';
import cloudinary from '../lib/cloudinary';

const router = Router();
const prisma = new PrismaClient();

// Obtener todos los exámenes (Admin)
router.get('/', async (req, res) => {
  try {
    const { nivel, activo } = req.query;
    const where: any = {};
    if (nivel) where.nivel = nivel;
    if (activo !== undefined) where.activo = activo === 'true';
    
    const examenes = await prisma.examen.findMany({
      where,
      include: {
        calificaciones: {
          include: {
            user: {
              include: { profile: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(examenes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

// Obtener exámenes para un alumno específico
router.get('/alumno/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { nivel } = req.query;
    
    const examenes = await prisma.examen.findMany({
      where: {
        nivel: nivel as string,
        activo: true
      },
      include: {
        calificaciones: {
          where: { userId },
          select: {
            id: true,
            calificacion: true,
            entregado: true,
            fechaEntrega: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const examenesConCalificacion = examenes.map(examen => ({
      ...examen,
      calificacionExamen: examen.calificaciones[0]?.calificacion,
      entregado: examen.calificaciones[0]?.entregado || false
    }));
    
    // Calcular calificación final
    const calificaciones = examenesConCalificacion
      .filter(e => e.calificacionExamen !== null && e.calificacionExamen !== undefined)
      .map(e => e.calificacionExamen);
    
    const calificacionFinal = calificaciones.length > 0
      ? calificaciones.reduce((a, b) => (a || 0) + (b || 0), 0) / calificaciones.length
      : 0;
    
    res.json({
      examenes: examenesConCalificacion,
      calificacionFinal
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exámenes del alumno' });
  }
});

// Crear examen por nivel (Admin)
router.post('/', upload.single('archivo'), async (req, res) => {
  try {
    const { nivel, titulo, descripcion, fechaLimite, courseId, linkExterno } = req.body;
    
    let examenUrl = '';
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'examenes');
      examenUrl = result;
    } else if (linkExterno) {
      examenUrl = linkExterno;
    } else {
      return res.status(400).json({ error: 'Debes subir un archivo o proporcionar un link' });
    }
    
    const nuevoExamen = await prisma.examen.create({
      data: {
        nivel,
        titulo,
        descripcion,
        examen: examenUrl,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
        activo: true,
        courseId
      }
    });
    
    // Crear registros de calificación para todos los alumnos de ese nivel
    const alumnosDelNivel = await prisma.user.findMany({
      where: {
        enrollments: {
          some: {
            course: {
              nivel: nivel
            }
          }
        }
      }
    });
    
    await prisma.calificacionExamen.createMany({
      data: alumnosDelNivel.map(alumno => ({
        examenId: nuevoExamen.id,
        userId: alumno.id,
        entregado: false
      }))
    });
    
    res.status(201).json(nuevoExamen);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear examen' });
  }
});

// Actualizar calificación de un alumno (Admin)
router.patch('/calificar/:examenId/:userId', async (req, res) => {
  try {
    const { examenId, userId } = req.params;
    const { calificacion } = req.body;
    
    const calificacionActualizada = await prisma.calificacionExamen.update({
      where: {
        examenId_userId: {
          examenId,
          userId
        }
      },
      data: {
        calificacion,
        entregado: true,
        fechaEntrega: new Date()
      }
    });
    
    res.json(calificacionActualizada);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar calificación' });
  }
});

// Eliminar examen (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const examen = await prisma.examen.findUnique({ where: { id } });
    
    if (examen && examen.examen.includes('cloudinary')) {
      const publicId = examen.examen.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }
    
    await prisma.calificacionExamen.deleteMany({
      where: { examenId: id }
    });
    
    await prisma.examen.delete({ where: { id } });
    
    res.json({ message: 'Examen eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar examen' });
  }
});

export default router;