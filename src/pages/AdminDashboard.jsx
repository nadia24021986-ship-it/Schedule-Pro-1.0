import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { exportElementAsJpg } from '../utils/exportJpg.js'

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

const WEEKDAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export default function AdminDashboard() {
  const navigate = useNavigate()
  const printRef = useRef(null)

  const [checkingAuth, setCheckingAuth] = useState(true)
  const [employees, setEmployees] = useState([])
  const [periods, setPeriods] = useState([])
  const [activePeriod, setActivePeriod] = useState(null)
  const [periodEmployees, setPeriodEmployees] = useState([])
  const [shifts, setShifts] = useState([])

  const [newEmpName, setNewEmpName] = useState('')
  const [newEmpPosition, setNewEmpPosition] = useState('')
  const [addExistingId, setAddExistingId] = useState('')

  const [showNewPeriod, setShowNewPeriod] = useState(false)
  const [npTitle, setNpTitle] = useState('')
  const [npLocation, setNpLocation] = useState('')
  const [npStart, setNpStart] = useState('')
  const [npEnd, setNpEnd] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/admin/login')
      } else {
        setCheckingAuth(false)
        loadEmployees()
        loadPeriods()
      }
    })
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees(data || [])
  }

  async function loadPeriods() {
    const { data } = await supabase.from('periods').select('*').order('start_date', { ascending: false })
    setPeriods(data || [])
    if (data && data.length > 0 && !activePeriod) {
      selectPeriod(data[0])
    }
  }

  async function selectPeriod(period) {
    setActivePeriod(period)
    const { data: pe } = await supabase
      .from('period_employees')
      .select('*, employees(*)')
      .eq('period_id', period.id)
      .order('sort_order')
    setPeriodEmployees(pe || [])

    const { data: sh } = await supabase
      .from('shifts')
      .select('*')
      .eq('period_id', period.id)
    setShifts(sh || [])
  }

  async function createPeriod(e) {
    e.preventDefault()
    if (!npTitle || !npLocation || !npStart || !npEnd) return
    const { data, error } = await supabase
      .from('periods')
      .insert({ title: npTitle, location: npLocation, start_date: npStart, end_date: npEnd })
      .select()
      .single()
    if (!error) {
      setShowNewPeriod(false)
      setNpTitle(''); setNpLocation(''); setNpStart(''); setNpEnd('')
      await loadPeriods()
      selectPeriod(data)
    }
  }

  async function createEmployee(e) {
    e.preventDefault()
    if (!newEmpName.trim()) return
    const { data, error } = await supabase
      .from('employees')
      .insert({ name: newEmpName.trim(), position: newEmpPosition.trim() })
      .select()
      .single()
    if (!error) {
      setNewEmpName(''); setNewEmpPosition('')
      await loadEmployees()
      if (activePeriod) addEmployeeToPeriod(data.id)
    }
  }

  async function addEmployeeToPeriod(employeeId) {
    if (!activePeriod || !employeeId) return
    const maxOrder = periodEmployees.reduce((m, pe) => Math.max(m, pe.sort_order), 0)
    const { error } = await supabase.from('period_employees').insert({
      period_id: activePeriod.id,
      employee_id: employeeId,
      sort_order: maxOrder + 1,
    })
    if (!error) {
      setAddExistingId('')
      selectPeriod(activePeriod)
    }
  }

  async function removeFromPeriod(pe) {
    if (!confirm(`Hapus ${pe.employees.name} dari jadwal ini?`)) return
    await supabase.from('period_employees').delete().eq('id', pe.id)
    await supabase.from('shifts').delete().eq('period_id', activePeriod.id).eq('employee_id', pe.employee_id)
    selectPeriod(activePeriod)
  }

  async function updateKeterangan(pe, value) {
    setPeriodEmployees((prev) => prev.map((p) => p.id === pe.id ? { ...p, keterangan: value } : p))
    await supabase.from('period_employees').update({ keterangan: value }).eq('id', pe.id)
  }

  async function updateShiftCode(employeeId, isoDate, code) {
    setShifts((prev) => {
      const exists = prev.find((s) => s.employee_id === employeeId && s.shift_date === isoDate)
      if (exists) {
        return prev.map((s) => s === exists ? { ...s, code } : s)
      }
      return [...prev, { employee_id: employeeId, shift_date: isoDate, code, period_id: activePeriod.id }]
    })
    await supabase.from('shifts').upsert({
      period_id: activePeriod.id,
      employee_id: employeeId,
      shift_date: isoDate,
      code,
    }, { onConflict: 'period_id,employee_id,shift_date' })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  const dates = activePeriod ? dateRange(activePeriod.start_date, activePeriod.end_date) : []

  const groupedByPosition = useMemo(() => {
    const groups = {}
    periodEmployees.forEach((pe) => {
      const pos = pe.employees.position || 'Lainnya'
      if (!groups[pos]) groups[pos] = []
      groups[pos].push(pe)
    })
    return groups
  }, [periodEmployees])

  const availableToAdd = employees.filter(
    (e) => !periodEmployees.some((pe) => pe.employee_id === e.id)
  )

  if (checkingAuth) return <div className="p-8 text-slate-400">Memuat...</div>

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-ink text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <h1 className="font-bold text-sm">Admin — Jadwal Kerja</h1>
        <button onClick={handleLogout} className="text-xs underline text-slate-300">Keluar</button>
      </div>

      <div className="p-4 max-w-full overflow-x-auto">

        {/* Pilih / buat periode */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-ink text-sm">Periode Jadwal</p>
            <button
              onClick={() => setShowNewPeriod((v) => !v)}
              className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-medium"
            >
              + Periode Baru
            </button>
          </div>

          {showNewPeriod && (
            <form onSubmit={createPeriod} className="grid grid-cols-2 gap-2 mb-3 bg-slate-50 p-3 rounded-lg">
              <input placeholder="Judul (mis. 21 Juni - 20 Juli 2026)" value={npTitle} onChange={(e) => setNpTitle(e.target.value)} className="col-span-2 border rounded px-2 py-1.5 text-sm" />
              <input placeholder="Lokasi (mis. Tanjung Gading)" value={npLocation} onChange={(e) => setNpLocation(e.target.value)} className="col-span-2 border rounded px-2 py-1.5 text-sm" />
              <input type="date" value={npStart} onChange={(e) => setNpStart(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
              <input type="date" value={npEnd} onChange={(e) => setNpEnd(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
              <button className="col-span-2 bg-ink text-white rounded py-1.5 text-sm font-medium">Simpan Periode</button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPeriod(p)}
                className={`text-xs px-3 py-1.5 rounded-full border ${activePeriod?.id === p.id ? 'bg-ink text-white border-ink' : 'border-slate-300 text-slate-600'}`}
              >
                {p.title} · {p.location}
              </button>
            ))}
          </div>
        </div>

        {activePeriod && (
          <>
            {/* Kelola karyawan */}
            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <p className="font-semibold text-ink text-sm mb-3">Kelola Karyawan</p>
              <form onSubmit={createEmployee} className="flex flex-wrap gap-2 mb-3">
                <input placeholder="Nama baru" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
                <input placeholder="Jabatan" value={newEmpPosition} onChange={(e) => setNewEmpPosition(e.target.value)} className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
                <button className="bg-amber-500 text-white px-3 py-1.5 rounded text-sm font-medium">Tambah & Masukkan</button>
              </form>
              <div className="flex gap-2">
                <select value={addExistingId} onChange={(e) => setAddExistingId(e.target.value)} className="border rounded px-2 py-1.5 text-sm flex-1">
                  <option value="">-- Tambahkan karyawan lama ke periode ini --</option>
                  {availableToAdd.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.position})</option>
                  ))}
                </select>
                <button onClick={() => addEmployeeToPeriod(addExistingId)} className="bg-ink text-white px-3 py-1.5 rounded text-sm">Masukkan</button>
              </div>
            </div>

            {/* Export */}
            <div className="mb-4">
              <button
                onClick={() => exportElementAsJpg(printRef, `${activePeriod.title}-${activePeriod.location}`)}
                className="bg-ink text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                📷 Export JPG
              </button>
            </div>

            {/* Tabel jadwal (ini yang di-export) */}
            <div className="overflow-x-auto bg-white rounded-xl shadow">
              <div ref={printRef} className="p-6 bg-white min-w-max">
                <h2 className="text-center font-bold text-ink text-base">
                  JADWAL KERJA PERSONEL CATERING {activePeriod.title.toUpperCase()}
                </h2>
                <h3 className="text-center font-bold text-ink text-sm mb-4">
                  {activePeriod.location.toUpperCase()}
                </h3>

                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-slate-400 px-2 py-1 bg-slate-100 w-8">NO</th>
                      <th className="border border-slate-400 px-2 py-1 bg-slate-100 min-w-[140px]">NAMA</th>
                      {dates.map((d) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6
                        return (
                          <th key={d.toISOString()} className={`border border-slate-400 px-1 py-1 w-7 ${isWeekend ? 'bg-weekend' : 'bg-slate-100'}`}>
                            {d.getDate()}
                          </th>
                        )
                      })}
                      <th className="border border-slate-400 px-2 py-1 bg-slate-100 min-w-[120px]">KETERANGAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedByPosition).map(([position, list]) => (
                      <>
                        <tr key={position}>
                          <td colSpan={dates.length + 3} className="border border-slate-400 px-2 py-1 font-bold bg-slate-50 italic">
                            {position}
                          </td>
                        </tr>
                        {list.map((pe, idx) => (
                          <tr key={pe.id}>
                            <td className="border border-slate-400 text-center">{idx + 1}</td>
                            <td className="border border-slate-400 px-2 py-1 flex items-center justify-between gap-1">
                              <span>{pe.employees.name}</span>
                              <button onClick={() => removeFromPeriod(pe)} className="text-red-400 text-[10px] no-print">✕</button>
                            </td>
                            {dates.map((d) => {
                              const iso = d.toISOString().slice(0, 10)
                              const isWeekend = d.getDay() === 0 || d.getDay() === 6
                              const shift = shifts.find((s) => s.employee_id === pe.employee_id && s.shift_date === iso)
                              return (
                                <td key={iso} className={`border border-slate-400 p-0 ${isWeekend ? 'bg-weekend' : ''}`}>
                                  <input
                                    defaultValue={shift?.code || ''}
                                    onBlur={(e) => updateShiftCode(pe.employee_id, iso, e.target.value)}
                                    className="w-7 text-center bg-transparent outline-none py-1 mono"
                                  />
                                </td>
                              )
                            })}
                            <td className="border border-slate-400 p-0">
                              <input
                                defaultValue={pe.keterangan || ''}
                                onBlur={(e) => updateKeterangan(pe, e.target.value)}
                                className="w-full px-2 py-1 outline-none bg-transparent"
                              />
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end gap-10 mt-10 text-xs">
                  <div className="text-center">
                    <p className="mb-10">Diperiksa,</p>
                    <p className="border-t border-slate-400 pt-1 w-24">( &nbsp; )</p>
                  </div>
                  <div className="text-center">
                    <p className="mb-10">Disetujui,</p>
                    <p className="border-t border-slate-400 pt-1 w-24">( &nbsp; )</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
                   }
