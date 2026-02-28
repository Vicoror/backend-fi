import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class StudentController {
  async getMyCourse(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      // Buscar la inscripción del estudiante (sin status porque no existe)
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId: userId
          // 👇 No usamos 'status' porque no existe en tu modelo
        },
        include: {
          course: {
            include: {
              teacher: {
                include: {
                  profile: true  // La información del profesor está en Profile
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!enrollment) {
        return res.status(404).json({ 
          error: 'No tienes ningún curso inscrito actualmente' 
        });
      }

      // Obtener el perfil del estudiante para mostrar su nombre
      const studentProfile = await prisma.profile.findUnique({
        where: { userId: userId }
      });

      // Construir el nombre completo del estudiante
      const studentName = studentProfile 
        ? `${studentProfile.nombre} ${studentProfile.apellidoPaterno} ${studentProfile.apellidoMaterno || ''}`.trim()
        : 'Estudiante';

      // Construir el nombre del profesor si existe
      let teacherName = null;
      if (enrollment.course.teacher) {
        const teacherProfile = enrollment.course.teacher.profile;
        teacherName = teacherProfile 
          ? `${teacherProfile.nombre} ${teacherProfile.apellidoPaterno} ${teacherProfile.apellidoMaterno || ''}`.trim()
          : 'Profesor asignado';
      }

      return res.json({
        success: true,
        data: {
          student: {
            id: userId,
            name: studentName
          },
          course: {
            id: enrollment.course.id,
            nivel: enrollment.course.nivel,
            subnivel: enrollment.course.subnivel,
            horario: enrollment.course.horario,
            dias: enrollment.course.dias,
            inicio: enrollment.course.inicio,
            fin: enrollment.course.fin,
            urlCurso: enrollment.course.urlCurso,
            calendarioPdf: enrollment.course.calendarioPdf,
            teacher: enrollment.course.teacher ? {
              id: enrollment.course.teacher.id,
              name: teacherName
            } : null
          },
          enrollment: {
            id: enrollment.id,
            createdAt: enrollment.createdAt
          }
        }
      });
    } catch (error) {
      console.error('Error al obtener curso del estudiante:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}