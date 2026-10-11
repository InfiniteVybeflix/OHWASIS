import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { checkoutSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'
import { dispatch } from '@/lib/notifications'

/**
 * POST /api/checkout?handle=...&sessionKey=...
 *
 * End-to-end checkout. Server-side validation of EVERY total, quantity,
 * price, stock, delivery fee, and discount. Never trusts browser totals.
 *
 * For M-Pesa STK: creates the order in PENDING state, initiates the STK
 * push via Daraja (if tenant has configured creds), and returns the order
 * reference. The actual payment status is set ONLY by the Daraja callback.
 *
 * For manual / COD: creates the order in PENDING state and notifies the
 * merchant. The merchant verifies the payment from their dashboard.
 */
export const POST = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  const sessionKey = q.get('sessionKey')
  if (!handle || !sessionKey) {
    return NextResponse.json({ error: 'handle_and_session_required' }, { status: 400 })
  }
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  const input = await parseBody(req, checkoutSchema)

  // Load the cart with all related product/variant data, fully tenant-scoped
  const cart = await prisma.cart.findFirst({
    where: { tenantId: tenant.id, sessionKey },
    include: {
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  })
  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ error: 'empty_cart' }, { status: 400 })
  }

  // Recompute totals server-side from the authoritative product/variant
  let subtotal = 0
  const orderItemsData: Array<{
    productId: string
    variantId: string | null
    name: string
    variantName: string | null
    sku: string | null
    unitPrice: number
    quantity: number
    lineTotal: number
    snapshot: string
  }> = []

  for (const item of cart.items) {
    // Re-validate product is still ACTIVE and belongs to this tenant
    if (item.product.tenantId !== tenant.id || item.product.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'product_unavailable', productId: item.productId },
        { status: 400 },
      )
    }
    // Re-validate variant
    if (item.variantId && (!item.variant || item.variant.productId !== item.productId)) {
      return NextResponse.json({ error: 'variant_invalid' }, { status: 400 })
    }
    // Re-validate stock
    const availableStock = item.variant ? item.variant.stock : item.product.stock
    if (item.product.trackStock && availableStock < item.quantity) {
      return NextResponse.json(
        { error: 'insufficient_stock', productId: item.productId, available: availableStock },
        { status: 400 },
      )
    }
    // Re-validate price (browser may send stale price)
    const unitPrice = item.product.basePrice + (item.variant?.priceDelta ?? 0)
    if (unitPrice !== item.unitPrice) {
      // Stale price in cart — refresh silently to authoritative value
    }
    const lineTotal = unitPrice * item.quantity
    subtotal += lineTotal

    orderItemsData.push({
      productId: item.productId,
      variantId: item.variantId ?? null,
      name: item.product.name,
      variantName: item.variant?.name ?? null,
      sku: item.variant?.sku ?? item.product.sku ?? null,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      snapshot: JSON.stringify({
        product: { id: item.product.id, name: item.product.name, slug: item.product.slug },
        variant: item.variant ? { id: item.variant.id, name: item.variant.name } : null,
      }),
    })
  }

  // Delivery zone
  let fulfillmentFee = 0
  let fulfillment: { method: string; zoneId: string | null; fee: number; label: string } = {
    method: input.fulfillmentMethod,
    zoneId: null,
    fee: 0,
    label: input.fulfillmentMethod === 'pickup' ? 'Pickup' : 'Delivery',
  }
  if (input.fulfillmentMethod === 'delivery') {
    if (!input.deliveryZoneId) {
      return NextResponse.json({ error: 'delivery_zone_required' }, { status: 400 })
    }
    const zone = await prisma.deliveryZone.findUnique({ where: { id: input.deliveryZoneId } })
    if (!zone || zone.tenantId !== tenant.id || !zone.active) {
      return NextResponse.json({ error: 'invalid_delivery_zone' }, { status: 400 })
    }
    if (zone.minimumOrder && subtotal < zone.minimumOrder) {
      return NextResponse.json(
        { error: 'minimum_order_not_met', required: zone.minimumOrder, current: subtotal },
        { status: 400 },
      )
    }
    fulfillmentFee = zone.fee
    fulfillment = { method: 'delivery', zoneId: zone.id, fee: zone.fee, label: `Delivery — ${zone.name}` }
  }

  // Discount
  let discountTotal = 0
  if (input.discountCode) {
    const code = input.discountCode.toUpperCase()
    const discount = await prisma.discount.findFirst({
      where: { tenantId: tenant.id, code, active: true },
    })
    if (!discount) {
      return NextResponse.json({ error: 'invalid_discount' }, { status: 400 })
    }
    const now = new Date()
    if (discount.startsAt > now) return NextResponse.json({ error: 'discount_not_yet_active' }, { status: 400 })
    if (discount.endsAt && discount.endsAt < now) return NextResponse.json({ error: 'discount_expired' }, { status: 400 })
    if (discount.usageLimit && discount.usedCount >= discount.usageLimit) {
      return NextResponse.json({ error: 'discount_exhausted' }, { status: 400 })
    }
    if (discount.minimumOrder && subtotal < discount.minimumOrder) {
      return NextResponse.json({ error: 'discount_min_not_met' }, { status: 400 })
    }
    discountTotal = discount.type === 'PERCENTAGE'
      ? (subtotal * discount.value) / 100
      : Math.min(discount.value, subtotal)
  }

  const total = Math.max(0, subtotal + fulfillmentFee - discountTotal)

  // Determine payment
  let payment: { method: string; provider: string; fee: number; label: string }
  switch (input.paymentMethod) {
    case 'mpesa_stk':
      payment = { method: 'mpesa_stk', provider: 'mpesa_stk', fee: 0, label: 'M-Pesa STK Push' }
      break
    case 'mpesa_manual':
      payment = { method: 'mpesa_manual', provider: 'mpesa_manual', fee: 0, label: 'M-Pesa (Manual)' }
      break
    case 'cash_on_delivery':
      payment = { method: 'cash_on_delivery', provider: 'cash_on_delivery', fee: 0, label: 'Cash on Delivery' }
      break
    case 'manual':
      payment = { method: 'manual', provider: 'manual', fee: 0, label: 'Manual Payment' }
      break
  }

  // Find or create customer (per-tenant)
  let customer = await prisma.customer.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: input.customer.email } },
  })
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        email: input.customer.email,
        name: input.customer.name,
        phone: input.customer.phone,
      },
    })
  }

  // Create order with all snapshots in a transaction — atomic to prevent
  // partial orders on failure
  const reference = generateOrderReference(tenant.handle)
  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        tenantId: tenant.id,
        customerId: customer!.id,
        guestEmail: customer!.email,
        guestName: customer!.name,
        guestPhone: customer!.phone,
        reference,
        status: 'PENDING',
        shippingAddress: JSON.stringify(input.shippingAddress),
        fulfillmentMethod: input.fulfillmentMethod,
        fulfillment: JSON.stringify(fulfillment),
        payment: JSON.stringify(payment),
        subtotal,
        fulfillmentFee,
        discountTotal,
        total,
        notes: input.notes ?? null,
        items: {
          create: orderItemsData.map((it) => ({
            tenantId: tenant.id,
            productId: it.productId,
            variantId: it.variantId,
            name: it.name,
            variantName: it.variantName,
            sku: it.sku,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            lineTotal: it.lineTotal,
            snapshot: it.snapshot,
          })),
        },
      },
      include: { items: true },
    })

    // Create initial event
    await tx.orderEvent.create({
      data: {
        orderId: o.id,
        type: 'CREATED',
        detail: 'Order created via checkout',
        actorName: input.customer.name,
      },
    })

    // Decrement stock atomically
    for (const it of orderItemsData) {
      if (it.variantId) {
        await tx.variant.update({
          where: { id: it.variantId },
          data: { stock: { decrement: it.quantity } },
        })
      } else {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { decrement: it.quantity } },
        })
      }
    }

    // Increment discount usage if applied
    if (input.discountCode) {
      await tx.discount.updateMany({
        where: { tenantId: tenant.id, code: input.discountCode.toUpperCase() },
        data: { usedCount: { increment: 1 } },
      })
    }

    // Clear the cart
    await tx.cart.delete({ where: { id: cart.id } })

    return o
  })

  await audit({
    ctx: { user: null, tenant: { id: tenant.id, handle: tenant.handle, displayName: tenant.displayName }, ip: null, userAgent: null },
    action: 'order.create',
    category: 'CREATE',
    targetType: 'Order',
    targetId: order.id,
    metadata: { reference, total, paymentMethod: input.paymentMethod },
  })

  // Notify merchant of new order (truthful: persisted, status reflects reality)
  await dispatch({
    tenantId: tenant.id,
    channel: 'IN_APP',
    template: 'ORDER_CONFIRMATION',
    recipient: tenant.contactEmail ?? 'merchant',
    subject: `New order ${order.reference}`,
    body: `Order ${order.reference} of ${total.toFixed(2)} ${order.currency} received from ${customer!.name}.`,
  })

  // For M-Pesa STK: attempt to initiate the push. If creds missing, the
  // payment attempt is recorded as PENDING with a clear status. We DO NOT
  // simulate success.
  let paymentInitiation: { status: string; message: string; checkoutRequestId?: string } | null = null
  if (input.paymentMethod === 'mpesa_stk') {
    paymentInitiation = await initiateMpesaStk(order.id, tenant.id, total, order.currency, input.customer.phone, order.reference, req)
  } else {
    // For manual/COD: create a PENDING PaymentAttempt that the merchant
    // will mark verified from their dashboard.
    await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        tenantId: tenant.id,
        provider: input.paymentMethod,
        merchantReference: order.reference,
        amount: total,
        currency: order.currency,
        status: 'PENDING',
      },
    })
    paymentInitiation = { status: 'PENDING', message: 'Manual payment awaiting merchant verification' }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      reference: order.reference,
      status: order.status,
      total: order.total,
      currency: order.currency,
    },
    payment: paymentInitiation,
  }, { status: 201 })
})

