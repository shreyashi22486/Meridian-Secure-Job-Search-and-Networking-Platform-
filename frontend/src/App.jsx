import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Resumes from './pages/Resumes';
import AdminPanel from './pages/AdminPanel';

function ProtectedRoute({ children, adminOnly = false }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
    if (!user) return <Navigate to="/login" />;
    if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" />;
    return children;
}

export default function App() {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="loading-screen"><div className="spinner" /></div>;
    }

    return (
        <div className="app">
            <Navbar />
            <Routes>
                <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
                <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <main className="main-content"><Login /></main>} />
                <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <main className="main-content"><Register /></main>} />
                <Route path="/dashboard" element={<ProtectedRoute><main className="main-content"><Dashboard /></main></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><main className="main-content"><Profile /></main></ProtectedRoute>} />
                <Route path="/resumes" element={<ProtectedRoute><main className="main-content"><Resumes /></main></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute adminOnly><main className="main-content"><AdminPanel /></main></ProtectedRoute>} />
                <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} />} />
            </Routes>
        </div>
    );
}
