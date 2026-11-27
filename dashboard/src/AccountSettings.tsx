import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, Plus, Trash2, Upload, UserRound } from 'lucide-react'
import { createUser, deleteUser, fetchUsers, updateAvatar } from './api'
import { useAuth } from './auth'
import { errorMessage, LocalizedError } from './i18n'
import type { SavedServer } from './types'

export function Avatar({ username, avatar, large = false }: { username: string; avatar?: string | null; large?: boolean }) {
  return <span className={`account-avatar ${large ? 'account-avatar-large' : ''}`}>{avatar ? <img src={avatar} alt="" /> : username.slice(0, 1).toUpperCase()}</span>
}

export function AvatarPicker({ value, onChange, disabled }: { value: string | null; onChange: (avatar: string | null) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function read(file: File) {
    setBusy(true); setError(null)
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new LocalizedError('imageType')
      if (file.size > 12 * 1024 * 1024) throw new LocalizedError('imageSize')
      const bitmap = await createImageBitmap(file)
      try {
        if (!bitmap.width || !bitmap.height) throw new LocalizedError('imageProcess')
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
        const context = canvas.getContext('2d')
        if (!context) throw new LocalizedError('imageProcess')
        const side = Math.min(bitmap.width, bitmap.height)
        context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
        const avatar = canvas.toDataURL('image/webp', 0.85)
        if (avatar.length > 340_000) throw new LocalizedError('avatarInvalid')
        onChange(avatar)
      } finally { bitmap.close() }
    } catch (failure) { setError(failure instanceof LocalizedError ? failure : new LocalizedError('imageProcess')) }
    finally { setBusy(false) }
  }
  return <div className="avatar-picker"><Avatar username="?" avatar={value} large /><div><label className={`secondary-btn avatar-upload ${disabled || busy ? 'disabled' : ''}`}><input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('uploadAvatar')} disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void read(file) }} />{busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{t('uploadAvatar')}</label>{value && <button type="button" className="secondary-btn" disabled={disabled || busy} onClick={() => onChange(null)}>{t('removeAvatar')}</button>}<p className="account-hint">{t('avatarHint')}</p>{error != null && <p className="setup-error" role="alert">{errorMessage(error)}</p>}</div></div>
}

export default function AccountSettings({ server }: { server: SavedServer }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const session = auth.sessions[server.id]!
  const connection = { ...server, token: session.token }
  const superAdmin = session.user.role === 'superadmin'
  const queryClient = useQueryClient()
  const users = useQuery({ queryKey: ['users', server.id, session.token], queryFn: () => fetchUsers(connection), enabled: superAdmin, retry: false })
  const [avatar, setAvatar] = useState(session.user.avatar)
  const [newAvatar, setNewAvatar] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setAvatar(session.user.avatar) }, [session.user.avatar])
  async function perform(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(null); setSaved(false)
    try { await operation(); setSaved(true) } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <section className="account-settings"><div className="page-heading"><div><h1>{t('accountSettings')}</h1><p>{t('accountScope', { name: server.name })}</p></div></div><div className="account-panel"><div className="account-title"><UserRound size={18} /><div><h3>{session.user.username}</h3><p>{t(superAdmin ? 'superAdminLogin' : 'adminLogin')}</p></div></div><AvatarPicker value={avatar} onChange={value => { setAvatar(value); setSaved(false) }} disabled={busy} /><button className="primary-btn" disabled={busy || avatar === session.user.avatar} onClick={() => void perform(async () => { const result = await updateAvatar(connection, avatar); auth.setUser(server.id, result.user) })}>{busy ? <LoaderCircle size={15} className="spin" /> : null}{t('saveAvatar')}</button></div>
    {superAdmin && <div className="account-panel"><h3>{t('managedAccounts')}</h3><form onSubmit={event => { event.preventDefault(); void perform(async () => { await createUser(connection, username, password, newAvatar); setUsername(''); setPassword(''); setNewAvatar(null); await queryClient.invalidateQueries({ queryKey: ['users', server.id] }) }) }}><fieldset disabled={busy}><div className="account-fields"><label className="field-label">{t('username')}<input required pattern="[A-Za-z0-9_.-]{3,32}" minLength={3} maxLength={32} autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} /></label><label className="field-label">{t('password')}<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label></div><p className="account-hint">{t('accountPolicy')}</p><AvatarPicker value={newAvatar} onChange={setNewAvatar} disabled={busy} /></fieldset><button className="primary-btn" disabled={busy}><Plus size={15} />{t('createAccount')}</button></form>{users.isPending && <p role="status">{t('loadingAccounts')}</p>}{users.isError && <div className="setup-error" role="alert">{errorMessage(users.error)}<button className="secondary-btn" onClick={() => void users.refetch()}>{t('refresh')}</button></div>}<div className="account-list">{users.data?.map(user => <div className="account-list-row" key={user.id}><Avatar username={user.username} avatar={user.avatar} /><b>{user.username}</b><span>{t('adminLogin')}</span><button className="icon-btn" aria-label={t('deleteAccount', { name: user.username })} disabled={busy} onClick={() => { if (window.confirm(t('confirmDeleteAccount', { name: user.username }))) void perform(async () => { await deleteUser(connection, user.id); await users.refetch() }) }}><Trash2 size={16} /></button></div>)}{users.data?.length === 0 && <p className="account-hint">{t('noAccounts')}</p>}</div></div>}
    {error != null && <div className="setup-error" role="alert">{errorMessage(error)}</div>}{saved && <p className="account-saved" role="status">{t('accountSaved')}</p>}
  </section>
}
