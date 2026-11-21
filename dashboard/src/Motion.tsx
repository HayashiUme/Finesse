import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const PresentContext = createContext(true)
export const useIsPresent = () => useContext(PresentContext)

// Keep the last rendered overlay alive briefly so external closes animate too.
export function Presence({ children }: { children: ReactElement | false | null | undefined }) {
  const present = Boolean(children)
  const last = useRef(children || null)
  const [exited, setExited] = useState(false)
  useLayoutEffect(() => {
    if (children) last.current = children
  }, [children])
  useEffect(() => {
    if (present) { setExited(false); return }
    const timer = window.setTimeout(() => { last.current = null; setExited(true) }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180)
    return () => window.clearTimeout(timer)
  }, [present])
  return <PresentContext.Provider value={present}>{children || (!exited && last.current)}</PresentContext.Provider>
}

export function MotionContent({ motionKey, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { motionKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = element.animate([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 240, easing: 'cubic-bezier(.16, 1, .3, 1)' })
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => animation.cancel()
    preference.addEventListener('change', stop)
    return () => { animation.cancel(); preference.removeEventListener('change', stop) }
  }, [motionKey])
  return <div {...props} ref={ref} className={`motion-content ${className}`}>{children}</div>
}

// Measure the actual labels so the highlight also follows locale and layout changes.
export function TabBar({ selectionKey, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { selectionKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const active = bar.querySelector<HTMLButtonElement>('button[aria-selected="true"], button[aria-pressed="true"]')
    if (!active) return
    const measure = () => {
      bar.style.setProperty('--tab-x', `${active.offsetLeft}px`)
      bar.style.setProperty('--tab-y', `${active.offsetTop}px`)
      bar.style.setProperty('--tab-width', `${active.offsetWidth}px`)
      bar.style.setProperty('--tab-height', `${active.offsetHeight}px`)
      bar.dataset.measured = 'true'
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    observer.observe(active)
    return () => observer.disconnect()
  }, [selectionKey])
  return <div {...props} ref={ref} className={`motion-tabs ${className}`} onKeyDown={event => {
    props.onKeyDown?.(event)
    if (event.defaultPrevented || props.role !== 'tablist' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]:not(:disabled)'))
    const current = tabs.indexOf(event.target as HTMLButtonElement)
    if (current < 0) return
    event.preventDefault()
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    tabs[index]?.focus()
    tabs[index]?.click()
  }}>{children}</div>
}

export function Toast({ children, onDismiss, role = 'status', className = '' }: { children: ReactNode; onDismiss?: () => void; role?: 'status' | 'alert'; className?: string }) {
  const { t } = useTranslation()
  const present = useIsPresent()
  return createPortal(<div className={`toast ${className} ${present ? 'is-entering' : 'is-exiting'}`} role={present ? role : undefined} aria-hidden={!present || undefined}>
    {children}
    {onDismiss && <button className="icon-btn" title={t('dismiss')} aria-label={t('dismiss')} onClick={onDismiss} tabIndex={present ? undefined : -1}><X size={15} /></button>}
  </div>, document.body)
}
