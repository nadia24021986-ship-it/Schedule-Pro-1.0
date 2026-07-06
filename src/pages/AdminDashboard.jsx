import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { exportElementAsJpg } from '../utils/exportJpg.js'
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

export default function AdminDashboard() {
  const navigate = useNavigate()
  const printRef = useRef(null)

  const [checkingAuth, setCheckingAuth] = useState(true)
  const [employees, setEmployees] = useState([])
  const [periods, setPeriods] = useState([])
  const [activePeriod, setActivePeriod] = useState(null)
  const [periodEmployees, setPeriodEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [saveMessage, setSaveMessage] = useState('')
  const [penMode, setPenMode] = useState(false)

  const [newEmpName, setNewEmpName] = useState('')
  const [newEmpPosition, setNewEmpPosition] = useState('')
  const [addExistingId, setAddExistingId] = useState('')

  const [showNewPeriod, setShowNewPeriod] = useState(false)
  const [npTitle, setNpTitle] = useState('')
  const [npLocation, setNpLocation] = useState('')
  const [npStart, setNpStart] = useState('')
  const [npEnd, setNpEnd] = useState('')

  useEffect(() => {
    const isAuthed = localStorage.getItem('jk_admin_auth') === 'true'
    if (!isAuthed) {
      navigate('/')
      return
    }
    setCheckingAuth(false)
    loadEmployees()
    loadPeriods()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('jk_employees').select('*').order('name')
    setEmployees(data || [])
    return data || []
  }

  async function loadPeriods() {
    const { data } = await supabase.from('jk_periods').select('*').order('start_date', { ascending: false })
    setPeriods(data || [])
    if (data && data.length > 0) {
      selectPeriod(data[0])
    }
  }

  async function selectPeriod(period) {
    setActivePeriod(period)
    const { data: pe } = await supabase
      .from('jk_period_employees')
      .select('*, jk_employees(*)')
      .eq('period_id', period.id)
      .order('sort_order')
    setPeriodEmployees(pe || [])

    const { data: sh } = await supabase
      .from('jk_shifts')
      .select('*')
      .eq('period_id', period.id)
    setShifts(sh || [])
  }

  const knownLocations = useMemo(() => {
    const set = new Set(periods.map((p) => p.location).filter(Boolean))
    return Array.from(set)
  }, [periods])

  async function createPeriod(e) {
    e.preventDefault()
    if (!npTitle || !npLocation || !npStart || !npEnd) return

    const { data: newPeriod, error } = await supabase
      .from('jk_periods')
      .insert({ title: npTitle, location: npLocation, start_date: npStart, end_date: npEnd })
      .select()
      .single()

    if (error || !newPeriod) return

    const activeEmployees = await loadEmployees()
    const rows = activeEmployees
      .filter((emp) => emp.active)
      .map((emp, idx) => ({
        period_id: newPeriod.id,
        employee_id: emp.id,
        sort_order: idx + 1,
        keterangan: '',
      }))

    if (rows.length > 0) {
      await supabase.from('jk_period_employees').insert(rows)
    }

    setShowNewPeriod(false)
    setNpTitle(''); setNpLocation(''); setNpStart(''); setNpEnd('')
    const { data: updated } = await supabase.from('jk_periods').select('*').order('start_date', { ascending: false })
    setPeriods(updated || [])
    selectPeriod(newPeriod)
  }

  async function createEmployee(e) {
    e.preventDefault()
    if (!newEmpName.trim()) return
    const { data, error } = await supabase
      .from('jk_employees')
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
    const { error } = await supabase.from('jk_period_employees').insert({
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
    if (!confirm(`Hapus ${pe.jk_employees.name} dari jadwal ini?`)) return
    await supabase.from('jk_period_employees').delete().eq('id', pe.id)
    await supabase.from('jk_shifts').delete().eq('period_id', activePeriod.id).eq('employee_id', pe.employee_id)
    selectPeriod(activePeriod)
  }

  async function updateKeterangan(pe, value) {
    setPeriodEmployees((prev) => prev.map((p) => p.id === pe.id ? { ...p, keterangan: value } : p))
    await supabase.from('jk_period_employees').update({ keterangan: value }).eq('id', pe.id)
  }

  async function updateShiftCode(employeeId, isoDate, code) {
    setShifts((prev) => {
      const exists = prev.find((s) => s.employee_id === employeeId && s.shift_date === isoDate)
      if (exists) {
        return prev.map((s) => s === exists ? { ...s, code } : s)
      }
      return [...prev, { employee_id: employeeId, shift_date: isoDate, code, period_id: activePeriod.id }]
    })
    await supabase.from('jk_shifts').upsert({
      period_id: activePeriod.id,
      employee_id: employeeId,
      shift_date: isoDate,
      code,
    }, { onConflict: 'period_id,employee_id,shift_date' })
  }

  async function toggleCustomHoliday(iso) {
    const current = activePeriod.custom_holidays || []
    const updated = current.includes(iso)
      ? current.filter((d) => d !== iso)
      : [...current, iso]

    setActivePeriod((prev) => ({ ...prev, custom_holidays: updated }))
    setPeriods((prev) => prev.map((p) => p.id === activePeriod.id ? { ...p, custom_holidays: updated } : p))

    await supabase.from('jk_periods').update({ custom_holidays: updated }).eq('id', activePeriod.id)
  }

  function handleSavePeriod() {
    if (document.activeElement) document.activeElement.blur()
    setSaveMessage('Periode telah tersimpan.')
    setTimeout(() => setSaveMessage(''), 3000)
  }

  function handleLogout() {
    localStorage.removeItem('jk_admin_auth')
    navigate('/')
  }

  const dates = activePeriod ? dateRange(activePeriod.start_date, activePeriod.end_date) : []

  const groupedByPosition = useMemo(() => {
    const groups = {}
    periodEmployees.forEach((pe) => {
      const pos = pe.jk_employees.position || 'Lainnya'
      if (!groups[pos]) groups[pos] = []
      groups[pos].push(pe)
    })
    return groups
  }, [periodEmployees])

  const availableToAdd = employees.filter(
    (e) => !periodEmployees.some((pe) => pe.employee_id === e.id)
  )

  if (checkingAuth) return <div className="p-8 text-slate-400">Memuat...</div>

  let runningNumber = 0

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-ink text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <h1 className="font-bold text-sm">Admin — Jadwal Kerja</h1>
        <button onClick={handleLogout} className="text-xs underline text-slate-300">Keluar</button>
      </div>

      <div className="p-4 max-w-full overflow-x-auto">

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
              <input placeholder="Judul (mis. 21 Juli - 20 Agustus 2026)" value={npTitle} onChange={(e) => setNpTitle(e.target.value)} className="col-span-2 border rounded px-2 py-1.5 text-sm" />

              <input
                list="location-suggestions"
                placeholder="Cari / ketik lokasi"
                value={npLocation}
                onChange={(e) => setNpLocation(e.target.value)}
                className="col-span-2 border rounded px-2 py-1.5 text-sm"
              />
              <datalist id="location-suggestions">
                {knownLocations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>

              <input type="date" value={npStart} onChange={(e) => setNpStart(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
              <input type="date" value={npEnd} onChange={(e) => setNpEnd(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
              <p className="col-span-2 text-xs text-slate-400">
                Semua karyawan aktif akan otomatis dimasukkan ke periode ini — tinggal isi kode shift-nya.
              </p>
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

            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => exportElementAsJpg(printRef, `${activePeriod.title}-${activePeriod.location}`)}
                className="bg-ink text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                📷 Export JPG
              </button>
              <button
                onClick={handleSavePeriod}
                className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                💾 Simpan Periode
              </button>
              <button
                onClick={() => setPenMode((v) => !v)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${penMode ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-500 border-red-400'}`}
              >
                🖊️ {penMode ? 'Mode Tanggal Merah: Aktif' : 'Tandai Tanggal Merah'}
              </button>
              {penMode && (
                <span className="text-xs text-red-500">Klik kolom tanggal di tabel untuk menandai/membatalkan.</span>
              )}
              {saveMessage && (
                <span className="text-sm text-green-600 font-medium">✓ {saveMessage}</span>
              )}
            </div>

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
                        const iso = d.toISOString().slice(0, 10)
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6
                        const isCustom = (activePeriod.custom_holidays || []).includes(iso)
                        const holiday = isHoliday(d) || isCustom
                        const cellClass = holiday ? 'bg-red-200' : isWeekend ? 'bg-weekend' : 'bg-slate-100'
                        return (
                          <th
                            key={iso}
                            onClick={() => penMode && toggleCustomHoliday(iso)}
                            className={`border border-slate-400 px-1 py-1 w-7 ${cellClass} ${penMode ? 'cursor-pointer hover:bg-red-300' : ''}`}
                          >
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
                        {list.map((pe) => {
                          runningNumber += 1
                          return (
                            <tr key={pe.id}>
                              <td className="border border-slate-400 text-center">{runningNumber}</td>
                              <td className="border border-slate-400 px-2 py-1 flex items-center justify-between gap-1">
                                <span>{pe.jk_employees.name}</span>
                                <button onClick={() => removeFromPeriod(pe)} className="text-red-400 text-[10px]">✕</button>
                              </td>
                              {dates.map((d) => {
                                const iso = d.toISOString().slice(0, 10)
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                                const isCustom = (activePeriod.custom_holidays || []).includes(iso)
                                const holiday = isHoliday(d) || isCustom
                                const cellClass = holiday ? 'bg-red-100' : isWeekend ? 'bg-weekend' : ''
                                const shift = shifts.find((s) => s.employee_id === pe.employee_id && s.shift_date === iso)
                                return (
                                  <td key={iso} className={`border border-slate-400 p-0 ${cellClass}`}>
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
                          )
                        })}
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
