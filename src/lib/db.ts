// src/lib/db.ts — Prisma client singleton.
//
// Singleton pattern avoids exhausting connections in dev hot-reload.
import { PrismaClient } from '@prisma/client'

declare global {
  var __prisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}

export { prisma as db }
