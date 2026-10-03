import React, { useEffect, useState } from 'react'
import { LogIn, LogOut, UserPlus, X } from 'lucide-react'
import { supabase } from './supabase'

export default function AccountModal({ open, onClose, session, onAuthChange }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setMessage('')
      setPassword('')
    }
  }, [open])

  if (!open) return null

  const submit = async event => {
    event.preventDefault()
    if (!supabase) {
      setMessage('Supabase is not configured on this build yet.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onAuthChange?.(data.session)
        onClose?.()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || null } },
        })
        if (error) throw error
        if (data.session) {
          onAuthChange?.(data.session)
          onClose?.()
        } else {
          setMessage('Account created. Check your email to confirm your account, then log in.')
        }
      }
    } catch (error) {
      setMessage(error?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
    else {
      onAuthChange?.(null)
      onClose?.()
    }
    setBusy(false)
  }

  return <div className="account-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
    <section className="account-modal" role="dialog" aria-modal="true" aria-label="Account">
      <button className="account-modal-close" type="button" onClick={onClose} aria-label="Close"><X size={17}/></button>
      {session ? <>
        <div className="account-modal-heading"><div className="account-modal-icon"><LogIn size={20}/></div><div><strong>Account</strong><span>{session.user.email}</span></div></div>
        <p className="account-modal-copy">Your Zoologist progress is linked to this account and can be loaded on another device.</p>
        <button className="account-modal-primary" type="button" onClick={logout} disabled={busy}><LogOut size={15}/> {busy ? 'Signing out…' : 'Sign out'}</button>
      </> : <>
        <div className="account-modal-heading"><div className="account-modal-icon"><UserPlus size={20}/></div><div><strong>{mode === 'login' ? 'Log in' : 'Create account'}</strong><span>Zoologist cloud save</span></div></div>
        <form onSubmit={submit} className="account-form">
          {mode === 'signup' && <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Chappo"/></label>}
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
          {message && <p className="account-modal-message">{message}</p>}
          <button className="account-modal-primary" disabled={busy} type="submit"><LogIn size={15}/>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>
        <button className="account-modal-switch" type="button" onClick={()=>{setMode(mode === 'login' ? 'signup' : 'login');setMessage('')}}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Log in'}</button>
      </>}
    </section>
  </div>
}
