import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'

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

export default function EmployeeView() {
  const [query, setQuery] = useState('')
  const [allEmployees, setAllEmployees] = useState([])
  const [selected, setSelected] = useState(null)
  const [period, setPeriod] = useState(null)
  const [shifts, setShifts] = useState([])
  const [keterangan, setKeterangan] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('employees').select('*').eq('active', true).then(({ data }) => {
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

    // Cari period_employee terbaru untuk karyawan ini
    const { data: pe } = await supabase
      .from('period_employees')
      .select('*, periods(*)')
      .eq('employee_id', emp.id)
      .order('created_at', { ascending: false, foreignTable: 'periods' })

    if (!pe || pe.length === 0) {
      setPeriod(null)
      setShifts([])
      setLoading(false)
      return
    }

    // Ambil periode dengan start_date terbaru
    const latest = pe.sort((a, b) => new Date(b.periods.start_date) - new Date(a.periods.start_date))[0]
    setPeriod(latest.periods)
    setKeterangan(latest.keterangan || '')

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('period_id', latest.periods.id)
      .eq('employee_id', emp.id)

    setShifts(shiftData || [])
    setLoading(false)
  }

  const dates = period ? dateRange(period.start_date, period.end_date) : []

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-ink">Cek Jadwal Kerja</h1>
          <Link to="/admin/login" className="text-xs text-slate-400 underline">Admin</Link>
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
                    return (
                      <div
                        key={iso}
                        className={`rounded-lg p-2 text-center ${isWeekend ? 'bg-weekend' : 'bg-slate-50'}`}
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
    </div>
  )
              }
