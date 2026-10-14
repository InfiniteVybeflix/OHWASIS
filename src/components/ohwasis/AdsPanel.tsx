'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus, Trash2, Edit3, Copy, Pause, Play, Eye, Loader2, Megaphone,
  TrendingUp, Calendar, Image as ImageIcon, Palette, Settings, BarChart3, Archive, RotateCcw
} from 'lucide-react'
import { AdRenderer, type AdData } from '@/components/ohwasis/AdRenderer'

interface AdDTO {
  id: string
  title: string
  description: string
  tenantId: string | null
  tenant: { id: string; handle: string; displayName: string } | null
  imageUrl: string | null
  linkUrl: string | null
  ctaLabel: string
  ctaAction: string
  placement: string
  startsAt: string
  endsAt: string | null
  active: boolean
  status: string
  isSponsored: boolean
  sponsoredLabel: string
  priority: number
  deviceTarget: string
  targetAudience: string[]
  maxWidth: number
  maxHeight: number
  minHeight: number
  imageFit: string
  imagePosition: string
  theme: Record<string, unknown>
  impressionLimit: number | null
  perVisitorFreq: number
  impressions: number
  clicks: number
  createdAt: string
  updatedAt: string
}

interface TenantDTO {
  id: string
  handle: string
  displayName: string
}

const PLACEMENTS = [
  { value: 'top_banner', label: 'Top Banner (Marketplace)' },
  { value: 'featured_business', label: 'Featured Business' },
  { value: 'marketplace_feed', label: 'Marketplace Feed' },
  { value: 'category_page', label: 'Category Page' },
  { value: 'search_results', label: 'Search Results' },
  { value: 'storefront', label: 'Storefront' },
  { value: 'popup', label: 'Popup / Modal' },
]

