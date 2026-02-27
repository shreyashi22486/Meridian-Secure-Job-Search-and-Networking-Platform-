/**
 * Custom Confirm Dialog — replaces window.confirm()
 * 
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: 'Delete?', message: 'This cannot be undone', danger: true });
 *   if (ok) { // proceed }
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import Icon from './Icons';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const resolveRef = useRef(null);

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setDialog({
                title: options.title || 'Are you sure?',
                message: options.message || '',
                confirmText: options.confirmText || (options.danger ? 'Delete' : 'Confirm'),
                cancelText: options.cancelText || 'Cancel',
                danger: options.danger || false,
                icon: options.icon || (options.danger ? 'trash' : 'alertCircle'),
            });
        });
    }, []);

    const handleConfirm = () => {
        resolveRef.current?.(true);
        setDialog(null);
    };

    const handleCancel = () => {
        resolveRef.current?.(false);
        setDialog(null);
    };

    // Escape key closes
    useEffect(() => {
        if (!dialog) return;
        const onKey = (e) => { if (e.key === 'Escape') handleCancel(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [dialog]);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {dialog && (
                <div className="confirm-overlay" onClick={handleCancel}>
                    <div className="confirm-dialog glass-card" onClick={e => e.stopPropagation()}>
                        <div className={`confirm-icon-wrap ${dialog.danger ? 'confirm-icon-danger' : ''}`}>
                            <Icon name={dialog.icon} size={24} />
                        </div>
                        <h3 className="confirm-title">{dialog.title}</h3>
                        {dialog.message && <p className="confirm-message">{dialog.message}</p>}
                        <div className="confirm-actions">
                            <button className="btn btn-ghost" onClick={handleCancel}>
                                {dialog.cancelText}
                            </button>
                            <button
                                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                                onClick={handleConfirm}
                                autoFocus
                            >
                                {dialog.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be inside ConfirmProvider');
    return ctx;
}
