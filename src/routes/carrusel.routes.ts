import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const prisma = new PrismaClient();

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
 * Crea un nuevo item en el carrusel (recibe JSON con la URL ya de Cloudinary)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { titulo, tipo, url, link, orden, fechaInicio, fechaFin, activo } = req.body;

        // Validaciones básicas
        if (!titulo || !tipo || !url || !orden || !fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
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
            // Reordenar items existentes (correr hacia adelante)
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

        // Crear el item
        const newItem = await prisma.carruselItem.create({
            data: {
                titulo,
                tipo,
                url,
                link: link || null,
                orden: parseInt(orden),
                fechaInicio: new Date(fechaInicio),
                fechaFin: new Date(fechaFin),
                activo: activo === true || activo === 'true',
            },
        });

        res.status(201).json(newItem);
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

        // Validar que el item existe
        const existingItem = await prisma.carruselItem.findUnique({
            where: { id }
        });

        if (!existingItem) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        // Si se está actualizando el orden
        if (updateData.orden && updateData.orden !== existingItem.orden) {
            const newOrden = parseInt(updateData.orden);
            
            if (existingItem.orden < newOrden) {
                // Mover hacia adelante: los items entre medias retroceden
                await prisma.carruselItem.updateMany({
                    where: {
                        orden: {
                            gt: existingItem.orden,
                            lte: newOrden
                        }
                    },
                    data: { orden: { decrement: 1 } }
                });
            } else {
                // Mover hacia atrás: los items entre medias avanzan
                await prisma.carruselItem.updateMany({
                    where: {
                        orden: {
                            gte: newOrden,
                            lt: existingItem.orden
                        }
                    },
                    data: { orden: { increment: 1 } }
                });
            }
        }

        // Actualizar el item
        const updatedItem = await prisma.carruselItem.update({
            where: { id },
            data: {
                titulo: updateData.titulo,
                tipo: updateData.tipo,
                url: updateData.url,
                link: updateData.link,
                orden: updateData.orden ? parseInt(updateData.orden) : undefined,
                fechaInicio: updateData.fechaInicio ? new Date(updateData.fechaInicio) : undefined,
                fechaFin: updateData.fechaFin ? new Date(updateData.fechaFin) : undefined,
                activo: updateData.activo !== undefined ? updateData.activo : undefined,
            },
        });

        res.json(updatedItem);
    } catch (error) {
        console.error('Error al actualizar item:', error);
        res.status(500).json({ error: 'Error al actualizar item' });
    }
});

/**
 * PATCH /api/carrusel/:id
 * Actualización parcial (útil para cambiar orden específicamente)
 */
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { orden } = req.body;

        if (!orden) {
            return res.status(400).json({ error: 'Orden requerido' });
        }

        const existingItem = await prisma.carruselItem.findUnique({
            where: { id }
        });

        if (!existingItem) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        const newOrden = parseInt(orden);

        // Reordenar si es necesario
        if (existingItem.orden < newOrden) {
            await prisma.carruselItem.updateMany({
                where: {
                    orden: {
                        gt: existingItem.orden,
                        lte: newOrden
                    }
                },
                data: { orden: { decrement: 1 } }
            });
        } else if (existingItem.orden > newOrden) {
            await prisma.carruselItem.updateMany({
                where: {
                    orden: {
                        gte: newOrden,
                        lt: existingItem.orden
                    }
                },
                data: { orden: { increment: 1 } }
            });
        }

        const updatedItem = await prisma.carruselItem.update({
            where: { id },
            data: { orden: newOrden },
        });

        res.json(updatedItem);
    } catch (error) {
        console.error('Error al actualizar orden:', error);
        res.status(500).json({ error: 'Error al actualizar orden' });
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

        // Reordenar los items restantes (los que estaban después)
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