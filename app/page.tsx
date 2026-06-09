'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth, db, hasFirebaseConfig } from '../lib/firebase'

type LoginMode = 'admin' | 'staff'

const OFFICIAL_ADMIN_EMAIL = 'sheerelegance46@gmail.com'
const LOCAL_PHONE_EMAIL_DOMAIN = 'teacherpro.local'

const isEmail = (value: string) =>
  /^[\w.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(
    value.trim(),
  )

const normalizeAuthEmail = (input: string) => {
  const trimmed = input.trim()
  return isEmail(trimmed) ? trimmed.toLowerCase() : `${trimmed}@${LOCAL_PHONE_EMAIL_DOMAIN}`
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'حدث خطأ غير متوقع أثناء العملية.'
}

const getFirebaseErrorMessage = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'بيانات الدخول غير صحيحة.'
    case 'auth/invalid-email':
      return 'البريد الإلكتروني غير صحيح.'
    case 'auth/too-many-requests':
      return 'محاولات كثيرة جدًا. جرّب مرة أخرى بعد قليل.'
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالشبكة الآن.'
    default:
      return getErrorMessage(error)
  }
}

async function loadProfile(uid: string) {
  if (!hasFirebaseConfig || !db) {
    throw new Error('Firebase غير مُعدّ بعد. راجع متغيرات البيئة أولًا.')
  }

  const snapshot = await getDoc(doc(db, 'teachers', uid))
  if (!snapshot.exists()) {
    return null
  }

  return snapshot.data() as Record<string, any>
}

async function authenticateUser(identifier: string, password: string, mode: LoginMode) {
  if (!hasFirebaseConfig || !auth || !db) {
    throw new Error('Firebase غير مُعدّ بعد. راجع متغيرات البيئة أولًا.')
  }

  const email = normalizeAuthEmail(identifier)

  if (mode === 'admin' && email !== OFFICIAL_ADMIN_EMAIL) {
    throw new Error('استخدم البريد الرسمي للأدمن فقط.')
  }

  const credentials = await signInWithEmailAndPassword(auth, email, password)
  const profile = await loadProfile(credentials.user.uid)

  if (!profile) {
    await signOut(auth)
    throw new Error('هذا الحساب لا يملك ملفًا إداريًا داخل النظام.')
  }

  if (profile.status === 'suspended') {
    await signOut(auth)
    throw new Error('هذا الحساب موقوف حاليًا.')
  }

  if (mode === 'admin' && profile.role !== 'admin') {
    await signOut(auth)
    throw new Error('هذا الحساب ليس مسجّلًا كأدمن.')
  }

  if (mode === 'staff' && !['teacher', 'admin'].includes(profile.role)) {
    await signOut(auth)
    throw new Error('هذا الحساب غير مصرح له بالدخول إلى لوحة الأدمن.')
  }

  return credentials
}

