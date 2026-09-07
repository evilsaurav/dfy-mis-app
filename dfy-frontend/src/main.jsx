import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from "react-router-dom"
import './index.css'
import ErrorBoundary from './ErrorBoundary.jsx'

// Route-level Dynamic Code Splitting (Shrinks initial FO mobile payload by ~75%)
const App = lazy(() => import('./App.jsx'));
const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));

const RouteLoadingFallback = () => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
    <p className="font-bold text-xs uppercase tracking-widest text-slate-300">⚡ Loading DFY TB MIS...</p>
  </div>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
