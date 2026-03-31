// backend/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extender el tipo Request para incluir user
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Validar que email y password existan
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }
    
    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }
    
    // Verificar contraseña
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }
    
    // Crear token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );
    
    // Remover password por seguridad
    const { password: _, ...userWithoutPassword } = user;
    
    res.status(200).json({
      token,
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    // req.user fue agregado por requireAuth
    if (!req.user) {
      return res.status(401).json({ message: 'No autenticado' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: true }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.status(200).json({ user: userWithoutPassword });
    
  } catch (error) {
    console.error('Error en getMe:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};