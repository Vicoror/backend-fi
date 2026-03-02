import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const prisma = new PrismaClient();

// Configurar Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ============================================
// CONFIGURACIÓN DE MULTER
// ============================================

// Configurar Multer para memory storage
const storage = multer.memoryStorage();

// Filtro para validar tipos de archivo
const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes o videos'));
    }
};

// Aumentar límites de multer
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB
    fieldSize: 100 * 1024 * 1024
  },
  fileFilter
});

// ============================================
// TIPOS PARA EXTENDER EL REQUEST DE EXPRESS
// ============================================

// Extendemos la interfaz Request para incluir el archivo
declare module 'express-serve-static-core' {
    interface Request {
        file?: Express.Multer.File;
        files?: Express.Multer.File[];
    }
}

// ============================================
// RUTAS PÚBLICAS
// ============================================

/**
 * GET /api/carrusel
 * Obtiene los items activos para mostrar en el frontend
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const items = await prisma.carruselItem.findMany({
            where: {
                activo: true,
                fechaInicio: { lte: now },
                fechaFin: { gte: now },
            },
            orderBy: { orden: 'asc' },
        });
        
        res.json(items);
    } catch (error) {
        console.error('Error al obtener carrusel:', error);
        res.status(500).json({ error: 'Error al obtener carrusel' });
    }
});

// ============================================
// RUTAS DE ADMINISTRACIÓN
// ============================================

/**
 * GET /api/carrusel/admin
 * Obtiene TODOS los items para el panel de administración
 */
router.get('/admin', async (req: Request, res: Response) => {
    try {
        const items = await prisma.carruselItem.findMany({
            orderBy: { orden: 'asc' },
        });
        
        res.json(items);
    } catch (error) {
        console.error('Error al obtener items:', error);
        res.status(500).json({ error: 'Error al obtener items' });
    }
});

/**
 * POST /api/carrusel
 * Crea un nuevo item en el carrusel
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const { titulo, tipo, link, orden, fechaInicio, fechaFin, activo } = req.body;
        
        // ✅ AHORA TypeScript reconoce req.file gracias a @types/multer
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Archivo requerido' });
        }

        // Validar que no haya más de 5 items
        const totalItems = await prisma.carruselItem.count();
        if (totalItems >= 5) {
            return res.status(400).json({ error: 'Máximo 5 items permitidos' });
        }

        // Verificar si el orden ya está ocupado
        const existingOrder = await prisma.carruselItem.findUnique({
            where: { orden: parseInt(orden) }
        });

        if (existingOrder) {
            // Reordenar items existentes
            const itemsToUpdate = await prisma.carruselItem.findMany({
                where: { orden: { gte: parseInt(orden) } },
                orderBy: { orden: 'desc' }
            });

            for (const item of itemsToUpdate) {
                await prisma.carruselItem.update({
                    where: { id: item.id },
                    data: { orden: item.orden + 1 }
                });
            }
        }

        // Subir a Cloudinary
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: tipo === 'VIDEO' ? 'video' : 'auto',
                    folder: 'carrusel',
                    public_id: `carrusel_${Date.now()}`,
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            uploadStream.end(file.buffer);
        });

        // Crear el item
        const newItem = await prisma.carruselItem.create({
            data: {
                titulo,
                tipo,
                url: (result as any).secure_url,
                link: link || null,
                orden: parseInt(orden),
                fechaInicio: new Date(fechaInicio),
                fechaFin: new Date(fechaFin),
                activo: activo === 'true',
            },
        });

        res.json(newItem);
    } catch (error) {
        console.error('Error al crear item:', error);
        res.status(500).json({ error: 'Error al crear item' });
    }
});

/**
 * PUT /api/carrusel/:id
 * Actualiza un item existente
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Si se está actualizando el orden
        if (updateData.orden) {
            const currentItem = await prisma.carruselItem.findUnique({
                where: { id }
            });

            if (currentItem && currentItem.orden !== parseInt(updateData.orden)) {
                // Reordenar si es necesario
                const itemsInRange = await prisma.carruselItem.findMany({
                    where: {
                        NOT: { id },
                        orden: {
                            gte: Math.min(currentItem.orden, parseInt(updateData.orden)),
                            lte: Math.max(currentItem.orden, parseInt(updateData.orden))
                        }
                    }
                });

                for (const item of itemsInRange) {
                    if (currentItem.orden < parseInt(updateData.orden)) {
                        await prisma.carruselItem.update({
                            where: { id: item.id },
                            data: { orden: item.orden - 1 }
                        });
                    } else {
                        await prisma.carruselItem.update({
                            where: { id: item.id },
                            data: { orden: item.orden + 1 }
                        });
                    }
                }
            }
        }

        const updatedItem = await prisma.carruselItem.update({
            where: { id },
            data: {
                ...updateData,
                orden: updateData.orden ? parseInt(updateData.orden) : undefined,
                fechaInicio: updateData.fechaInicio ? new Date(updateData.fechaInicio) : undefined,
                fechaFin: updateData.fechaFin ? new Date(updateData.fechaFin) : undefined,
            },
        });

        res.json(updatedItem);
    } catch (error) {
        console.error('Error al actualizar item:', error);
        res.status(500).json({ error: 'Error al actualizar item' });
    }
});

/**
 * DELETE /api/carrusel/:id
 * Elimina un item
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Obtener el item para saber su orden
        const item = await prisma.carruselItem.findUnique({
            where: { id }
        });

        if (!item) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        // Eliminar el item
        await prisma.carruselItem.delete({
            where: { id }
        });

        // Reordenar los items restantes
        await prisma.carruselItem.updateMany({
            where: { orden: { gt: item.orden } },
            data: { orden: { decrement: 1 } }
        });

        res.json({ message: 'Item eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar item:', error);
        res.status(500).json({ error: 'Error al eliminar item' });
    }
});

export default router;