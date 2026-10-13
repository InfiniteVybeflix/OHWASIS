// src/lib/validation/schemas.ts — zod schemas for all OHWASIS API inputs.
//
// These schemas are the single source of truth for what the API accepts.
// Every API route handler validates its input against the matching schema
// before any side effect runs.

import { z } from 'zod'

export const emailSchema = z.string().email().max(254).toLowerCase()
export const passwordSchema = z.string().min(8).max(128)
export const phoneSchema = z
  .string()
  .min(9)
  .max(15)
  .regex(/^(\+?\d[\d\s-]*)$/, 'Invalid phone number')
  .transform((s) => s.replace(/[\s-]/g, '').replace(/^\+/, ''))

export const handleSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/, 'Invalid handle: lowercase, digits, hyphens only')

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120).optional(),
  accountType: z.enum(['CUSTOMER', 'BUSINESS_OWNER']).default('CUSTOMER'),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})

export const createTenantSchema = z.object({
  handle: handleSchema,
  displayName: z.string().min(1).max(120),
  tagline: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  industry: z.enum([
    'water_refill',
    'restaurant',
    'grocery',
    'fashion',
    'cosmetics',
    'electronics',
    'general_retail',
  ]),
  contactEmail: emailSchema.optional(),
  contactPhone: phoneSchema.optional(),
})

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  parentId: z.string().cuid().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
})

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(10000).optional(),
  categoryId: z.string().cuid().optional(),
  basePrice: z.number().min(0).max(10_000_000),
  currency: z.string().length(3).default('KES'),
  sku: z.string().max(64).optional(),
  barcode: z.string().max(64).optional(),
  stock: z.number().int().min(0).max(10_000_000).default(0),
  trackStock: z.boolean().default(true),
  trackStockOnVariant: z.boolean().default(false),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  attributes: z.record(z.unknown()).default({}),
})

export const variantSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().max(64).optional(),
  priceDelta: z.number().min(-10_000_000).max(10_000_000).default(0),
  stock: z.number().int().min(0).max(10_000_000).default(0),
  options: z.record(z.unknown()).default({}),
  weightGrams: z.number().int().min(0).max(10_000_000).optional(),
})

export const addToCartSchema = z.object({
  productId: z.string().cuid(),
  variantId: z.string().cuid().optional(),
  quantity: z.number().int().min(1).max(100),
})

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(100),
})

export const checkoutSchema = z.object({
  customer: z.object({
    email: emailSchema,
    name: z.string().min(1).max(200),
    phone: phoneSchema,
  }),
  shippingAddress: z.object({
    line1: z.string().min(1).max(300),
    line2: z.string().max(300).optional(),
    city: z.string().min(1).max(120),
    region: z.string().min(1).max(120),
    country: z.string().length(2),
    postalCode: z.string().max(20).optional(),
    notes: z.string().max(1000).optional(),
  }),
  fulfillmentMethod: z.enum(['delivery', 'pickup']),
  deliveryZoneId: z.string().cuid().optional(),
  paymentMethod: z.enum(['mpesa_stk', 'mpesa_manual', 'cash_on_delivery', 'manual']),
  discountCode: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

export const paymentProviderConfigSchema = z.object({
  provider: z.enum(['mpesa_stk', 'mpesa_manual', 'cash_on_delivery', 'manual']),
  displayName: z.string().min(1).max(120),
  enabled: z.boolean().default(false),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  // M-Pesa Daraja fields
  consumerKey: z.string().max(500).optional(),
  consumerSecret: z.string().max(500).optional(),
  shortCode: z.string().max(20).optional(),
  passkey: z.string().max(500).optional(),
  callbackUrl: z.string().url().optional(),
  // Manual / COD fields
  instructions: z.string().max(2000).optional(),
  tillNumber: z.string().max(20).optional(),
  paybillNumber: z.string().max(20).optional(),
  accountName: z.string().max(120).optional(),
})

export const aiProviderConfigSchema = z.object({
  provider: z.enum(['aevibron', 'openai', 'anthropic', 'custom']).default('aevibron'),
  displayName: z.string().min(1).max(120),
  enabled: z.boolean().default(false),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).max(500),
  defaultModel: z.string().min(1).max(120),
  authScheme: z.enum(['x-aevibron-key', 'bearer', 'x-api-key']).default('x-aevibron-key'),
  models: z.array(z.string()).default([]),
})

export const aiAccessRequestSchema = z.object({
  provider: z.string().min(1).max(120),
  requestedAccess: z.string().min(1).max(500),
  justification: z.string().min(1).max(2000),
})

export const aiChatSchema = z.object({
  model: z.string().max(120).optional(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string().max(8000),
    }),
  ).min(1).max(20),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4000).optional(),
})

export const pageSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-/]+$/),
  title: z.string().min(1).max(200),
  body: z.string().max(100_000),
  status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED']).default('DRAFT'),
  seo: z.record(z.unknown()).default({}),
})

export const deliveryZoneSchema = z.object({
  name: z.string().min(1).max(120),
  areas: z.array(z.string()).min(1),
  fee: z.number().min(0).max(10_000_000),
  minimumOrder: z.number().min(0).max(10_000_000).optional(),
  estimatedMinutes: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().default(true),
})

export const discountSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/),
  description: z.string().max(500).optional(),
  type: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.number().min(0).max(10_000_000),
  minimumOrder: z.number().min(0).max(10_000_000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  usageLimit: z.number().int().min(1).max(10_000_000).optional(),
  active: z.boolean().default(true),
})