const CTA_ACTIONS = [
  { value: 'visit_store', label: 'Visit Store' },
  { value: 'shop_now', label: 'Shop Now' },
  { value: 'contact_business', label: 'Contact Business' },
  { value: 'view_offer', label: 'View Offer' },
  { value: 'learn_more', label: 'Learn More' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_STYLES: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  draft: { variant: 'secondary', label: 'Draft' },
  scheduled: { variant: 'outline', label: 'Scheduled' },
  active: { variant: 'default', label: 'Active' },
  paused: { variant: 'secondary', label: 'Paused' },
  expired: { variant: 'secondary', label: 'Expired' },
  archived: { variant: 'destructive', label: 'Archived' },
}

const DEFAULT_THEME: Record<string, string> = {
  backgroundColor: '#0b1020',
  titleColor: '#D4AF37',
  descriptionColor: '#ccd0d8',
  borderColor: '#D4AF3733',
  borderWidth: '1',
  borderRadius: '12',
  ctaBg: '#D4AF37',
  ctaText: '#0b1020',
  ctaBorderRadius: '8',
  sponsoredBg: '#D4AF3722',
  sponsoredText: '#D4AF37',
  padding: '16',
}

export function AdsPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [ads, setAds] = useState<AdDTO[]>([])
  const [tenants, setTenants] = useState<TenantDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editingAd, setEditingAd] = useState<AdDTO | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [analyticsAd, setAnalyticsAd] = useState<AdDTO | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [adData, tenantData] = await Promise.all([
        apiFetch<{ ads: AdDTO[] }>(`/api/admin/ads?q=${encodeURIComponent(search)}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`),
        apiFetch<{ tenants: TenantDTO[] }>('/api/admin/merchants'),
      ])
      setAds(adData.ads)
      setTenants((tenantData.tenants ?? []).map((t: { id: string; handle: string; displayName: string }) => ({ id: t.id, handle: t.handle, displayName: t.displayName })))
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [search, statusFilter])  

  const togglePause = async (ad: AdDTO) => {
    const newStatus = ad.status === 'active' ? 'paused' : ad.status === 'paused' ? 'active' : ad.status
    if (ad.status !== 'active' && ad.status !== 'paused') return
    try {
      await apiFetch(`/api/admin/ads/${ad.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus, active: newStatus === 'active' }) })
      pushToast({ type: 'success', message: `Ad ${newStatus === 'active' ? 'resumed' : 'paused'}` })
      void load()
    } catch (err) { pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const duplicate = async (ad: AdDTO) => {
    try {
      await apiFetch('/api/admin/ads', {
        method: 'POST',
        body: JSON.stringify({
          title: `${ad.title} (Copy)`,
          description: ad.description,
          tenantId: ad.tenantId,
          imageUrl: ad.imageUrl,
          linkUrl: ad.linkUrl,
          ctaLabel: ad.ctaLabel,
          ctaAction: ad.ctaAction,
          placement: ad.placement,
          active: false,
          priority: ad.priority,
          deviceTarget: ad.deviceTarget,
          targetAudience: ad.targetAudience,
          maxWidth: ad.maxWidth,
          maxHeight: ad.maxHeight,
          minHeight: ad.minHeight,
          imageFit: ad.imageFit,
          imagePosition: ad.imagePosition,
          theme: ad.theme,
          isSponsored: ad.isSponsored,
          sponsoredLabel: ad.sponsoredLabel,
        }),
      })
      pushToast({ type: 'success', message: 'Ad duplicated as draft' })
      void load()
    } catch (err) { pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' }) }
  }

  const archive = async (ad: AdDTO) => {
    if (!confirm(`Archive "${ad.title}"? It will no longer appear publicly.`)) return
    try {
      await apiFetch(`/api/admin/ads/${ad.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived', active: false }) })
      pushToast({ type: 'success', message: 'Ad archived' })
      void load()
    } catch { pushToast({ type: 'error', message: 'Archive failed' }) }
  }

  const remove = async (ad: AdDTO) => {
    if (!confirm(`Delete "${ad.title}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/api/admin/ads/${ad.id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Ad deleted' })
      void load()
    } catch { pushToast({ type: 'error', message: 'Delete failed' }) }
  }

  // Stats summary
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0)
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0)
  const activeCount = ads.filter((a) => a.status === 'active').length
  const scheduledCount = ads.filter((a) => a.status === 'scheduled').length
  const pausedCount = ads.filter((a) => a.status === 'paused').length

  if (loading) return <Skeleton className="h-40" />

  return (
    <div className="space-y-4">
      {/* Dashboard stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Total ads" value={ads.length} icon={Megaphone} />
        <StatCard label="Active" value={activeCount} icon={TrendingUp} color="text-emerald-600" />
        <StatCard label="Scheduled" value={scheduledCount} icon={Calendar} color="text-amber-600" />
        <StatCard label="Paused" value={pausedCount} icon={Pause} color="text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total impressions" value={totalImpressions.toLocaleString()} icon={Eye} />
        <StatCard label="Total clicks" value={totalClicks.toLocaleString()} icon={BarChart3} color="text-cyan-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search by title…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setEditingAd(null); setShowEditor(true) }}>
          <Plus className="mr-1 h-4 w-4" /> New ad
        </Button>
      </div>

      {/* Ad list */}
      {ads.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No advertisements yet. Click "New ad" to create your first campaign.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {ads.map((ad) => {
            const status = STATUS_STYLES[ad.status] ?? { variant: 'secondary' as const, label: ad.status }
            const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0'
            return (
              <Card key={ad.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{ad.title}</span>
                        <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">{ad.placement.replace('_', ' ')}</Badge>
                        {ad.isSponsored && <Badge variant="outline" className="text-[10px] text-amber-600">Sponsored</Badge>}
                      </div>
                      {ad.tenant && <div className="mt-0.5 text-xs text-muted-foreground">Business: {ad.tenant.displayName}</div>}
                      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                        <span>{ad.impressions.toLocaleString()} impressions</span>
                        <span>{ad.clicks.toLocaleString()} clicks</span>
                        <span>{ctr}% CTR</span>
                        {ad.endsAt && <span>Expires: {new Date(ad.endsAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(ad.status === 'active' || ad.status === 'paused') && (
                        <Button size="sm" variant="outline" onClick={() => void togglePause(ad)}>
                          {ad.status === 'active' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => { setEditingAd(ad); setShowEditor(true) }}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAnalyticsAd(ad)}>
                        <BarChart3 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void duplicate(ad)} title="Duplicate">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void archive(ad)} title="Archive">
                        <Archive className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(ad)} title="Delete" className="text-rose-500">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Editor dialog */}
      <AdEditorDialog
        open={showEditor}
        onOpenChange={setShowEditor}
        editingAd={editingAd}
        tenants={tenants}
        onSaved={() => { void load() }}
      />

      {/* Analytics dialog */}
      <AdAnalyticsDialog ad={analyticsAd} onOpenChange={(o) => !o && setAnalyticsAd(null)} />
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Megaphone; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className={`text-lg font-bold ${color ?? ''}`}>{value}</div>
          </div>
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Ad Editor Dialog — full create/edit with all fields + live preview + theme
// ---------------------------------------------------------------------------

interface AdFormState {
  title: string
  description: string
  tenantId: string
  imageUrl: string
  linkUrl: string
  ctaLabel: string
  ctaAction: string
  placement: string
  startsAt: string
  endsAt: string
  active: boolean
  isSponsored: boolean
  sponsoredLabel: string
  priority: number
  deviceTarget: string
  targetAudience: string[]
  maxWidth: number
  maxHeight: number
  minHeight: number
  imageFit: string
  imagePosition: string
  theme: Record<string, string>
  impressionLimit: string
  perVisitorFreq: number
}

function AdEditorDialog({
  open, onOpenChange, editingAd, tenants, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editingAd: AdDTO | null
  tenants: TenantDTO[]
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('content')
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')
  const [imageValid, setImageValid] = useState<boolean | null>(null)

  const [form, setForm] = useState<AdFormState>(() => editingAd ? adToForm(editingAd) : defaultForm())

  useEffect(() => {
    if (editingAd) {
      setForm(adToForm(editingAd))
    } else {
      setForm(defaultForm())
    }
    setTab('content')
    setImageValid(null)
  }, [editingAd, open])

  // Validate image URL
  useEffect(() => {
    if (!form.imageUrl) { setImageValid(null); return }
    setImageValid(null)
    const img = new Image()
    img.onload = () => setImageValid(true)
    img.onerror = () => setImageValid(false)
    img.src = form.imageUrl
  }, [form.imageUrl])

  const update = <K extends keyof AdFormState>(key: K, value: AdFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const updateTheme = (key: string, value: string) => {
    setForm((f) => ({ ...f, theme: { ...f.theme, [key]: value } }))
  }

  const resetTheme = () => {
    setForm((f) => ({ ...f, theme: { ...DEFAULT_THEME } }))
  }

  const resetSizes = () => {
    update('maxWidth', 1280)
    update('maxHeight', 200)
    update('minHeight', 80)
    update('imageFit', 'cover')
    update('imagePosition', 'center')
  }

  const submit = async () => {
    if (!form.title || !form.description) {
      pushToast({ type: 'error', message: 'Title and description are required' })
      return
    }
    setLoading(true)
    try {
      const body = {
        title: form.title,
        description: form.description,
        tenantId: form.tenantId || undefined,
        imageUrl: form.imageUrl || undefined,
        linkUrl: form.linkUrl || undefined,
        ctaLabel: form.ctaLabel,
        ctaAction: form.ctaAction,
        placement: form.placement,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        active: form.active,
        isSponsored: form.isSponsored,
        sponsoredLabel: form.sponsoredLabel,
        priority: form.priority,
        deviceTarget: form.deviceTarget,
        targetAudience: form.targetAudience,
        maxWidth: form.maxWidth,
        maxHeight: form.maxHeight,
        minHeight: form.minHeight,
        imageFit: form.imageFit,
        imagePosition: form.imagePosition,
        theme: form.theme,
        impressionLimit: form.impressionLimit ? parseInt(form.impressionLimit, 10) : undefined,
        perVisitorFreq: form.perVisitorFreq,
      }
      if (editingAd) {
        await apiFetch(`/api/admin/ads/${editingAd.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        pushToast({ type: 'success', message: 'Ad updated' })
      } else {
        await apiFetch('/api/admin/ads', { method: 'POST', body: JSON.stringify(body) })
        pushToast({ type: 'success', message: 'Ad created' })
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  // Build preview ad data from form
  const previewAd: AdData = {
    id: 'preview',
    title: form.title || 'Advertisement Title',
    description: form.description || 'Advertisement description goes here.',
    imageUrl: form.imageUrl || null,
    linkUrl: form.linkUrl || null,
    ctaLabel: form.ctaLabel || 'Learn More',
    ctaAction: form.ctaAction,
    placement: form.placement,
    isSponsored: form.isSponsored,
    sponsoredLabel: form.sponsoredLabel,
    priority: form.priority,
    deviceTarget: 'all',
    targetAudience: form.targetAudience,
    maxWidth: form.maxWidth,
    maxHeight: form.maxHeight,
    minHeight: form.minHeight,
    imageFit: form.imageFit,
    imagePosition: form.imagePosition,
    theme: form.theme,
    perVisitorFreq: form.perVisitorFreq,
    tenant: tenants.find((t) => t.id === form.tenantId) ?? null,
  }

  const previewWidth = previewDevice === 'mobile' ? '390px' : previewDevice === 'tablet' ? '768px' : '100%'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editingAd ? 'Edit advertisement' : 'Create advertisement'}</DialogTitle>
          <DialogDescription>Configure content, appearance, schedule, and preview your advertisement.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="content"><Settings className="mr-1 h-3 w-3" /> Content</TabsTrigger>
            <TabsTrigger value="sizing"><ImageIcon className="mr-1 h-3 w-3" /> Image & Size</TabsTrigger>
            <TabsTrigger value="appearance"><Palette className="mr-1 h-3 w-3" /> Appearance</TabsTrigger>
            <TabsTrigger value="schedule"><Calendar className="mr-1 h-3 w-3" /> Schedule</TabsTrigger>
            <TabsTrigger value="preview"><Eye className="mr-1 h-3 w-3" /> Preview</TabsTrigger>
          </TabsList>

          {/* Content tab */}
          <TabsContent value="content" className="mt-3 space-y-3">
            <div>
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. 20% off all water bottles this weekend" />
            </div>
            <div>
              <Label>Description <span className="text-destructive">*</span></Label>
              <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={2} placeholder="Brief description of the advertisement" />
            </div>
            <div>
              <Label>Business / Advertiser</Label>
              <Select value={form.tenantId || 'none'} onValueChange={(v) => update('tenantId', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None (platform-wide)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (platform-wide)</SelectItem>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Image URL</Label>
              <Input value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder="https://example.com/banner.jpg" />
              {imageValid === true && <p className="mt-1 text-xs text-emerald-600">✓ Image loads correctly</p>}
              {imageValid === false && <p className="mt-1 text-xs text-rose-600">✗ Image URL is invalid or cannot be loaded. The ad will show a fallback.</p>}
            </div>
            <div>
              <Label>Destination URL (optional)</Label>
              <Input value={form.linkUrl} onChange={(e) => update('linkUrl', e.target.value)} placeholder="https://ohwasis.vercel.app/store/example" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>CTA Button Label</Label>
                <Input value={form.ctaLabel} onChange={(e) => update('ctaLabel', e.target.value)} placeholder="Shop Now" />
              </div>
              <div>
                <Label>CTA Action Type</Label>
                <Select value={form.ctaAction} onValueChange={(v) => update('ctaAction', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CTA_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Placement</Label>
              <Select value={form.placement} onValueChange={(v) => update('placement', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Display Priority</Label>
                <Input type="number" min={0} max={1000} value={form.priority} onChange={(e) => update('priority', Number(e.target.value))} />
                <p className="text-[10px] text-muted-foreground">Higher = shown first</p>
              </div>
              <div>
                <Label>Device Targeting</Label>
                <Select value={form.deviceTarget} onValueChange={(v) => update('deviceTarget', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All devices</SelectItem>
                    <SelectItem value="mobile">Mobile only</SelectItem>
                    <SelectItem value="tablet">Tablet only</SelectItem>
                    <SelectItem value="desktop">Desktop only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.isSponsored} onCheckedChange={(v) => update('isSponsored', v)} />
                <Label className="text-sm font-normal">Sponsored label</Label>
              </div>
              {form.isSponsored && (
                <Input value={form.sponsoredLabel} onChange={(e) => update('sponsoredLabel', e.target.value)} placeholder="Sponsored" className="max-w-32" />
              )}
            </div>
          </TabsContent>

          {/* Image & Size tab */}
          <TabsContent value="sizing" className="mt-3 space-y-3">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-medium">Banner Dimensions</Label>
                <Button size="sm" variant="ghost" onClick={resetSizes}><RotateCcw className="mr-1 h-3 w-3" /> Reset</Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Max Width (px)</Label>
                  <Input type="number" min={200} max={3840} value={form.maxWidth} onChange={(e) => update('maxWidth', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Max Height (px)</Label>
                  <Input type="number" min={40} max={600} value={form.maxHeight} onChange={(e) => update('maxHeight', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Min Height (px)</Label>
                  <Input type="number" min={40} max={600} value={form.minHeight} onChange={(e) => update('minHeight', Number(e.target.value))} />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                On mobile, max height is automatically capped at 160px to prevent the banner from dominating the screen.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Image Fit Mode</Label>
                <Select value={form.imageFit} onValueChange={(v) => update('imageFit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Cover (fills area, may crop)</SelectItem>
                    <SelectItem value="contain">Contain (shows full image)</SelectItem>
                    <SelectItem value="fill">Fill (stretches to fit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Image Position</Label>
                <Select value={form.imagePosition} onValueChange={(v) => update('imagePosition', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Impression Limit (optional)</Label>
                <Input type="number" min={1} value={form.impressionLimit} onChange={(e) => update('impressionLimit', e.target.value)} placeholder="Unlimited" />
                <p className="text-[10px] text-muted-foreground">Ad stops showing after this many impressions</p>
              </div>
              <div>
                <Label>Per-visitor Frequency</Label>
                <Input type="number" min={0} max={100} value={form.perVisitorFreq} onChange={(e) => update('perVisitorFreq', Number(e.target.value))} />
                <p className="text-[10px] text-muted-foreground">Max impressions per visitor session (0 = unlimited)</p>
              </div>
            </div>
          </TabsContent>

          {/* Appearance tab */}
          <TabsContent value="appearance" className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Theme & Colors</Label>
              <Button size="sm" variant="ghost" onClick={resetTheme}><RotateCcw className="mr-1 h-3 w-3" /> Reset to defaults</Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ColorField label="Background" value={form.theme.backgroundColor ?? DEFAULT_THEME.backgroundColor} onChange={(v) => updateTheme('backgroundColor', v)} />
              <ColorField label="Title text" value={form.theme.titleColor ?? DEFAULT_THEME.titleColor} onChange={(v) => updateTheme('titleColor', v)} />
              <ColorField label="Description text" value={form.theme.descriptionColor ?? DEFAULT_THEME.descriptionColor} onChange={(v) => updateTheme('descriptionColor', v)} />
              <ColorField label="Border" value={form.theme.borderColor ?? DEFAULT_THEME.borderColor} onChange={(v) => updateTheme('borderColor', v)} />
              <ColorField label="CTA Background" value={form.theme.ctaBg ?? DEFAULT_THEME.ctaBg} onChange={(v) => updateTheme('ctaBg', v)} />
              <ColorField label="CTA Text" value={form.theme.ctaText ?? DEFAULT_THEME.ctaText} onChange={(v) => updateTheme('ctaText', v)} />
              <ColorField label="Sponsored BG" value={form.theme.sponsoredBg ?? DEFAULT_THEME.sponsoredBg} onChange={(v) => updateTheme('sponsoredBg', v)} />
              <ColorField label="Sponsored Text" value={form.theme.sponsoredText ?? DEFAULT_THEME.sponsoredText} onChange={(v) => updateTheme('sponsoredText', v)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Border Width</Label>
                <Input type="number" min={0} max={10} value={form.theme.borderWidth ?? DEFAULT_THEME.borderWidth} onChange={(e) => updateTheme('borderWidth', e.target.value)} />
              </div>
              <div>
                <Label>Border Radius</Label>
                <Input type="number" min={0} max={32} value={form.theme.borderRadius ?? DEFAULT_THEME.borderRadius} onChange={(e) => updateTheme('borderRadius', e.target.value)} />
              </div>
              <div>
                <Label>Padding</Label>
                <Input type="number" min={0} max={40} value={form.theme.padding ?? DEFAULT_THEME.padding} onChange={(e) => updateTheme('padding', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>CTA Button Radius</Label>
              <Input type="number" min={0} max={32} value={form.theme.ctaBorderRadius ?? DEFAULT_THEME.ctaBorderRadius} onChange={(e) => updateTheme('ctaBorderRadius', e.target.value)} />
            </div>
          </TabsContent>

          {/* Schedule tab */}
          <TabsContent value="schedule" className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start Date & Time</Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => update('startsAt', e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Leave empty for immediate</p>
              </div>
              <div>
                <Label>End Date & Time</Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => update('endsAt', e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Leave empty for no expiry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => update('active', v)} />
              <Label className="text-sm font-normal">Publish immediately (if start date is now)</Label>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Status logic:</p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li>If active + start date in future → <strong>Scheduled</strong></li>
                <li>If active + start date is now → <strong>Active</strong></li>
                <li>If not active → <strong>Draft</strong></li>
                <li>After end date passes → automatically <strong>Expired</strong></li>
                <li>Paused ads remain hidden until resumed</li>
              </ul>
            </div>
          </TabsContent>

          {/* Preview tab */}
          <TabsContent value="preview" className="mt-3 space-y-3">
            <div>
              <Label>Preview Device</Label>
              <div className="mt-1 flex gap-2">
                {(['mobile', 'tablet', 'desktop'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setPreviewDevice(d)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${previewDevice === d ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-4">
              <div style={{ width: previewWidth, maxWidth: '100%', margin: '0 auto' }}>
                <AdRenderer ad={previewAd} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This preview uses the same AdRenderer component as the live marketplace. What you see here is what customers will see.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={loading || !form.title || !form.description}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingAd ? 'Save changes' : 'Create ad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <input
          type="color"
          value={value.startsWith('#') ? value.slice(0, 7) : '#000000'}
          onChange={(e) => onChange(e.target.value + (value.length > 7 ? value.slice(7) : ''))}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-xs" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ad Analytics Dialog
// ---------------------------------------------------------------------------

function AdAnalyticsDialog({ ad, onOpenChange }: { ad: AdDTO | null; onOpenChange: (o: boolean) => void }) {
  if (!ad) return null
  const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'
  return (
    <Dialog open={!!ad} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Analytics: {ad.title}</DialogTitle>
          <DialogDescription>Performance metrics for this advertisement campaign.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground">Impressions</div>
              <div className="text-2xl font-bold">{ad.impressions.toLocaleString()}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground">Clicks</div>
              <div className="text-2xl font-bold text-cyan-600">{ad.clicks.toLocaleString()}</div>
            </CardContent></Card>
          </div>
          <Card><CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">Click-through Rate (CTR)</div>
            <div className="text-2xl font-bold text-amber-600">{ctr}%</div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.min(parseFloat(ctr), 100)}%` }} />
            </div>
          </CardContent></Card>
          <div className="rounded-lg border border-border/60 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="font-medium">{ad.status}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Placement:</span><span className="font-medium">{ad.placement.replace('_', ' ')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Priority:</span><span className="font-medium">{ad.priority}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Device target:</span><span className="font-medium">{ad.deviceTarget}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Start:</span><span className="font-medium">{new Date(ad.startsAt).toLocaleString()}</span></div>
            {ad.endsAt && <div className="flex justify-between"><span className="text-muted-foreground">End:</span><span className="font-medium">{new Date(ad.endsAt).toLocaleString()}</span></div>}
            {ad.tenant && <div className="flex justify-between"><span className="text-muted-foreground">Business:</span><span className="font-medium">{ad.tenant.displayName}</span></div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultForm(): AdFormState {
  return {
    title: '',
    description: '',
    tenantId: '',
    imageUrl: '',
    linkUrl: '',
    ctaLabel: 'Learn More',
    ctaAction: 'learn_more',
    placement: 'top_banner',
    startsAt: '',
    endsAt: '',
    active: false,
    isSponsored: true,
    sponsoredLabel: 'Sponsored',
    priority: 0,
    deviceTarget: 'all',
    targetAudience: ['customer'],
    maxWidth: 1280,
    maxHeight: 200,
    minHeight: 80,
    imageFit: 'cover',
    imagePosition: 'center',
    theme: { ...DEFAULT_THEME },
    impressionLimit: '',
    perVisitorFreq: 0,
  }
}

function adToForm(ad: AdDTO): AdFormState {
  const theme = (ad.theme ?? {}) as Record<string, string>
  return {
    title: ad.title,
    description: ad.description,
    tenantId: ad.tenantId ?? '',
    imageUrl: ad.imageUrl ?? '',
    linkUrl: ad.linkUrl ?? '',
    ctaLabel: ad.ctaLabel,
    ctaAction: ad.ctaAction,
    placement: ad.placement,
    startsAt: ad.startsAt ? new Date(ad.startsAt).toISOString().slice(0, 16) : '',
    endsAt: ad.endsAt ? new Date(ad.endsAt).toISOString().slice(0, 16) : '',
    active: ad.active,
    isSponsored: ad.isSponsored,
    sponsoredLabel: ad.sponsoredLabel,
    priority: ad.priority,
    deviceTarget: ad.deviceTarget,
    targetAudience: ad.targetAudience,
    maxWidth: ad.maxWidth,
    maxHeight: ad.maxHeight,
    minHeight: ad.minHeight,
    imageFit: ad.imageFit,
    imagePosition: ad.imagePosition,
    theme: { ...DEFAULT_THEME, ...theme },
    impressionLimit: ad.impressionLimit?.toString() ?? '',
    perVisitorFreq: ad.perVisitorFreq,
  }
}
