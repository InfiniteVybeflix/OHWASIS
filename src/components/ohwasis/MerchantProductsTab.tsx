'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Loader2, Trash2, Edit } from 'lucide-react'

interface CategoryDTO { id: string; name: string; slug: string; _count?: { products: number } }
interface ProductDTO {
  id: string
  name: string
  slug: string
  description: string | null
  basePrice: number
  currency: string
  stock: number
  trackStock: boolean
  status: string
  sku: string | null
  barcode: string | null
  variants: Array<{ id: string; name: string; priceDelta: number; stock: number }>
  category: { id: string; name: string } | null
}

export function MerchantProductsTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProduct, setEditingProduct] = useState<ProductDTO | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([
        apiFetch<{ items: ProductDTO[] }>('/api/products'),
        apiFetch<{ categories: CategoryDTO[] }>('/api/categories'),
      ])
      setProducts(p.items)
      setCategories(c.categories)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  if (loading) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products.length} products · {categories.length} categories</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New product
        </Button>
      </div>
      {products.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No products yet. Create your first product.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-sm" onClick={() => setEditingProduct(p)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.category?.name ?? 'Uncategorised'}</div>
                  </div>
                  <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-semibold">{p.currency} {p.basePrice.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.trackStock ? `${p.stock} in stock` : 'no stock tracking'}
                  </span>
                </div>
                {p.variants.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">{p.variants.length} variants</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProductEditor
        open={showCreate || editingProduct !== null}
        product={editingProduct}
        categories={categories}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditingProduct(null) } }}
        onSaved={() => { void load() }}
      />
    </div>
  )
}

function ProductEditor({
  open, product, categories, onOpenChange, onSaved,
}: {
  open: boolean
  product: ProductDTO | null
  categories: CategoryDTO[]
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const isEdit = product !== null

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    categoryId: '',
    basePrice: 0,
    stock: 0,
    trackStock: true,
    status: 'DRAFT',
    sku: '',
  })

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        slug: product.slug,
        description: product.description ?? '',
        categoryId: product.category?.id ?? '',
        basePrice: product.basePrice,
        stock: product.stock,
        trackStock: product.trackStock,
        status: product.status,
        sku: product.sku ?? '',
      })
    } else {
      setForm({ name: '', slug: '', description: '', categoryId: '', basePrice: 0, stock: 0, trackStock: true, status: 'DRAFT', sku: '' })
    }
  }, [product])

  const submit = async () => {
    setLoading(true)
    try {
      const body = {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        basePrice: Number(form.basePrice),
        stock: Number(form.stock),
        trackStock: form.trackStock,
        status: form.status,
        sku: form.sku || undefined,
      }
      if (isEdit && product) {
        await apiFetch(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(body) })
        pushToast({ type: 'success', message: 'Product updated' })
      } else {
        await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(body) })
        pushToast({ type: 'success', message: 'Product created' })
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const archive = async () => {
    if (!product) return
    setLoading(true)
    try {
      await apiFetch(`/api/products/${product.id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Product archived' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Archive failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'Create product'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update product details' : 'Add a new product to your catalogue'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="auto-generated from name" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="categoryId">Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Uncategorised" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="basePrice">Base price (KES)</Label>
              <Input id="basePrice" type="number" min={0} value={form.basePrice} onChange={(e) => setForm((f) => ({ ...f, basePrice: Number(e.target.value) }))} />
            </div>
            <div>
              <Label htmlFor="stock">Stock</Label>
              <Input id="stock" type="number" min={0} value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))} disabled={!form.trackStock} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="trackStock" checked={form.trackStock} onChange={(e) => setForm((f) => ({ ...f, trackStock: e.target.checked }))} />
            <Label htmlFor="trackStock" className="text-sm font-normal">Track inventory</Label>
          </div>
          <div>
            <Label htmlFor="sku">SKU (optional)</Label>
            <Input id="sku" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="flex justify-between gap-2">
          {isEdit && (
            <Button variant="outline" size="sm" onClick={() => void archive()} disabled={loading}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Archive
            </Button>
          )}
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
