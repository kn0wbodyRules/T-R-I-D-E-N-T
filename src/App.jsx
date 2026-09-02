import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
import { WidgetProvider } from './context/WidgetContext';

export default function App() {
  return (
    <WidgetProvider>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<Placeholder title="Map View" icon="map" />} />
        <Route path="/reports" element={<Placeholder title="Reports" icon="description" />} />
        <Route path="/history" element={<Placeholder title="History" icon="history" />} />
      </Routes>
    </WidgetProvider>
  )
}
