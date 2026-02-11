import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Test 1: Variable de entorno
    const dbUrl = process.env.DATABASE_URL || 'no definida';
    const dbUrlHidden = dbUrl.replace(/:[^:]*@/, ':***@');
    
    // Test 2: Conexión directa
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1+1 as result`;
    
    // Test 3: Obtener usuarios (opcional)
    const userCount = await prisma.user.count();
    
    await prisma.$disconnect();
    
    res.json({
      success: true,
      database_url: dbUrlHidden,
      pooler: dbUrl.includes('pooler.supabase.com'),
      ssl: dbUrl.includes('sslmode=require'),
      pgbouncer: dbUrl.includes('pgbouncer=true'),
      connection: '✅ exitosa',
      user_count: userCount
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      meta: error.meta
    });
  }
}