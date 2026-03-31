import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { upload, uploadToCloudinary } from '../middlewares/upload';
import cloudinary from '../lib/cloudinary';

const router = Router();
const prisma = new PrismaClient();

async function actualizarEstadisticas(userId: string, nivel: string) {
  const totalTareas = await prisma.tareas.count({
    where: { userId, nivel, activo: true }
  });
  
  const tareasRealizadas = await prisma.tareas.count({
    where: { userId, nivel, realizada: true, activo: true }
  });
  
  await prisma.estadisticasTareas.upsert({
    where: { userId_nivel: { userId, nivel } },
    update: { totalTareas, tareasRealizadas, ultimaActualizacion: new Date() },
    create: { userId, nivel, totalTareas, tareasRealizadas }
  });
}

// Obtener todas las tareas (Admin)
router.get('/', async (req, res) => {
  try {
    const { nivel, courseId, userId } = req.query;
    const where: any = {};
    if (nivel) where.nivel = nivel;
    if (courseId) where.courseId = courseId;
    if (userId) where.userId = userId;
    
    const tareas = await prisma.tareas.findMany({
      where,
      include: { user: { include: { profile: true } } },
      orderBy: { fechaLimite: 'asc' }
    });
    res.json(tareas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// Obtener tareas por alumno
router.get('/alumno/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { nivel } = req.query;
    const where: any = { userId };
    if (nivel) where.nivel = nivel;
    
    const tareas = await prisma.tareas.findMany({
      where,
      include: { course: { select: { nivel: true, code: true } } },
      orderBy: { fechaLimite: 'asc' }
    });
    res.json(tareas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tareas del alumno' });
  }
});

// Crear tarea (Admin)
router.post('/', upload.single('archivo'), async (req, res) => {
  try {
    const { userId, nivel, tipo, fechaLimite, courseId, linkExterno } = req.body;
    
    let tareaUrl = '';
    
    if (req.file) {
      // Subir a Cloudinary manualmente
      const result = await uploadToCloudinary(req.file.buffer, 'tareas');
      tareaUrl = (result as any).secure_url;
    } else if (linkExterno) {
      tareaUrl = linkExterno;
    } else {
      return res.status(400).json({ error: 'Debes subir un archivo o proporcionar un link' });
    }
    
    const nuevaTarea = await prisma.tareas.create({
      data: {
        userId,
        nivel,
        tipo,
        tarea: tareaUrl,
        fechaLimite: new Date(fechaLimite),
        activo: true,
        realizada: false,
        courseId
      }
    });
    
    await actualizarEstadisticas(userId, nivel);
    res.status(201).json(nuevaTarea);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// Actualizar tarea (Admin)
router.put('/:id', upload.single('archivo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, fechaLimite, activo, courseId, linkExterno, eliminarArchivo } = req.body;
    
    const tareaExistente = await prisma.tareas.findUnique({ where: { id } });
    if (!tareaExistente) return res.status(404).json({ error: 'Tarea no encontrada' });
    
    let tareaUrl = tareaExistente.tarea;
    
    if (eliminarArchivo === 'true' && tareaExistente.tarea.includes('cloudinary')) {
      const publicId = tareaExistente.tarea.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
      tareaUrl = '';
    }
    
    if (req.file) {
      if (tareaExistente.tarea.includes('cloudinary')) {
        const publicId = tareaExistente.tarea.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      tareaUrl = req.file.path;
    } else if (linkExterno) {
      tareaUrl = linkExterno;
    }
    
    const tareaActualizada = await prisma.tareas.update({
      where: { id },
      data: {
        tipo: tipo || tareaExistente.tipo,
        tarea: tareaUrl,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : tareaExistente.fechaLimite,
        activo: activo !== undefined ? activo === 'true' : tareaExistente.activo,
        courseId: courseId || tareaExistente.courseId
      }
    });
    
    await actualizarEstadisticas(tareaActualizada.userId, tareaActualizada.nivel);
    res.json(tareaActualizada);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// Marcar/Desmarcar tarea realizada (Alumno)
router.patch('/:id/realizada', async (req, res) => {
  try {
    const { id } = req.params;
    const { realizada, userId, nivel } = req.body;
    
    const tarea = await prisma.tareas.findUnique({ where: { id } });
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
    
    const fechaLimite = new Date(tarea.fechaLimite);
    const hoy = new Date();
    
    if (hoy > fechaLimite && realizada) {
      return res.status(400).json({ error: 'No se puede marcar una tarea vencida como realizada' });
    }
    
    const tareaActualizada = await prisma.tareas.update({
      where: { id },
      data: { realizada }
    });
    
    await actualizarEstadisticas(userId || tarea.userId, nivel || tarea.nivel);
    res.json(tareaActualizada);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado de tarea' });
  }
});

// Eliminar tarea (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tarea = await prisma.tareas.findUnique({ where: { id } });
    
    if (tarea && tarea.tarea.includes('cloudinary')) {
      const publicId = tarea.tarea.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }
    
    await prisma.tareas.delete({ where: { id } });
    if (tarea) await actualizarEstadisticas(tarea.userId, tarea.nivel);
    
    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

// Obtener estadísticas
router.get('/estadisticas/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { nivel } = req.query;
    
    const estadisticas = await prisma.estadisticasTareas.findUnique({
      where: { userId_nivel: { userId, nivel: nivel as string } }
    });
    res.json(estadisticas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

export default router;