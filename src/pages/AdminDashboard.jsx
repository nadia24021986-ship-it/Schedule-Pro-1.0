import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { exportElementAsJpg } from '../utils/exportJpg.js'
import { isHoliday } from '../utils/holidays.js'

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

function formatTanggalIndo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`
}

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
  const [schedules, setSchedules] = useState([])
  const [activeSchedule, setActiveSchedule] = useState(null)
  const [scheduleEmployees, setScheduleEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [saveMessage, setSaveMessage] = useState('')
  const [penMode, setPenMode] = useState(false)
  const [showTable, setShowTable] = useState(true)
  const [allLocations, setAllLocations] = useState([])

  const [newEmpName, setNewEmpName] = useState('')
  const [newEmpPosition, setNewEmpPosition] = useState('')

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
    loadAllLocations()
  }, [])

  async function loadEmployees() {
    const { data } = await supabase.from('jk_employees').select('*').order('name')
    setEmployees(data || [])
    return data || []
  }

  async function loadAllLocations() {
    const { data } = await supabase.from('jk_schedules').select('location')
    const set = new Set((data || []).map((s) => s.location).filter(Boolean))
    setAllLocations(Array.from(set))
  }

  async function loadPeriods() {
    const { data } = await supabase.from('jk_periods').select('*').order('start_date', { ascending: false })
    setPeriods(data || [])
    if (data && data.length > 0) {
      selectPeriod(data[0])
    } else {
      setActivePeriod(null)
      setSchedules([])
      setActiveSchedule(null)
    }
  }

  async function selectPeriod(period) {
    setActivePeriod(period)
    setShowTable(true)
    const { data: sc } = await supabase
      .from('jk_schedules')
      .select('*')
      .eq('period_id', period.id)
      .order('created_at')
    setSchedules(sc || [])
    if (sc && sc.length > 0) {
      selectSchedule(sc[0])
    } else {
      setActiveSchedule(null)
      setScheduleEmployees([])
      setShifts([])
    }
  }

  async function selectSchedule(schedule) {
    setActiveSchedule(schedule)
    setShowTable(true)
    const { data: se } = await supabase
      .from('jk_schedule_employees')
      .select('*, jk_employees(*)')
      .eq('schedule_id', schedule.id)
      .order('sort_order')
    setScheduleEmployees(se || [])

    const { data: sh } = await supabase
      .from('jk_shifts')
      .select('*')
      .eq('schedule_id', schedule.id)
    setShifts(sh || [])
  }

  async function getStructureTemplate(location) {
    const { data: last } = await supabase
      .from('jk_schedules')
      .select('id')
      .eq('location', location)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!last) return null

    const { data: se } = await supabase
      .from('jk_schedule_employees')
      .select('employee_id, sort_order')
      .eq('schedule_id', last.id)
      .order('sort_order')
    return se && se.length > 0 ? se : null
  }

  async function autoFillEmployees(scheduleId, location) {
    const activeEmployees = await loadEmployees()
    const activeIds = new Set(activeEmployees.filter((e) => e.active).map((e) => e.id))

    const template = location ? await getStructureTemplate(location) : null

    if (template) {
      const seen = new Set()
      const rows = template
        .filter((t) => activeIds.has(t.employee_id))
        .filter((t) => {
          if (seen.has(t.employee_id)) return false
          seen.add(t.employee_id)
          return true
        })
        .map((t) => ({
          schedule_id: scheduleId,
          employee_id: t.employee_id,
          sort_order: t.sort_order,
          keterangan: '',
        }))
      if (rows.length > 0) {
        await supabase.from('jk_schedule_employees').insert(rows)
        return
      }
    }

    const rows = activeEmployees
      .filter((emp) => emp.active)
      .map((emp, idx) => ({
        schedule_id: scheduleId,
        employee_id: emp.id,
        sort_order: idx + 1,
        keterangan: '',
      }))
    if (rows.length > 0) {
      await supabase.from('jk_schedule_employees').insert(rows)
    }
  }

  async function createPeriod(e) {
    e.preventDefault()
    if (!npTitle || !npLocation || !npStart || !npEnd) return

    const { data: newPeriod, error } = await supabase
      .from('jk_periods')
      .insert({ title: npTitle, start_date: npStart, end_date: npEnd })
      .select()
      .single()
    if (error || !newPeriod) { alert(error?.message || 'Gagal membuat periode'); return }

    const { data: newSchedule, error: schError } = await supabase
      .from('jk_schedules')
      .insert({ period_id: newPeriod.id, location: npLocation })
      .select()
      .single()
    if (schError || !newSchedule) { alert(schError?.message || 'Gagal membuat lokasi'); return }

    await autoFillEmployees(newSchedule.id, npLocation)

    setShowNewPeriod(false)
    setNpTitle(''); setNpLocation(''); setNpStart(''); setNpEnd('')
    setShowTable(true)
    await loadAllLocations()
    await loadPeriods()
  }

  async function deletePeriod(period) {
    if (!confirm(`Hapus periode "${period.title}" beserta semua lokasi & jadwal di dalamnya? Tindakan ini tidak bisa dibatalkan.`)) return
    await supabase.from('jk_periods').delete().eq('id', period.id)
    await loadPeriods()
  }

  async function deleteSchedule(schedule) {
    if (!confirm(`Hapus lokasi "${schedule.location}" beserta seluruh jadwalnya dari periode ini?`)) return
    await supabase.from('jk_schedules').delete().eq('id', schedule.id)
    const { data: sc } = await supabase
      .from('jk_schedules')
      .select('*')
      .eq('period_id', activePeriod.id)
      .order('created_at')
    setSchedules(sc || [])
    if (sc && sc.length > 0) {
      selectSchedule(sc[0])
    } else {
      setActiveSchedule(null)
      setScheduleEmployees([])
      setShifts([])
    }
  }

  async function createEmployee(e) {
    e.preventDefault()
    if (!newEmpName.trim() || !activeSchedule) return

    const cleanName = newEmpName.trim()

    // Cek dulu apakah nama ini sudah pernah terdaftar (tidak peduli besar/kecil huruf)
    const existing = employees.find((emp) => emp.name.trim().toLowerCase() === cleanName.toLowerCase())

    let employeeId = existing?.id

    if (!employeeId) {
      const { data, error } = await supabase
        .from('jk_employees')
        .insert({ name: cleanName, position: newEmpPosition.trim() })
        .select()
        .single()
      if (error) { alert(error.message); return }
      employeeId = data.id
      await loadEmployees()
    }

    // Cek apakah karyawan ini sudah ada di jadwal ini juga (hindari duplikat baris)
    const alreadyInSchedule = scheduleEmployees.some((se) => se.employee_id === employeeId)
    if (alreadyInSchedule) {
      alert(`${cleanName} sudah ada di jadwal ini.`)
      setNewEmpName(''); setNewEmpPosition('')
      return
    }

    setNewEmpName(''); setNewEmpPosition('')
    const maxOrder = scheduleEmployees.reduce((m, se) => Math.max(m, se.sort_order), 0)
    await supabase.from('jk_schedule_employees').insert({
      schedule_id: activeSchedule.id,
      employee_id: employeeId,
      sort_order: maxOrder + 1,
    })
    selectSchedule(activeSchedule)
  }

  async function removeFromSchedule(se) {
    if (!confirm(`Hapus ${se.jk_employees.name} dari jadwal ini?`)) return
    await supabase.from('jk_schedule_employees').delete().eq('id', se.id)
    await supabase.from('jk_shifts').delete().eq('schedule_id', activeSchedule.id).eq('employee_id', se.employee_id)
    selectSchedule(activeSchedule)
  }

  async function updateKeterangan(se, value) {
    setScheduleEmployees((prev) => prev.map((p) => p.id === se.id ? { ...p, keterangan: value } : p))
    await supabase.from('jk_schedule_employees').update({ keterangan: value }).eq('id', se.id)
  }

  async function updateShiftCode(employeeId, isoDate, code) {
    setShifts((prev) => {
      const exists = prev.find((s) => s.employee_id === employeeId && s.shift_date === isoDate)
      if (exists) {
        return prev.map((s) => s === exists ? { ...s, code } : s)
      }
      return [...prev, { employee_id: employeeId, shift_date: isoDate, code, schedule_id: activeSchedule.id }]
    })
    await supabase.from('jk_shifts').upsert({
      schedule_id: activeSchedule.id,
      employee_id: employeeId,
      shift_date: isoDate,
      code,
    }, { onConflict: 'schedule_id,employee_id,shift_date' })
  }

  async function toggleCustomHoliday(iso) {
    const current = activeSchedule.custom_holidays || []
    const updated = current.includes(iso)
      ? current.filter((d) => d !== iso)
      : [...current, iso]

    setActiveSchedule((prev) => ({ ...prev, custom_holidays: updated }))
    setSchedules((prev) => prev.map((s) => s.id === activeSchedule.id ? { ...s, custom_holidays: updated } : s))

    await supabase.from('jk_schedules').update({ custom_holidays: updated }).eq('id', activeSchedule.id)
  }

  async function updatePeriodTitle(newTitle) {
    if (!newTitle.trim() || newTitle === activePeriod.title) return
    setActivePeriod((prev) => ({ ...prev, title: newTitle }))
    setPeriods((prev) => prev.map((p) => p.id === activePeriod.id ? { ...p, title: newTitle } : p))
    await supabase.from('jk_periods').update({ title: newTitle }).eq('id', activePeriod.id)
  }

  async function updateScheduleLocation(newLocation) {
    if (!newLocation.trim() || newLocation === activeSchedule.location) return
    setActiveSchedule((prev) => ({ ...prev, location: newLocation }))
    setSchedules((prev) => prev.map((s) => s.id === activeSchedule.id ? { ...s, location: newLocation } : s))
    await supabase.from('jk_schedules').update({ location: newLocation }).eq('id', activeSchedule.id)
    await loadAllLocations()
  }

  async function updateColumnLabel(key, value) {
    if (!value.trim()) return
    const current = activeSchedule.column_labels || { no: 'NO', nama: 'NAMA', keterangan: 'KETERANGAN' }
    const updated = { ...current, [key]: value }
    setActiveSchedule((prev) => ({ ...prev, column_labels: updated }))
    setSchedules((prev) => prev.map((s) => s.id === activeSchedule.id ? { ...s, column_labels: updated } : s))
    await supabase.from('jk_schedules').update({ column_labels: updated }).eq('id', activeSchedule.id)
  }

  async function updateGroupPosition(oldPos, newPos) {
    if (!newPos.trim() || newPos === oldPos) return
    const idsToUpdate = scheduleEmployees
      .filter((se) => (se.jk_employees.position || 'Lainnya') === oldPos)
      .map((se) => se.employee_id)
    if (idsToUpdate.length === 0) return

    await supabase.from('jk_employees').update({ position: newPos }).in('id', idsToUpdate)

    setScheduleEmployees((prev) => prev.map((se) =>
      idsToUpdate.includes(se.employee_id)
        ? { ...se, jk_employees: { ...se.jk_employees, position: newPos } }
        : se
    ))
    await loadEmployees()
  }

  function handleSavePeriod() {
    if (document.activeElement) document.activeElement.blur()
    setSaveMessage('Periode telah tersimpan.')
    setShowTable(false)
    setTimeout(() => setSaveMessage(''), 3000)
  }

  function handleLogout() {
    localStorage.removeItem('jk_admin_auth')
    navigate('/')
  }

  const dates = activePeriod ? dateRange(activePeriod.start_date, activePeriod.end_date) : []

  const groupedByPosition = useMemo(() => {
    const groups = {}
    scheduleEmployees.forEach((se) => {
      const pos = se.jk_employees.position || 'Lainnya'
      if (!groups[pos]) groups[pos] = []
      groups[pos].push(se)
    })
    return groups
  }, [scheduleEmployees])

  if (checkingAuth) return <div className="p-8 text-slate-400">Memuat...</div>

  let runningNumber = 0

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-sky-500 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow">
        <div>
          <p className="font-bold text-sm leading-tight">Schedule Pro 1.0</p>
          <p className="text-[11px] text-sky-100">hendrosapp.com</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">Admin</p>
          <button onClick={handleLogout} className="text-[11px] underline text-sky-100">Keluar</button>
        </div>
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
              <input placeholder="Judul (otomatis terisi dari tanggal, atau ketik manual)" value={npTitle} onChange={(e) => setNpTitle(e.target.value)} className="col-span-2 border rounded px-2 py-1.5 text-sm" />
              <input
                list="location-suggestions"
                placeholder="Lokasi pertama (mis. Tomaco)"
                value={npLocation}
                onChange={(e) => setNpLocation(e.target.value)}
                className="col-span-2 border rounded px-2 py-1.5 text-sm"
              />
              <datalist id="location-suggestions">
                {allLocations.map((loc) => (<option key={loc} value={loc} />))}
              </datalist>
              <input
                type="date"
                value={npStart}
                onChange={(e) => {
                  const val = e.target.value
                  setNpStart(val)
                  if (val && npEnd) setNpTitle(`${formatTanggalIndo(val)} - ${formatTanggalIndo(npEnd)}`)
                }}
                className="border rounded px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={npEnd}
                onChange={(e) => {
                  const val = e.target.value
                  setNpEnd(val)
                  if (npStart && val) setNpTitle(`${formatTanggalIndo(npStart)} - ${formatTanggalIndo(val)}`)
                }}
                className="border rounded px-2 py-1.5 text-sm"
              />
              <p className="col-span-2 text-xs text-slate-400">
                Kalau lokasi ini sudah pernah dipakai, susunan karyawan otomatis dipakai lagi — kolom shift & keterangan dikosongkan, tanggal mengikuti periode baru.
              </p>
              <button className="col-span-2 bg-ink text-white rounded py-1.5 text-sm font-medium">Simpan Periode</button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {periods.map((p) => (
              <div key={p.id} className={`flex items-center rounded-full border text-xs ${activePeriod?.id === p.id ? 'bg-ink text-white border-ink' : 'border-slate-300 text-slate-600'}`}>
                <button onClick={() => selectPeriod(p)} className="px-3 py-1.5">
                  {p.title}
                </button>
                <button onClick={() => deletePeriod(p)} className={`pr-2.5 ${activePeriod?.id === p.id ? 'text-red-300' : 'text-red-400'}`}>✕</button>
              </div>
            ))}
            {periods.length === 0 && <p className="text-xs text-slate-400">Belum ada periode. Buat periode baru dulu.</p>}
          </div>
        </div>

        {activePeriod && (
          <>
            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <p className="font-semibold text-ink text-sm mb-3">Lokasi dalam Periode Ini</p>

              <div className="flex flex-wrap gap-2">
                {schedules.map((s) => (
                  <div key={s.id} className={`flex items-center rounded-full border text-xs ${activeSchedule?.id === s.id ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-300 text-slate-600'}`}>
                    <button onClick={() => selectSchedule(s)} className="px-3 py-1.5">
                      {activePeriod.title} ({s.location.toUpperCase()})
                    </button>
                    <button onClick={() => deleteSchedule(s)} className={`pr-2.5 ${activeSchedule?.id === s.id ? 'text-red-100' : 'text-red-400'}`}>✕</button>
                  </div>
                ))}
                {schedules.length === 0 && <p className="text-xs text-slate-400">Belum ada lokasi di periode ini.</p>}
              </div>
            </div>

            {activeSchedule && (
              <>
                <div className="bg-white rounded-xl shadow p-4 mb-4">
                  <p className="font-semibold text-ink text-sm mb-3">Kelola Karyawan</p>
                  <form onSubmit={createEmployee} className="flex flex-wrap gap-2">
                    <input placeholder="Nama baru" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
                    <input placeholder="Jabatan" value={newEmpPosition} onChange={(e) => setNewEmpPosition(e.target.value)} className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
                    <button className="bg-amber-500 text-white px-3 py-1.5 rounded text-sm font-medium">Tambah & Masukkan</button>
                  </form>
                </div>

                <div className="mb-4 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => exportElementAsJpg(printRef, `${activePeriod.title}-${activeSchedule.location}`)}
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

                {!showTable && (
                  <div className="bg-white rounded-xl shadow p-6 text-center mb-4">
                    <p className="text-sm text-slate-500 mb-2">Tabel disembunyikan untuk hemat ruang.</p>
                    <p className="text-xs text-slate-400">Klik tombol periode atau lokasi di atas untuk membuka & melanjutkan mengisi jadwal ini.</p>
                  </div>
                )}

                {showTable && (
                <div className="overflow-x-auto bg-white rounded-xl shadow">
                  <div ref={printRef} className="p-6 bg-white min-w-max">
                    <p className="no-export text-center text-[11px] text-amber-600 mb-1">↕ Judul & lokasi di bawah bisa diketik ulang</p>
                    <div className="flex items-center justify-center flex-wrap gap-1">
                      <span className="font-bold text-ink text-lg">JADWAL KERJA PERSONEL CATERING</span>
                      <input
                        defaultValue={activePeriod.title.toUpperCase()}
                        onBlur={(e) => updatePeriodTitle(e.target.value)}
                        className="font-bold text-ink text-lg bg-transparent outline-none border-b border-dashed border-slate-300 uppercase text-center"
                        style={{ width: `${Math.max(activePeriod.title.length + 2, 12)}ch` }}
                      />
                    </div>
                    <input
                      defaultValue={activeSchedule.location.toUpperCase()}
                      onBlur={(e) => updateScheduleLocation(e.target.value)}
                      className="w-full text-center font-bold text-ink text-base bg-transparent outline-none border-b border-dashed border-slate-300 uppercase mb-4 mt-2 pb-1"
                    />

                    <table className="border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="border-2 border-slate-500 px-2 py-2 bg-slate-200 text-slate-800 w-8">
                            <input
                              defaultValue={activeSchedule.column_labels?.no || 'NO'}
                              onBlur={(e) => updateColumnLabel('no', e.target.value)}
                              className="w-full text-center bg-transparent outline-none font-bold"
                            />
                          </th>
                          <th className="border-2 border-slate-500 px-2 py-2 bg-slate-200 text-slate-800 min-w-[150px]">
                            <input
                              defaultValue={activeSchedule.column_labels?.nama || 'NAMA'}
                              onBlur={(e) => updateColumnLabel('nama', e.target.value)}
                              className="w-full text-center bg-transparent outline-none font-bold"
                            />
                          </th>
                          {dates.map((d) => {
                            const iso = d.toISOString().slice(0, 10)
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6
                            const isCustom = (activeSchedule.custom_holidays || []).includes(iso)
                            const holiday = isHoliday(d) || isCustom
                            const cellClass = holiday ? 'bg-red-200' : isWeekend ? 'bg-weekend' : 'bg-slate-200'
                            return (
                              <th
                                key={iso}
                                onClick={() => penMode && toggleCustomHoliday(iso)}
                                className={`border-2 border-slate-500 px-1 py-2 w-8 text-slate-800 ${cellClass} ${penMode ? 'cursor-pointer hover:bg-red-300' : ''}`}
                              >
                                {d.getDate()}
                              </th>
                            )
                          })}
                          <th className="border-2 border-slate-500 px-2 py-2 bg-slate-200 text-slate-800 min-w-[130px]">
                            <input
                              defaultValue={activeSchedule.column_labels?.keterangan || 'KETERANGAN'}
                              onBlur={(e) => updateColumnLabel('keterangan', e.target.value)}
                              className="w-full text-center bg-transparent outline-none font-bold"
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(groupedByPosition).map(([position, list]) => (
                          <>
                            <tr key={position}>
                              <td colSpan={dates.length + 3} className="border-2 border-slate-500 px-2 py-1.5 font-bold bg-slate-100 text-slate-800 italic">
                                <input
                                  defaultValue={position}
                                  onBlur={(e) => updateGroupPosition(position, e.target.value)}
                                  className="w-full bg-transparent outline-none italic font-bold"
                                />
                              </td>
                            </tr>
                            {list.map((se) => {
                              runningNumber += 1
                              return (
                                <tr key={se.id}>
                                  <td className="border-2 border-slate-500 text-center text-slate-800 font-medium">{runningNumber}</td>
                                  <td className="border-2 border-slate-500 px-2 py-1.5 flex items-center justify-between gap-1 text-slate-800 font-medium">
                                    <span>{se.jk_employees.name}</span>
                                    <button onClick={() => removeFromSchedule(se)} className="no-export text-red-400 text-[10px]">✕</button>
                                  </td>
                                  {dates.map((d) => {
                                    const iso = d.toISOString().slice(0, 10)
                                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                                    const isCustom = (activeSchedule.custom_holidays || []).includes(iso)
                                    const holiday = isHoliday(d) || isCustom
                                    const cellClass = holiday ? 'bg-red-100' : isWeekend ? 'bg-weekend' : ''
                                    const shift = shifts.find((s) => s.employee_id === se.employee_id && s.shift_date === iso)
                                    return (
                                      <td key={iso} className={`border-2 border-slate-500 p-0 ${cellClass}`}>
                                        <input
                                          defaultValue={shift?.code || ''}
                                          onBlur={(e) => updateShiftCode(se.employee_id, iso, e.target.value)}
                                          className="w-8 text-center bg-transparent outline-none py-1.5 mono font-bold text-slate-900"
                                        />
                                      </td>
                                    )
                                  })}
                                  <td className="border-2 border-slate-500 p-0">
                                    <input
                                      defaultValue={se.keterangan || ''}
                                      onBlur={(e) => updateKeterangan(se, e.target.value)}
                                      className="w-full px-2 py-1.5 outline-none bg-transparent text-slate-800"
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex justify-between items-end mt-10">
                      <p className="text-[11px] text-slate-400">hendrosapp.com | Schedule Pro 1.0</p>
                      <div className="flex gap-10 text-sm">
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
                </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
