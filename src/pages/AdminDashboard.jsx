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
  const [schedules, setSchedules] = useState([])
  const [activeSchedule, setActiveSchedule] = useState(null)
  const [scheduleEmployees, setScheduleEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [saveMessage, setSaveMessage] = useState('')
  const [penMode, setPenMode] = useState(false)
  const [allLocations, setAllLocations] = useState([])

  const [newEmpName, setNewEmpName] = useState('')
  const [newEmpPosition, setNewEmpPosition] = useState('')

  const [showNewPeriod, setShowNewPeriod] = useState(false)
  const [npTitle, setNpTitle] = useState('')
  const [npLocation, setNpLocation] = useState('')
  const [npStart, setNpStart] = useState('')
  const [npEnd, setNpEnd] = useState('')

  const [showNewSchedule, setShowNewSchedule] = useState(false)
  const [nsLocation, setNsLocation] = useState('')

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
      const rows = template
        .filter((t) => activeIds.has(t.employee_id))
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
    await loadAllLocations()
    await loadPeriods()
  }

  async function createSchedule(e) {
    e.preventDefault()
    if (!nsLocation || !activePeriod) return

    const { data: newSchedule, error } = await supabase
      .from('jk_schedules')
      .insert({ period_id: activePeriod.id, location: nsLocation })
      .select()
      .single()
    if (error || !newSchedule) { alert(error?.message || 'Gagal menambah lokasi'); return }

    await autoFillEmployees(newSchedule.id, nsLocation)

    setShowNewSchedule(false)
    setNsLocation('')
    await loadAllLocations()
    const { data: sc } = await supabase
      .from('jk_schedules')
      .select('*')
      .eq('period_id', activePeriod.id)
      .order('created_at')
    setSchedules(sc || [])
    selectSchedule(newSchedule)
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
    const { data, error } = await supabase
      .from('jk_employees')
      .insert({ name: newEmpName.trim(), position: newEmpPosition.trim() })
      .select()
      .single()
    if (!error) {
      setNewEmpName(''); setNewEmpPosition('')
      await loadEmployees()
      const maxOrder = scheduleEmployees.reduce((m, se) => Math.max(m, se.sort_order), 0)
      await supabase.from('jk_schedule_employees').insert({
        schedule_id: activeSchedule.id,
        employee_id: data.id,
        sort_order: maxOrder + 1,
      })
      selectSchedule(activeSchedule)
    }
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
