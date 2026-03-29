// backend/src/routes/temarios.routes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { uploadToCloudinary } from '../lib/cloudinary';
import multer from 'multer';

const router = Router();
const prisma = new PrismaClient();

// Configurar multer con tipos correctos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Obtener todos los temarios
router.get('/temarios', async (req, res) => {
  try {
    const temarios = await prisma.temario.findMany({
      include: {
        temas: {
          include: {
            subtemas: true
          },
          orderBy: {
            orden: 'asc'
          }
        }
      },
      orderBy: {
        nivel: 'asc'
      }
    });
    res.json(temarios);
  } catch (error) {
    console.error('Error al obtener temarios:', error);
    res.status(500).json({ error: 'Error al obtener temarios' });
  }
});

// Obtener temario por nivel - CORREGIDO: usar findFirst en lugar de findUnique
router.get('/temarios/nivel/:nivel', async (req, res) => {
  try {
    const { nivel } = req.params;
    const temario = await prisma.temario.findFirst({
      where: { nivel },
      include: {
        temas: {
          include: {
            subtemas: true
          },
          orderBy: {
            orden: 'asc'
          }
        }
      }
    });
    
    if (!temario) {
      return res.status(404).json({ error: 'Temario no encontrado para este nivel' });
    }
    
    res.json(temario);
  } catch (error) {
    console.error('Error al obtener temario:', error);
    res.status(500).json({ error: 'Error al obtener temario' });
  }
});

// Crear nuevo temario
router.post('/temarios', async (req, res) => {
  try {
    const { nivel, tituloGeneral, temas } = req.body;
    
    // Verificar si ya existe un temario para este nivel
    const existingTemario = await prisma.temario.findFirst({
      where: { nivel }
    });
    
    if (existingTemario) {
      return res.status(400).json({ error: 'Ya existe un temario para este nivel' });
    }
    
    const temario = await prisma.temario.create({
      data: {
        nivel,
        tituloGeneral,
        temas: {
          create: temas.map((tema: any, index: number) => ({
            titulo: tema.titulo,
            material: tema.material,
            orden: index,
            subtemas: {
              create: tema.subtemas?.map((subtema: any, subIndex: number) => ({
                tipo: subtema.tipo,
                titulo: subtema.titulo,
                material: subtema.material,
                orden: subIndex
              }))
            }
          }))
        }
      },
      include: {
        temas: {
          include: {
            subtemas: true
          }
        }
      }
    });
    
    res.json(temario);
  } catch (error) {
    console.error('Error al crear temario:', error);
    res.status(500).json({ error: 'Error al crear temario' });
  }
});

// Actualizar temario
router.put('/temarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nivel, tituloGeneral, temas } = req.body;
    
    // Verificar si el nivel ya existe en otro temario
    if (nivel) {
      const existingTemario = await prisma.temario.findFirst({
        where: { 
          nivel,
          NOT: { id }
        }
      });
      
      if (existingTemario) {
        return res.status(400).json({ error: 'Ya existe un temario con este nivel' });
      }
    }
    
    // Eliminar temas existentes
    await prisma.tema.deleteMany({
      where: { temarioId: id }
    });
    
    // Actualizar temario con nuevos temas
    const temario = await prisma.temario.update({
      where: { id },
      data: {
        nivel,
        tituloGeneral,
        temas: {
          create: temas.map((tema: any, index: number) => ({
            titulo: tema.titulo,
            material: tema.material,
            orden: index,
            subtemas: {
              create: tema.subtemas?.map((subtema: any, subIndex: number) => ({
                tipo: subtema.tipo,
                titulo: subtema.titulo,
                material: subtema.material,
                orden: subIndex
              }))
            }
          }))
        }
      },
      include: {
        temas: {
          include: {
            subtemas: true
          }
        }
      }
    });
    
    res.json(temario);
  } catch (error) {
    console.error('Error al actualizar temario:', error);
    res.status(500).json({ error: 'Error al actualizar temario' });
  }
});

// Eliminar temario
router.delete('/temarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Primero eliminar subtemas y temas (cascada automática por Prisma si configuraste onDelete: Cascade)
    await prisma.temario.delete({
      where: { id }
    });
    
    res.json({ message: 'Temario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar temario:', error);
    res.status(500).json({ error: 'Error al eliminar temario' });
  }
});

// Subir archivo a Cloudinary - CORREGIDO: tipado correcto para multer
router.post('/temarios/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }
    
    // Validar tipo de archivo
    const allowedMimes = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];
    
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: 'Tipo de archivo no permitido. Permitidos: PDF, PPT, Word, Excel, Imágenes' 
      });
    }
    
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'temarios',
      resource_type: 'auto'
    });
    
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

export default router;