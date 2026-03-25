import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ClaseMuestraController {
  // Crear nueva solicitud de clase muestra
  static async create(req: Request, res: Response) {
    try {
      const { correo, tipoCurso, nivel, diaPreferido, horario } = req.body;

      // Validaciones
      if (!correo || !tipoCurso || !nivel || !diaPreferido || !horario) {
        return res.status(400).json({
          error: 'Todos los campos son requeridos'
        });
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
      if (!emailRegex.test(correo)) {
        return res.status(400).json({
          error: 'Formato de correo inválido'
        });
      }

      // Validar tipo de curso
      const tiposPermitidos = ['Individuales', 'Grupales'];
      if (!tiposPermitidos.includes(tipoCurso)) {
        return res.status(400).json({
          error: 'Tipo de curso no válido'
        });
      }

      // Validar nivel
      const nivelesPermitidos = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2'];
      if (!nivelesPermitidos.includes(nivel)) {
        return res.status(400).json({
          error: 'Nivel no válido'
        });
      }

      // Validar fecha
      const fechaPreferida = new Date(diaPreferido);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      if (isNaN(fechaPreferida.getTime())) {
        return res.status(400).json({
          error: 'Fecha no válida'
        });
      }
      
      if (fechaPreferida < hoy) {
        return res.status(400).json({
          error: 'La fecha debe ser hoy o una fecha futura'
        });
      }

      // Guardar en base de datos
      const claseMuestra = await prisma.claseMuestra.create({
        data: {
          correo,
          tipoCurso,
          nivel,
          diaPreferido: fechaPreferida,
          horario
        }
      });

      res.status(201).json({
        message: 'Solicitud de clase muestra registrada exitosamente',
        data: claseMuestra
      });

    } catch (error: any) {
      // Manejar error de correo duplicado
      if (error.code === 'P2002') {
        return res.status(400).json({
          error: 'Este correo ya tiene una solicitud activa'
        });
      }

      console.error('Error al crear clase muestra:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Obtener todas las solicitudes (admin)
  static async getAll(req: Request, res: Response) {
    try {
      const solicitudes = await prisma.claseMuestra.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json(solicitudes);
    } catch (error) {
      console.error('Error al obtener solicitudes:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Obtener solicitud por ID
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const solicitud = await prisma.claseMuestra.findUnique({
        where: { id }
      });

      if (!solicitud) {
        return res.status(404).json({
          error: 'Solicitud no encontrada'
        });
      }

      res.status(200).json(solicitud);
    } catch (error) {
      console.error('Error al obtener solicitud:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Eliminar solicitud (admin)
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      await prisma.claseMuestra.delete({
        where: { id }
      });

      res.status(200).json({
        message: 'Solicitud eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar solicitud:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }
}