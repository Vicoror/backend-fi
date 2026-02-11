import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('123456', 10)

  await prisma.user.create({
    data: {
      folio: 'ADTF001',
      email: 'admin@tusitio.com',
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
