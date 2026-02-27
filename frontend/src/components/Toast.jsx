/**
 * Toast Notification System
 * 
 * Usage:
 *   const toast = useToast();
 *   toast.success('Profile saved!');
 *   toast.error('Upload failed');
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Icon from './Icons';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'success', duration = 3500) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type, duration }]);
        setTimeout(() => removeToast(id), duration);
        return id;
    }, [removeToast]);

    const toast = {
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error', 5000),
        info: (msg) => addToast(msg, 'info'),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onDismiss }) {
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        timerRef.current = setTimeout(() => setExiting(true), toast.duration - 300);
        return () => clearTimeout(timerRef.current);
    }, [toast.duration]);

    const iconName = toast.type === 'success' ? 'checkCircle' : toast.type === 'error' ? 'alertCircle' : 'info';

    return (
        <div
            className={`toast toast-${toast.type} ${exiting ? 'toast-exit' : 'toast-enter'}`}
            onClick={onDismiss}
            role="alert"
        >
            <Icon name={iconName} size={18} className="toast-icon" />
            <span className="toast-msg">{toast.message}</span>
            <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
                <Icon name="x" size={14} />
            </button>
            <div className="toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />
        </div>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be inside ToastProvider');
    return ctx;
}