export default function AdminLogin() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<LoginMode>('admin')
  const [adminIdentifier, setAdminIdentifier] = useState(OFFICIAL_ADMIN_EMAIL)
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdminPassword, setShowAdminPassword] = useState(false)
  const [staffIdentifier, setStaffIdentifier] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [showStaffPassword, setShowStaffPassword] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetIdentifier, setResetIdentifier] = useState('')
  const [adminError, setAdminError] = useState('')
  const [staffError, setStaffError] = useState('')
  const [resetError, setResetError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [staffLoading, setStaffLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setStatusMessage('')
    setAdminLoading(true)

    try {
      await authenticateUser(adminIdentifier, adminPassword, 'admin')
      router.replace('/dashboard')
    } catch (error) {
      setAdminError(getFirebaseErrorMessage(error))
    } finally {
      setAdminLoading(false)
    }
  }

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setStaffError('')
    setStatusMessage('')
    setStaffLoading(true)

    try {
      await authenticateUser(staffIdentifier, staffPassword, 'staff')
      router.replace('/dashboard')
    } catch (error) {
      setStaffError(getFirebaseErrorMessage(error))
    } finally {
      setStaffLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setStatusMessage('')
    setResetLoading(true)

    try {
      if (!resetIdentifier.trim()) {
        throw new Error('اكتب البريد الإلكتروني أو رقم الموبايل أولًا.')
      }

      if (!hasFirebaseConfig || !auth) {
        throw new Error('Firebase غير مُعدّ بعد. راجع متغيرات البيئة أولًا.')
      }

      await sendPasswordResetEmail(auth, normalizeAuthEmail(resetIdentifier))
      setStatusMessage('تم إرسال رابط إعادة تعيين كلمة المرور بنجاح.')
      setShowResetModal(false)
      setResetIdentifier('')
    } catch (error) {
      setResetError(getFirebaseErrorMessage(error))
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="bg-white shadow-2xl rounded-3xl p-8 md:p-10 border border-slate-100">
          <div className="text-center mb-8">
            <div className="inline-flex mb-4 rounded-2xl bg-slate-950 p-3 shadow-lg">
              <Image
                src="/logo.png"
                alt="TeacherPro"
                width={72}
                height={72}
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-4xl font-black text-slate-950 mb-2">
              Teacher<span dir="ltr" className="text-amber-500">Pro</span>
            </h1>
            <p className="text-slate-600">لوحة التحكم الرسمية للأدمن والموظفين</p>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`px-6 py-3 rounded-full font-semibold transition duration-200 ${
                activeTab === 'admin'
                  ? 'bg-blue-900 text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              تسجيل دخول الأدمن
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`px-6 py-3 rounded-full font-semibold transition duration-200 ${
                activeTab === 'staff'
                  ? 'bg-blue-900 text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              تسجيل دخول الموظفين
            </button>
          </div>

          {statusMessage ? (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right text-emerald-800">
              {statusMessage}
            </div>
          ) : null}

          {activeTab === 'admin' ? (
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <div>
                <label className="block text-right text-slate-700 font-semibold mb-2">
                  البريد الإلكتروني الرسمي للأدمن
                </label>
                <input
                  type="email"
                  value={adminIdentifier}
                  onChange={(e) => setAdminIdentifier(e.target.value)}
                  placeholder={OFFICIAL_ADMIN_EMAIL}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  required
                />
              </div>

              <div>
                <label className="block text-right text-slate-700 font-semibold mb-2">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showAdminPassword ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-right text-sm text-slate-600">
                هذا النموذج يعمل على Firebase الرسمي نفسه المستخدم في التطبيق الرئيسي.
              </div>

              {adminError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-right text-red-700">
                  {adminError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={adminLoading}
                className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                {adminLoading ? 'جارٍ الدخول...' : 'دخول الأدمن'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-6">
              <div>
                <label className="block text-right text-slate-700 font-semibold mb-2">
                  البريد الإلكتروني أو رقم الموبايل
                </label>
                <input
                  type="text"
                  value={staffIdentifier}
                  onChange={(e) => setStaffIdentifier(e.target.value)}
                  placeholder="staff@example.com أو 01xxxxxxxxx"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  required
                />
              </div>

              <div>
                <label className="block text-right text-slate-700 font-semibold mb-2">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showStaffPassword ? 'text' : 'password'}
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPassword(!showStaffPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showStaffPassword ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                >
                  نسيت كلمة المرور؟
                </button>
                <div className="text-sm text-slate-600 text-right">
                  الدخول يتم فقط عبر حساب موجود في Firebase.
                </div>
              </div>

              {staffError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-right text-red-700">
                  {staffError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={staffLoading}
                className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                {staffLoading ? 'جارٍ الدخول...' : 'دخول الموظف'}
              </button>
            </form>
          )}

          <p className="text-center text-slate-500 text-sm mt-8">
            © 2026 TeacherPro. جميع الحقوق محفوظة.
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white rounded-3xl p-8 shadow-xl h-fit border border-white/10">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">التسجيل الرسمي</h2>
            <p className="text-blue-100 text-sm leading-relaxed">
              هذه النسخة مرتبطة مباشرةً بـ Firebase الرسمي، وتتحقق من ملف الحساب في Firestore قبل السماح بالدخول.
            </p>
          </div>

          <div className="space-y-4 text-sm">
            <div className="rounded-2xl bg-white/10 p-4">
              الأدمن الرسمي: <span className="font-semibold" dir="ltr">{OFFICIAL_ADMIN_EMAIL}</span>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              دخول الموظفين يدعم البريد الإلكتروني أو رقم الموبايل بنفس منطق التطبيق الرئيسي.
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              إعادة تعيين كلمة المرور ترسل رابطًا رسميًا إلى الحساب المرتبط.
            </div>
          </div>
        </div>
      </div>

      {showResetModal ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-6 text-right">
              <h2 className="text-2xl font-bold text-slate-900">إعادة تعيين كلمة المرور</h2>
              <p className="text-slate-600 text-sm mt-2">
                اكتب البريد الإلكتروني أو رقم الموبايل المرتبط بالحساب، وسنرسل رابط إعادة التعيين إلى حساب Firebase الرسمي.
              </p>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-right text-slate-700 font-semibold mb-2">
                  البريد الإلكتروني أو رقم الموبايل
                </label>
                <input
                  type="text"
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="teacher@example.com أو 01xxxxxxxxx"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-right"
                  required
                />
              </div>

              {resetError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-right text-red-700">
                  {resetError}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full sm:w-auto bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
                >
                  {resetLoading ? 'جارٍ الإرسال...' : 'إرسال الرابط'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false)
                    setResetError('')
                  }}
                  className="w-full sm:w-auto bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-lg transition duration-200"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
