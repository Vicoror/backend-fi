import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { upload } from '../middlewares/upload';
import cloudinary from '../lib/cloudinary';

const router = Router();
const prisma = new PrismaClient();

// Obtener todos los exámenes (Admin)
router.get('/', async (req, res) => {
  try {
    const { nivel, courseId, userId } = req.query;
    const where: any = {};
    if (nivel) where.nivel = nivel;
    if (courseId) where.courseId = courseId;
    if (userId) where.userId = userId;
    
    const examenes = await prisma.examenes.findMany({
      where,
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(examenes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

// Obtener exámenes por alumno
router.get('/alumno/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { nivel } = req.query;
    const where: any = { userId };
    if (nivel) where.nivel = nivel;
    
    const examenes = await prisma.examenes.findMany({
      where,
      include: { course: { select: { nivel: true, code: true } } },
      orderBy: { createdAt: 'desc' }
    });
    
    const calificaciones = examenes
      .filter(e => e.calificacionExamen !== null)
      .map(e => e.calificacionExamen);
    
    const calificacionFinal = calificaciones.length > 0
      ? calificaciones.reduce((a, b) => (a || 0) + (b || 0), 0) / calificaciones.length
      : 0;
    
    res.json({ examenes, calificacionFinal });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exámenes del alumno' });
  }
});

// Crear examen (Admin)
router.post('/', upload.single('archivo'), async (req, res) => {
  try {
    const { userId, nivel, courseId, linkExterno } = req.body;
    
    let examenUrl = '';
    if (req.file) {
      examenUrl = req.file.path;
    } else if (linkExterno) {
      examenUrl = linkExterno;
    } else {
      return res.status(400).json({ error: 'Debes subir un archivo o proporcionar un link' });
    }
    
    const nuevoExamen = await prisma.examenes.create({
      data: { userId, nivel, examen: examenUrl, courseId }
    });
    
    res.status(201).json(nuevoExamen);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear examen' });
  }
});

// Actualizar calificación (Admin)
router.patch('/:id/calificacion', async (req, res) => {
  try {
    const { id } = req.params;
    const { calificacionExamen } = req.body;
    
    const examenActualizado = await prisma.examenes.update({
      where: { id },
      data: { calificacionExamen }
    });
    res.json(examenActualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar calificación' });
  }
});

// Actualizar examen (Admin)
router.put('/:id', upload.single('archivo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { courseId, nivel, linkExterno, eliminarArchivo } = req.body;
    
    const examenExistente = await prisma.examenes.findUnique({ where: { id } });
    if (!examenExistente) return res.status(404).json({ error: 'Examen no encontrado' });
    
    let examenUrl = examenExistente.examen;
    
    if (eliminarArchivo === 'true' && examenExistente.examen.includes('cloudinary')) {
      const publicId = examenExistente.examen.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
      examenUrl = '';
    }
    
    if (req.file) {
      if (examenExistente.examen.includes('cloudinary')) {
        const publicId = examenExistente.examen.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      examenUrl = req.file.path;
    } else if (linkExterno) {
      examenUrl = linkExterno;
    }
    
    const examenActualizado = await prisma.examenes.update({
      where: { id },
      data: {
        examen: examenUrl,
        courseId: courseId || examenExistente.courseId,
        nivel: nivel || examenExistente.nivel
      }
    });
    
    res.json(examenActualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar examen' });
  }
});

// Eliminar examen (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const examen = await prisma.examenes.findUnique({ where: { id } });
    
    if (examen && examen.examen.includes('cloudinary')) {
      const publicId = examen.examen.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }
    
    await prisma.examenes.delete({ where: { id } });
    res.json({ message: 'Examen eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar examen' });
  }
});

export default router;