function generateOrderReference(handle: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${handle.slice(0, 4).toUpperCase()}-${ts}-${rand}`
}

async function initiateMpesaStk(
  orderId: string,
  tenantId: string,
  amount: number,
  currency: string,
  phone: string,
  orderReference: string,
  req: Request,
): Promise<{ status: string; message: string; checkoutRequestId?: string }> {
  // Load the tenant's M-Pesa config (must be enabled)
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'mpesa_stk' } },
  })
  if (!config || !config.enabled) {
    // Record the failed-to-initiate attempt — NEVER mark as success
    await prisma.paymentAttempt.create({
      data: {
        orderId,
        tenantId,
        provider: 'mpesa_stk',
        merchantReference: orderReference,
        amount,
        currency,
        status: 'FAILED',
        failureReason: 'M-Pesa STK provider is not configured or enabled for this merchant',
      },
    })
    return {
      status: 'FAILED',
      message: 'M-Pesa STK not configured. The merchant needs to enable Daraja in their dashboard.',
    }
  }
  // Decrypt the config
  const { decryptSecret } = await import('@/lib/crypto')
  const { stkPush, DarajaError } = await import('@/lib/providers/mpesa-daraja')
  let cfg
  try {
    cfg = JSON.parse(decryptSecret(config.encryptedConfig))
  } catch {
    await prisma.paymentAttempt.create({
      data: {
        orderId,
        tenantId,
        provider: 'mpesa_stk',
        merchantReference: orderReference,
        amount,
        currency,
        status: 'FAILED',
        failureReason: 'Could not decrypt provider config',
      },
    })
    return { status: 'FAILED', message: 'Provider config error' }
  }
  // Normalise phone to 254XXXXXXXXX
  const normalizedPhone = normalisePhone(phone)
  if (!normalizedPhone) {
    await prisma.paymentAttempt.create({
      data: {
        orderId,
        tenantId,
        provider: 'mpesa_stk',
        merchantReference: orderReference,
        amount,
        currency,
        status: 'FAILED',
        failureReason: `Invalid phone number: ${phone}`,
      },
    })
    return { status: 'FAILED', message: 'Invalid phone number for M-Pesa' }
  }

  const callbackUrl = cfg.callbackUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://example.com'}/api/payments/mpesa/callback`

  try {
    const result = await stkPush(cfg, {
      amount,
      phone: normalizedPhone,
      accountReference: orderReference,
      description: `Order ${orderReference}`,
    })
    // Persist the attempt with the CheckoutRequestID — to be matched by the callback
    await prisma.paymentAttempt.create({
      data: {
        orderId,
        tenantId,
        provider: 'mpesa_stk',
        providerReference: result.checkoutRequestId,
        merchantReference: orderReference,
        idempotencyKey: result.checkoutRequestId,
        amount,
        currency,
        status: 'PENDING',
        rawResponse: JSON.stringify(result),
      },
    })
    await audit({
      ctx: { user: null, tenant: { id: tenantId, handle: '', displayName: '' }, ip: null, userAgent: null },
      action: 'payment.initiate',
      category: 'PAYMENT_INITIATED',
      targetType: 'Order',
      targetId: orderId,
      metadata: { provider: 'mpesa_stk', checkoutRequestId: result.checkoutRequestId },
    })
    return {
      status: 'PENDING',
      message: 'STK push sent to customer phone. Awaiting M-Pesa confirmation.',
      checkoutRequestId: result.checkoutRequestId,
    }
  } catch (err) {
    const reason = err instanceof DarajaError ? err.message : (err instanceof Error ? err.message : 'Unknown error')
    await prisma.paymentAttempt.create({
      data: {
        orderId,
        tenantId,
        provider: 'mpesa_stk',
        merchantReference: orderReference,
        amount,
        currency,
        status: 'FAILED',
        failureReason: reason,
        rawResponse: err instanceof Error ? JSON.stringify({ name: err.name, message: err.message }) : '{}',
      },
    })
    return { status: 'FAILED', message: `STK push failed: ${reason}` }
  }
}

function normalisePhone(input: string): string | null {
  let s = input.replace(/\D/g, '')
  if (s.startsWith('0')) s = '254' + s.slice(1)
  if (s.startsWith('254') && s.length === 12) return s
  if (s.startsWith('7') && s.length === 9) return '254' + s
  if (s.startsWith('1') && s.length === 9) return '254' + s
  return null
}

// Avoid unused import warnings on `req` in some flows
void queryParams
