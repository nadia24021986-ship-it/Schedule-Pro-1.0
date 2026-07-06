import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { isHoliday } from '../utils/holidays.js'

function dateRange(start, end) {
  const dates = []
  let d = new Date(start)
  const endD = new Date(end)
  while (d <= endD) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export default function Home() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [allEmployees, setAllEmployees] = useState([])
  const [selected, setSelected] = useState(null)
  const [period, setPeriod] = useState(null)
  const [shifts, setShifts] = useState([])
  const [keterangan, setKeterangan] = useState('')
  const [loading, setLoading] = useState(false)

  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminCode, setAdminCode] = useState('')
  const [adminError, setAdminError] = useState('')

  useEffect(() => {
    supabase.from('jk_employees').select('*').eq('active', true).then(({ data }) => {
      setAllEmployees(data || [])
    })
  }, [])

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    return allEmployees.filter((e) =>
      e.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8)
  }, [query, allEmployees])

  async function selectEmployee(emp) {
    setSelected(emp)
    setQuery(emp.name)
    setLoading(true)

    const { data: pe } = await supabase
      .from('jk_period_employees')
      .select('*, jk_periods(*)')
      .eq('employee_id', emp.id)

    if (!pe || pe.length === 0) {
      setPeriod(null)
      setShifts([])
      setLoading(false)
      return
    }

    const latest = pe.sort((a, b) => new Date(b.jk_periods.start_date) - new Date(a.jk_periods.start_date))[0]
    setPeriod(latest.jk_periods)
    setKeterangan(latest.keterangan || '')

    const { data: shiftData } = await supabase
      .from('jk_shifts')
      .select('*')
      .eq('period_id', latest.jk_periods.id)
      .eq('employee_id', emp.id)

    setShifts(shiftData || [])
    setLoading(false)
  }

  function handleAdminSubmit(e) {
    e.preventDefault()
    if (adminCode === import.meta.env.VITE_ADMIN_CODE) {
      localStorage.setItem('jk_admin_auth', 'true')
      navigate('/admin')
    } else {
      setAdminError('Kode salah.')
    }
  }

  const dates = period ? dateRange(period.start_date, period.end_date) : []

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-ink">Cek Jadwal Kerja</h1>
          <button onClick={() => setShowAdminModal(true)} className="text-xs text-slate-400 underline">
            Masuk Admin
          </button>
        </div>

        <div className="relative mb-6">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); setPeriod(null) }}
            placeholder="Ketik nama Anda..."
            className="w-full border border-slate-300 rounded-lg px-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {query && !selected && suggestions.length > 0 && (
            <div className="absolute z-10 bg-white w-full border border-slate-200 rounded-lg mt-1 shadow-lg max-h-56 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectEmployee(s)}
                  className="block w-full text-left px-4 py-2 hover:bg-slate-50 border-b last:border-0"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-slate-400 ml-2">{s.position}</span>
                </button>
              ))}
            </div>
          )}
          {query && !selected && suggestions.length === 0 && (
            <p className="text-sm text-slate-400 mt-2">Nama tidak ditemukan.</p>
          )}
        </div>

        {loading && <p className="text-sm text-slate-400">Memuat...</p>}

        {selected && !loading && (
          <div className="bg-white rounded-xl shadow p-5">
            <div className="mb-4 pb-4 border-b border-slate-100">
              <p className="text-lg font-bold text-ink">{selected.name}</p>
              <p className="text-sm text-slate-500">{selected.position}</p>
              {period && <p className="text-sm text-slate-500">Lokasi: {period.location}</p>}
            </div>

            {!period && (
              <p className="text-sm text-slate-400">Belum ada jadwal untuk karyawan ini.</p>
            )}

            {period && (
              <>
                <p className="text-xs text-slate-400 mb-3">{period.title}</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {dates.map((d) => {
                    const iso = d.toISOString().slice(0, 10)
                    const shift = shifts.find((s) => s.shift_date === iso)
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    const isCustom = (period.custom_holidays || []).includes(iso)
                    const holiday = isHoliday(d) || isCustom
                    const cellClass = holiday ? 'bg-red-100' : isWeekend ? 'bg-weekend' : 'bg-slate-50'
                    return (
                      <div
                        key={iso}
                        className={`rounded-lg p-2 text-center ${cellClass}`}
                      >
                        <p className="text-[10px] text-slate-400">{d.getDate()}</p>
                        <p className="font-bold mono text-sm text-ink">{shift?.code || '-'}</p>
                      </div>
                    )
                  })}
                </div>
                {keterangan && (
                  <p className="text-sm text-slate-500 mt-4">Keterangan: {keterangan}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <form onSubmit={handleAdminSubmit} className="bg-white rounded-xl p-6 w-full max-w-xs shadow-xl">
            <p className="font-bold text-ink mb-1">Masuk sebagai Admin</p>
            <p className="text-xs text-slate-400 mb-4">Masukkan kode akses admin</p>
            <input
              type="password"
              autoFocus
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {adminError && <p className="text-red-600 text-xs mb-3">{adminError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowAdminModal(false); setAdminError(''); setAdminCode('') }} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm">
                Batal
              </button>
              <button className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-semibold">
                Masuk
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
      }
