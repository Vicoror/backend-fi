// backend/src/routes/alumno.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Obtener nivel actual del alumno
router.get('/nivel-actual', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Buscar inscripción activa del alumno
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: userId as string,
        course: {
          fin: {
            gt: new Date() // Curso no ha terminado
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
    
    if (!enrollment) {
      return res.status(404).json({ error: 'No se encontró un curso activo para el alumno' });
    }
    
    // Obtener perfil del alumno
    const profile = await prisma.profile.findUnique({
      where: { userId: userId as string }
    });
    
    res.json({
      nivel: enrollment.course.nivel,
      profile: {
        nombre: profile?.nombre,
        apellidoPaterno: profile?.apellidoPaterno,
        apellidoMaterno: profile?.apellidoMaterno
      },
      nombre: profile ? `${profile.nombre} ${profile.apellidoPaterno}` : ''
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener nivel del alumno' });
  }
});

export default router;