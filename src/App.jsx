import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  )
}
