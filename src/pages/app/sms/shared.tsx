// Componentes e helpers compartilhados entre os formulários do App SMS
import { useRef, useState } from "react"

// ─── Photo capture ───────────────────────────────────────────────────────────

export function usePhotoCapture(max = 3) {
  const [photos, setPhotos] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const capture = () => inputRef.current?.click()

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.slice(0, max - photos.length).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (ev.target?.result) setPhotos(p => [...p, ev.target!.result as string])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const remove = (i: number) => setPhotos(p => p.filter((_, idx) => idx !== i))

  return { photos, capture, remove, onFileChange, inputRef, canAdd: photos.length < max }
}

// ─── PhotoStrip ─────────────────────────────────────────────────────────────

export function PhotoStrip({
  photos, onCapture, onRemove, canAdd, inputRef, onFileChange,
}: {
  photos: string[]
  onCapture: () => void
  onRemove: (i: number) => void
  canAdd: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Fotos</label>
      <div className="flex gap-2 flex-wrap">
        {photos.map((src, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
            >✕</button>
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={onCapture}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 text-xs gap-1 active:bg-gray-50"
          >
            <span className="text-2xl leading-none">📷</span>
            <span>Foto</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        className="hidden"
        multiple
      />
    </div>
  )
}

// ─── FormShell — header + scroll area + save button ─────────────────────────

export function FormShell({
  title, emoji, onBack, onSave, saving, children,
}: {
  title: string
  emoji: string
  onBack: () => void
  onSave: () => void
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 safe-top">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center text-gray-500 -ml-1">
          ←
        </button>
        <span className="text-lg">{emoji}</span>
        <h1 className="font-semibold text-gray-900 text-sm flex-1">{title}</h1>
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-36">
        {children}
      </div>

      {/* Save button (fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 safe-bottom">
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:opacity-50 active:scale-[.98] transition-transform"
        >
          {saving ? 'Salvando…' : 'Salvar lançamento'}
        </button>
      </div>
    </div>
  )
}

// ─── Input helpers ───────────────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
export const selectCls = inputCls
export const textareaCls = `${inputCls} resize-none`

// ─── Chip selector ───────────────────────────────────────────────────────────

export function ChipGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; color?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            value === o.value
              ? `${o.color ?? 'bg-green-600 border-green-600'} text-white`
              : 'bg-white border-gray-200 text-gray-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
