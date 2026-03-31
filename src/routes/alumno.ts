import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Obtener nivel actual del alumno autenticado
router.get('/nivel-actual', async (req, res) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }

    // Buscar inscripción activa del alumno (curso que no haya terminado)
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: userId,
        course: {
          fin: {
            gt: new Date() // curso no ha terminado
          }
        }
      },
      include: {
        course: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Obtener el perfil del alumno
    const profile = await prisma.profile.findUnique({
      where: { userId: userId }
    });

    // Si no hay inscripción activa, intentar obtener el nivel de algún curso pasado
    let nivel = null;
    if (!enrollment && profile) {
      // Buscar última inscripción (aunque haya terminado)
      const lastEnrollment = await prisma.enrollment.findFirst({
        where: { userId: userId },
        include: { course: true },
        orderBy: { createdAt: 'desc' }
      });
      nivel = lastEnrollment?.course?.nivel || null;
    } else if (enrollment) {
      nivel = enrollment.course.nivel;
    }

    if (!nivel) {
      return res.status(404).json({ error: 'No se encontró un nivel asignado para el alumno' });
    }

    res.json({
      nivel: nivel,
      profile: profile ? {
        nombre: profile.nombre,
        apellidoPaterno: profile.apellidoPaterno,
        apellidoMaterno: profile.apellidoMaterno
      } : null,
      nombre: profile ? `${profile.nombre} ${profile.apellidoPaterno}`.trim() : ''
    });
  } catch (error) {
    console.error('Error al obtener nivel del alumno:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta de prueba para verificar que el endpoint existe
router.get('/test', (req, res) => {
  res.json({ message: 'Endpoint de alumno funcionando correctamente' });
});

export default router;