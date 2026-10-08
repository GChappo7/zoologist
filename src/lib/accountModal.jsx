import React, { useEffect, useState } from 'react'
import { LogIn, LogOut, RotateCcw, UserPlus, X } from 'lucide-react'
import { supabase } from './supabase'

export default function AccountModal({ open, onClose, session, onAuthChange, onResetProgress, passwordRecovery=false, onPasswordRecoveryComplete, standalone=false }) {
  const [mode, setMode] = useState(passwordRecovery ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (passwordRecovery) {
      setMode('reset')
      setMessage('')
      setPassword('')
    } else if (!open) {
      setMode('login')
      setMessage('')
      setPassword('')
    }
  }, [open, passwordRecovery])

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
      } else if (mode === 'signup') {
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
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword('')
        setMessage('Password updated successfully. You can now continue to Zoologist.')
        onPasswordRecoveryComplete?.()
      }
    } catch (error) {
      setMessage(error?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const sendPasswordReset = async () => {
    if (!supabase) {
      setMessage('Supabase is not configured on this build yet.')
      return
    }
    if (!email.trim()) {
      setMessage('Enter your account email first.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw error
      setMessage('Password reset email sent. Check your inbox and follow the link to choose a new password.')
    } catch (error) {
      setMessage(error?.message || 'Could not send the password reset email.')
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

  return <div className={`account-modal-backdrop ${standalone ? "account-modal-backdrop-standalone" : ""}`} onMouseDown={e => !standalone && e.target === e.currentTarget && onClose?.()}>
    <section className={`account-modal ${standalone ? "account-modal-standalone" : ""}`} role="dialog" aria-modal="true" aria-label="Account">
      {!standalone && <button className="account-modal-close" type="button" onClick={onClose} aria-label="Close"><X size={17}/></button>}
      {passwordRecovery ? <>
        <div className="account-modal-heading"><div className="account-modal-icon"><LogIn size={20}/></div><div><strong>Set new password</strong><span>Zoologist account recovery</span></div></div>
        <form onSubmit={submit} className="account-form">
          <p className="account-modal-copy">Choose a new password for your existing Zoologist account.</p>
          <label>New password<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
          {message && <p className="account-modal-message">{message}</p>}
          <button className="account-modal-primary" disabled={busy} type="submit"><LogIn size={15}/>{busy ? 'Please wait…' : 'Set new password'}</button>
        </form>
      </> : session ? <>
        <div className="account-modal-heading"><div className="account-modal-icon"><LogIn size={20}/></div><div><strong>Account</strong><span>{session.user.email}</span></div></div>
        <p className="account-modal-copy">Your Zoologist progress is linked to this account and can be loaded on another device.</p>
        <button className="account-modal-primary" type="button" onClick={logout} disabled={busy}><LogOut size={15}/> {busy ? 'Signing out…' : 'Sign out'}</button>
        {onResetProgress && <button className="account-modal-reset" type="button" onClick={onResetProgress} disabled={busy}><RotateCcw size={15}/> Reset progress</button>}
      </> : <>
        <div className="account-modal-heading"><div className="account-modal-icon"><UserPlus size={20}/></div><div><strong>{mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Reset password'}</strong><span>Zoologist cloud save</span></div></div>
        <form onSubmit={submit} className="account-form">
          {mode === 'signup' && <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Chappo"/></label>}
          {mode !== 'reset' && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>}
          {mode === 'reset' && <p className="account-modal-copy">Choose a new password for your existing Zoologist account.</p>}
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
          {message && <p className="account-modal-message">{message}</p>}
          <button className="account-modal-primary" disabled={busy} type="submit"><LogIn size={15}/>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Set new password'}</button>
        </form>
        {mode === 'login' && <button className="account-modal-switch" type="button" onClick={sendPasswordReset} disabled={busy}>Forgot password?</button>}
        {mode !== 'reset' && <button className="account-modal-switch" type="button" onClick={()=>{setMode(mode === 'login' ? 'signup' : 'login');setMessage('')}}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Log in'}</button>}
        {mode === 'reset' && <button className="account-modal-switch" type="button" onClick={()=>{onPasswordRecoveryComplete?.();setMode('login');setMessage('')}}>Back to log in</button>}
      </>}
    </section>
  </div>
}
