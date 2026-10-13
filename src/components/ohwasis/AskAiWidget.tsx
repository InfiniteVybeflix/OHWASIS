'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ThumbsUp, ThumbsDown, X, Plus, MessageSquare, ChevronDown, ChevronUp, Edit3, Pin, Trash2 } from 'lucide-react'

interface AiAnswer {
  answerId: string
  answer: string
  confidence: number
  needsHumanFollowup: boolean
  followupReason?: string
  contactInfo?: { email: string | null; phone: string | null }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  answerId?: string
  needsHuman?: boolean
  contactInfo?: { email: string | null; phone: string | null }
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  pinned: boolean
  createdAt: number
}

/**
 * Adjustable AI popup — a floating, draggable, resizable chat window.
 *
 * Features:
 *   - Draggable by the header (mouse + touch)
 *   - Resizable height (min 300px, max 70vh)
 *   - Collapsible to just the header
 *   - Chat history stored in localStorage (per tenant)
 *   - "New chat" button starts a fresh session
 *   - Thumbs up/down on answers
 *   - Uses the custom AI icon from /icons/ai-icon.webp
 */
export function AskAiWidget({ tenantHandle, tenantName }: { tenantHandle: string; tenantName: string }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [lastAnswerId, setLastAnswerId] = useState<string | null>(null)
  const [height, setHeight] = useState(420)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const pushToast = useOhwasisStore((s) => s.pushToast)

  const STORAGE_KEY = `ohwasis_ai_chats_${tenantHandle}`

  // Load chat sessions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ChatSession[]
        setSessions(parsed)
        if (parsed.length > 0) setActiveSessionId(parsed[0].id)
      }
    } catch { /* ignore */ }
  }, [STORAGE_KEY])

  // Save sessions to localStorage
  const saveSessions = useCallback((newSessions: ChatSession[]) => {
    setSessions(newSessions)
    try {
      // Keep only last 10 sessions
      const toStore = newSessions.slice(0, 10)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
    } catch { /* ignore */ }
  }, [STORAGE_KEY])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [sessions, activeSessionId])

  // Dragging logic
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return
      const touch = 'touches' in e ? e.touches[0] : e as MouseEvent
      const dx = touch.clientX - dragStartRef.current.x
      const dy = touch.clientY - dragStartRef.current.y
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, dragStartRef.current.px + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragStartRef.current.py + dy)),
      })
    }
    const onUp = () => { setDragging(false); dragStartRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging])

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const touch = 'touches' in e ? e.touches[0] : e as React.MouseEvent
    dragStartRef.current = { x: touch.clientX, y: touch.clientY, px: pos.x, py: pos.y }
    setDragging(true)
  }

  const newChat = () => {
    const session: ChatSession = { id: crypto.randomUUID(), title: 'New chat', messages: [], pinned: false, createdAt: Date.now() }
    const updated = [session, ...sessions]
    saveSessions(updated)
    setActiveSessionId(session.id)
    setLastAnswerId(null)
  }

  const deleteChat = (sessionId: string) => {
    const updated = sessions.filter((s) => s.id !== sessionId)
    saveSessions(updated)
    if (activeSessionId === sessionId) {
      setActiveSessionId(updated[0]?.id ?? null)
    }
  }

  const renameChat = (sessionId: string, title: string) => {
    const updated = sessions.map((s) => s.id === sessionId ? { ...s, title } : s)
    saveSessions(updated)
  }

  const togglePin = (sessionId: string) => {
    const updated = sessions.map((s) => s.id === sessionId ? { ...s, pinned: !s.pinned } : s)
    saveSessions(updated)
  }

  // Auto-name a chat based on the first user message
  const autoNameChat = (sessionId: string, firstMessage: string) => {
    const title = firstMessage.length > 30 ? firstMessage.slice(0, 30) + '…' : firstMessage
    renameChat(sessionId, title)
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const ask = async () => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setQuestion('')

    // Ensure we have an active session
    let sessionId = activeSessionId
    if (!sessionId) {
      const session: ChatSession = { id: crypto.randomUUID(), title: 'New chat', messages: [], pinned: false, createdAt: Date.now() }
      sessionId = session.id
      const updated = [session, ...sessions]
      saveSessions(updated)
      setActiveSessionId(sessionId)
    }

    // Auto-name the chat if it's still "New chat"
    const currentSession = sessions.find((s) => s.id === sessionId)
    if (currentSession && currentSession.title === 'New chat' && currentSession.messages.length === 0) {
      autoNameChat(sessionId, q)
    }

    // Add user message
    const updatedSessions = sessions.map((s) => {
      if (s.id !== sessionId) return s
      return { ...s, messages: [...s.messages, { role: 'user' as const, content: q }] }
    })
    saveSessions(updatedSessions)

    setLoading(true)
    try {
      const data = await apiFetch<AiAnswer>(`/api/ai/customer-question?handle=${tenantHandle}`, {
        method: 'POST',
        body: JSON.stringify({ question: q, previousAnswerId: lastAnswerId ?? undefined }),
        tenantHandle: null,
      })
      // Add assistant message — use the current sessions state
      const currentSessions = useOhwasisStore.getState() // dummy to avoid stale closure
      const latestSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          messages: [
            ...s.messages,
            { role: 'user' as const, content: q },
            { role: 'assistant' as const, content: data.answer, answerId: data.answerId, needsHuman: data.needsHumanFollowup, contactInfo: data.contactInfo },
          ],
        }
      })
      saveSessions(latestSessions)
      setLastAnswerId(data.answerId)
      void currentSessions
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'AI call failed'
      const latestSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        return {
          ...s,
          messages: [
            ...s.messages,
            { role: 'user' as const, content: q },
            { role: 'assistant' as const, content: `I couldn't answer that right now. ${errMsg}` },
          ],
        }
      })
      saveSessions(latestSessions)
    } finally {
      setLoading(false)
    }
  }

  const rateAnswer = async (answerId: string, rating: 1 | -1) => {
    try {
      await apiFetch(`/api/ai/customer-question?handle=${tenantHandle}`, {
        method: 'POST',
        body: JSON.stringify({ question: '(rating)', previousAnswerId: answerId, previousAnswerRating: rating }),
        tenantHandle: null,
      })
      pushToast({ type: 'success', message: rating > 0 ? 'Thanks for the feedback!' : 'Thanks — we\'ll review this answer' })
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* Floating AI button */}
      <button
        onClick={() => { setOpen(!open); if (!open && !activeSessionId) newChat() }}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg transition-transform hover:scale-110 sm:bottom-6"
        aria-label={`Ask ${tenantName} AI`}
      >
        { }
        <img src="/icons/ai-icon.webp" alt="AI" className="h-6 w-6" />
        {!open && sessions.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
            {sessions.length}
          </span>
        )}
      </button>

      {/* Popup panel */}
      {open && (
        <div
          ref={popupRef}
          className="fixed z-50 flex flex-col rounded-xl border border-border bg-background shadow-2xl"
          style={{
            right: pos.x === 0 && pos.y === 0 ? undefined : undefined,
            left: pos.x || undefined,
            top: pos.y || undefined,
            right: pos.x === 0 && pos.y === 0 ? '1rem' : undefined,
            bottom: pos.x === 0 && pos.y === 0 ? '5rem' : undefined,
            width: 'min(380px, calc(100vw - 2rem))',
            height: collapsed ? 'auto' : `${height}px`,
            maxHeight: '70vh',
          }}
        >
          {/* Header — draggable */}
          <div
            className="flex cursor-move items-center justify-between rounded-t-xl border-b bg-gradient-to-r from-cyan-500/10 to-purple-500/10 p-2"
            onMouseDown={startDrag}
            onTouchStart={startDrag}
          >
            <div className="flex items-center gap-2">
              { }
              <img src="/icons/ai-icon.webp" alt="AI" className="h-4 w-4" />
              <span className="text-sm font-medium">Ask {tenantName}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => void newChat()} className="rounded p-1 hover:bg-muted" title="New chat">
                <Plus className="h-3.5 w-3.5" />
              </button>
              {sessions.length > 1 && (
                <select
                  value={activeSessionId ?? ''}
                  onChange={(e) => { setActiveSessionId(e.target.value); setLastAnswerId(null) }}
                  className="max-w-32 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  title="Chat history"
                >
                  {sessions
                    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                    .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.pinned ? '📌 ' : ''}{s.title}
                    </option>
                  ))}
                </select>
              )}
              {/* Active chat actions */}
              {activeSession && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => { const name = prompt('Rename chat:', activeSession.title); if (name) renameChat(activeSession.id, name) }}
                    className="rounded p-1 hover:bg-muted"
                    title="Rename chat"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => togglePin(activeSession.id)}
                    className={`rounded p-1 hover:bg-muted ${activeSession.pinned ? 'text-amber-500' : ''}`}
                    title={activeSession.pinned ? 'Unpin' : 'Pin chat'}
                  >
                    <Pin className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this chat?')) deleteChat(activeSession.id) }}
                    className="rounded p-1 hover:bg-muted text-rose-500"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
              <button onClick={() => setCollapsed(!collapsed)} className="rounded p-1 hover:bg-muted" title={collapsed ? 'Expand' : 'Collapse'}>
                {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted" title="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Resize handle */}
          {!collapsed && (
            <div
              className="flex cursor-ns-resize items-center justify-center border-b bg-muted/30 py-0.5"
              onMouseDown={(e) => {
                e.preventDefault()
                const startY = e.clientY
                const startH = height
                const onMove = (ev: MouseEvent) => {
                  const dy = startY - ev.clientY
                  setHeight(Math.max(300, Math.min(window.innerHeight * 0.7, startH + dy)))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            >
              <div className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
            </div>
          )}

          {/* Messages */}
          {!collapsed && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-2">
                {(!activeSession || activeSession.messages.length === 0) && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    { }
                    <img src="/icons/ai-icon.webp" alt="AI" className="mx-auto mb-2 h-8 w-8 opacity-60" />
                    Ask me anything about {tenantName} — products, hours, delivery, policies.
                    <div className="mt-2 flex flex-wrap justify-center gap-1">
                      {['What are your hours?', 'Where do you deliver?', 'How do I pay?'].map((s) => (
                        <button
                          key={s}
                          onClick={() => setQuestion(s)}
                          className="rounded-full bg-muted px-2 py-1 text-[10px] hover:bg-muted/70"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeSession?.messages.map((m, i) => (
                  <div key={i} className={`text-xs ${m.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block max-w-[85%] rounded-lg p-2 ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.contactInfo && (m.contactInfo.email || m.contactInfo.phone) && (
                        <div className="mt-2 border-t border-border/40 pt-2 text-[10px] opacity-90">
                          <div>Contact {tenantName}:</div>
                          {m.contactInfo.email && <div>📧 {m.contactInfo.email}</div>}
                          {m.contactInfo.phone && <div>📞 {m.contactInfo.phone}</div>}
                        </div>
                      )}
                    </div>
                    {m.role === 'assistant' && m.answerId && !m.needsHuman && (
                      <div className="mt-1 flex justify-start gap-1">
                        <button onClick={() => void rateAnswer(m.answerId!, 1)} className="rounded p-0.5 hover:bg-muted" aria-label="Helpful">
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => void rateAnswer(m.answerId!, -1)} className="rounded p-0.5 hover:bg-muted" aria-label="Not helpful">
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> {tenantName} AI is thinking…
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex gap-1 border-t p-2">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }}
                  placeholder={`Ask ${tenantName}…`}
                  disabled={loading}
                  className="h-8 text-xs"
                />
                <Button onClick={() => void ask()} disabled={loading || !question.trim()} size="icon" className="h-8 w-8 shrink-0">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
