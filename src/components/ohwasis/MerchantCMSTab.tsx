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
import { Plus, Loader2, Edit, FileText, Trash2 } from 'lucide-react'

interface PageDTO {
  id: string
  slug: string
  title: string
  status: string
  publishedAt: string | null
  updatedAt: string
}

export function MerchantCMSTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [pages, setPages] = useState<PageDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PageDTO | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ pages: PageDTO[] }>('/api/pages')
      setPages(data.pages)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  if (loading) return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{pages.length} pages</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New page
        </Button>
      </div>
      {pages.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No CMS pages yet. Create your first About, Privacy, or Terms page.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded border border-border/60 p-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant={p.status === 'PUBLISHED' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">/{p.slug}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                <Edit className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PageEditor
        open={showCreate || editing !== null}
        page={editing}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditing(null) } }}
        onSaved={() => { void load() }}
      />
    </div>
  )
}

function PageEditor({ open, page, onOpenChange, onSaved }: {
  open: boolean
  page: PageDTO | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    title: '',
    body: '',
    status: 'DRAFT',
  })

  useEffect(() => {
    if (page) {
      // Fetch full page to get body
      void (async () => {
        try {
          const data = await apiFetch<{ page: { slug: string; title: string; body: string; status: string } }>(`/api/pages/${page.id}`)
          setForm({ slug: data.page.slug, title: data.page.title, body: data.page.body, status: data.page.status })
        } catch {
          // ignore
        }
      })()
    } else {
      setForm({ slug: '', title: '', body: '', status: 'DRAFT' })
    }
  }, [page])

  const submit = async () => {
    setLoading(true)
    try {
      if (page) {
        await apiFetch(`/api/pages/${page.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await apiFetch('/api/pages', { method: 'POST', body: JSON.stringify(form) })
      }
      pushToast({ type: 'success', message: 'Page saved' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    if (!page) return
    setLoading(true)
    try {
      await apiFetch(`/api/pages/${page.id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Page deleted' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{page ? 'Edit page' : 'Create page'}</DialogTitle>
          <DialogDescription>
            HTML body is sanitised server-side before save. Drafts are private; only published pages appear on the storefront.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="about" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="UNPUBLISHED">Unpublished</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Body (HTML, sanitised on save)</Label>
            <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={10} className="font-mono text-xs" placeholder="<p>Your content here…</p>" />
            <p className="mt-1 text-xs text-muted-foreground">
              Script tags, on* handlers, and javascript: URLs are stripped automatically.
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between gap-2">
          {page && (
            <Button variant="outline" size="sm" onClick={() => void remove()} disabled={loading}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
