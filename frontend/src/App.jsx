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
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import MyApplications from './pages/MyApplications';
import Applicants from './pages/Applicants';
import Messages from './pages/Messages';
import Network from './pages/Network';
import UserProfile from './pages/UserProfile';

function ProtectedRoute({ children, adminOnly = false }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
    if (!user) return <Navigate to="/login" />;
    if (adminOnly && user.role?.toLowerCase() !== 'admin') return <Navigate to="/dashboard" />;
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

                {/* M3: Jobs & Companies */}
                <Route path="/jobs" element={<main className="main-content"><Jobs /></main>} />
                <Route path="/jobs/:id" element={<main className="main-content"><JobDetail /></main>} />
                <Route path="/companies" element={<main className="main-content"><Companies /></main>} />
                <Route path="/companies/:id" element={<main className="main-content"><CompanyDetail /></main>} />
                <Route path="/applications" element={<ProtectedRoute><main className="main-content"><MyApplications /></main></ProtectedRoute>} />
                <Route path="/jobs/:jobId/applicants" element={<ProtectedRoute><main className="main-content"><Applicants /></main></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute><main className="main-content"><Messages /></main></ProtectedRoute>} />
                <Route path="/network" element={<ProtectedRoute><main className="main-content"><Network /></main></ProtectedRoute>} />
                <Route path="/users/:id" element={<ProtectedRoute><main className="main-content"><UserProfile /></main></ProtectedRoute>} />

                <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} />} />
            </Routes>
        </div>
    );
}
