'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Plus, Loader2, Trash2, Edit, Upload, FileSpreadsheet, X } from 'lucide-react'

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
  attributes?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAttributes(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function extractImageUrls(raw: string | null | undefined): string[] {
  const attrs = parseAttributes(raw)
  const images = attrs.images
  if (Array.isArray(images)) {
    return images.filter((u): u is string => typeof u === 'string' && u.length > 0)
  }
  return []
}

/** Naive CSV parser: splits by newline + comma. First row is headers. */
function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

// ---------------------------------------------------------------------------

export function MerchantProductsTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProduct, setEditingProduct] = useState<ProductDTO | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // CSV import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const csvInputRef = useRef<HTMLInputElement | null>(null)

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

  const onCsvFilePicked = async (file: File) => {
    setCsvFileName(file.name)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (rows.length === 0) {
        pushToast({ type: 'error', message: 'CSV has no data rows' })
        return
      }
      if (!headers.includes('name') || !headers.includes('price')) {
        pushToast({ type: 'error', message: 'CSV must have "name" and "price" columns' })
        return
      }
      setCsvHeaders(headers)
      setCsvRows(rows)
      setCsvDialogOpen(true)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to read CSV' })
    }
  }

  const confirmImport = async () => {
    setImporting(true)
    try {
      const payload = csvRows.map((r) => ({
        name: r.name ?? '',
        basePrice: parseFloat(r.price ?? '0'),
        stock: parseInt(r.stock ?? '0', 10) || 0,
        category: r.category ?? '',
        description: r.description ?? '',
        sku: r.sku ?? '',
      }))
      const res = await apiFetch<{ imported: number; errors: Array<{ row: number; error: string }>; message?: string }>(
        '/api/products/import',
        { method: 'POST', body: JSON.stringify({ rows: payload }) },
      )
      if (res.errors.length > 0) {
        pushToast({ type: 'error', message: `Imported ${res.imported}, ${res.errors.length} failed: ${res.errors[0].error}` })
      } else {
        pushToast({ type: 'success', message: `Imported ${res.imported} product(s)` })
      }
      setCsvDialogOpen(false)
      setCsvRows([])
      setCsvHeaders([])
      setCsvFileName('')
      await load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Import failed' })
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products.length} products · {categories.length} categories</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => csvInputRef.current?.click()}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Import CSV
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" /> New product
          </Button>
        </div>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onCsvFilePicked(f)
            e.target.value = '' // allow re-picking the same file
          }}
        />
      </div>
      {products.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No products yet. Create your first product.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const imgs = extractImageUrls(p.attributes)
            return (
              <Card key={p.id} className="cursor-pointer hover:shadow-sm" onClick={() => setEditingProduct(p)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.category?.name ?? 'Uncategorised'}</div>
                    </div>
                    <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge>
                  </div>
                  {imgs.length > 0 && (
                    <div className="mt-2 flex gap-1 overflow-hidden">
                      {imgs.slice(0, 3).map((u, i) => (
                        <img key={u + i} src={u} alt={p.name} className="h-10 w-10 rounded border border-border/60 object-cover" />
                      ))}
                      {imgs.length > 3 && <span className="self-center text-xs text-muted-foreground">+{imgs.length - 3}</span>}
                    </div>
                  )}
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
            )
          })}
        </div>
      )}

      <ProductEditor
        open={showCreate || editingProduct !== null}
        product={editingProduct}
        categories={categories}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditingProduct(null) } }}
        onSaved={() => { void load() }}
      />

      {/* CSV Import Preview Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import products from CSV</DialogTitle>
            <DialogDescription>
              Reviewing <span className="font-medium">{csvRows.length}</span> row(s) from <span className="font-mono text-xs">{csvFileName}</span>. Confirm to import.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded border border-border/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  {csvHeaders.map((h) => (
                    <th key={h} className="px-2 py-1 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    {csvHeaders.map((h) => (
                      <td key={h} className="px-2 py-1">{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csvRows.length > 100 && (
            <p className="text-xs text-muted-foreground">Showing first 100 of {csvRows.length} rows.</p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCsvDialogOpen(false)} disabled={importing}>Cancel</Button>
            <Button onClick={() => void confirmImport()} disabled={importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {csvRows.length} product(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
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
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
      setImageUrls(extractImageUrls(product.attributes))
    } else {
      setForm({ name: '', slug: '', description: '', categoryId: '', basePrice: 0, stock: 0, trackStock: true, status: 'DRAFT', sku: '' })
      setImageUrls([])
    }
  }, [product])

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (arr.length === 0) {
      pushToast({ type: 'error', message: 'Please select image files' })
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      arr.forEach((f) => fd.append('files', f))
      // NOTE: not using apiFetch — it sets Content-Type: application/json
      const tenantHandle = useOhwasisStore.getState().activeTenantHandle
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
        headers: tenantHandle ? { 'x-ohwasis-tenant': tenantHandle } : undefined,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Upload failed (${res.status})`)
      }
      const urls: string[] = (data.files ?? []).map((f: { url: string }) => f.url)
      if (urls.length === 0) {
        pushToast({ type: 'error', message: 'No files were uploaded (check file type/size)' })
      } else {
        setImageUrls((prev) => [...prev, ...urls])
        pushToast({ type: 'success', message: `Uploaded ${urls.length} image(s)` })
      }
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    setLoading(true)
    try {
      const attributes = { images: imageUrls }
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
        attributes,
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

  const addCategory = async () => {
    if (!newCategoryName.trim()) return
    setAddingCategory(true)
    try {
      const slug = newCategoryName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const res = await apiFetch<{ category: { id: string; name: string; slug: string } }>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim(), slug }),
      })
      pushToast({ type: 'success', message: `Category "${res.category.name}" created` })
      setForm((f) => ({ ...f, categoryId: res.category.id }))
      setNewCategoryName('')
      setShowAddCategory(false)
      onSaved() // reload categories
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create category' })
    } finally {
      setAddingCategory(false)
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

          {/* Image upload — between Description and Category */}
          <div>
            <Label>Product images</Label>
            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border/70 p-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files
                  if (files && files.length > 0) void uploadFiles(files)
                  e.target.value = '' // allow re-picking same file
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Upload images'}
              </Button>
              {imageUrls.length === 0 && !uploading && (
                <span className="text-xs text-muted-foreground">PNG, JPG, WebP, GIF — max 10MB each</span>
              )}
            </div>
            {imageUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {imageUrls.map((url, idx) => (
                  <div key={url + idx} className="group relative h-20 w-20 overflow-hidden rounded border border-border/60">
                    <img src={url} alt={`Product image ${idx + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrls((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute right-0 top-0 rounded-bl bg-background/80 p-0.5 text-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                      aria-label="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="categoryId">Category</Label>
              <div className="flex gap-1">
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Uncategorised" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" type="button" onClick={() => setShowAddCategory(true)} className="shrink-0 px-2">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {categories.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">No categories yet. Click + to add one (e.g. &quot;Drinks&quot;, &quot;Clothes&quot;, anything you want).</p>
              )}
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

      {/* Add category sub-dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add new category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Category name</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Drinks, Clothes, Electronics…"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Add anything you want — this is your business, your categories.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => void addCategory()} disabled={addingCategory || !newCategoryName.trim()}>
              {addingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
