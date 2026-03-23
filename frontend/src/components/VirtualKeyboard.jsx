import { useState, useEffect, useCallback } from 'react';
import './VirtualKeyboard.css';

/**
 * VirtualKeyboard — Randomized on-screen numeric keypad for OTP entry.
 *
 * Security features:
 * - Key positions are randomized on every render (anti-keylogger)
 * - Prevents screen-recording position inference attacks
 * - No physical keyboard input captured
 *
 * Props:
 * - length: number of digits (default 6)
 * - onComplete: callback(otpString) when all digits entered
 * - onClose: callback to close the keyboard dialog
 */
export default function VirtualKeyboard({ length = 6, onComplete, onClose }) {
    const [digits, setDigits] = useState([]);
    const [shuffledKeys, setShuffledKeys] = useState([]);

    // Shuffle digits 0-9 on mount and whenever digits change
    const shuffleKeys = useCallback(() => {
        const keys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        setShuffledKeys(keys);
    }, []);

    useEffect(() => {
        shuffleKeys();
    }, [shuffleKeys]);

    const handleKeyPress = (num) => {
        if (digits.length >= length) return;

        const newDigits = [...digits, num];
        setDigits(newDigits);

        // Reshuffle after every keypress for maximum security
        shuffleKeys();

        if (newDigits.length === length) {
            const otp = newDigits.join('');
            // Small delay for visual feedback before submitting
            setTimeout(() => onComplete(otp), 200);
        }
    };

    const handleBackspace = () => {
        setDigits(prev => prev.slice(0, -1));
        shuffleKeys();
    };

    const handleClear = () => {
        setDigits([]);
        shuffleKeys();
    };

    return (
        <div className="vk-overlay" onClick={onClose}>
            <div className="vk-container glass-card" onClick={e => e.stopPropagation()}>
                <div className="vk-header">
                    <h3>Enter OTP Code</h3>
                    <p>Use the virtual keyboard below for secure input</p>
                    <button className="vk-close" onClick={onClose}>&times;</button>
                </div>

                {/* OTP Display */}
                <div className="vk-display">
                    {Array.from({ length }, (_, i) => (
                        <div
                            key={i}
                            className={`vk-dot ${i < digits.length ? 'filled' : ''} ${
                                i === digits.length ? 'active' : ''
                            }`}
                        >
                            {i < digits.length ? '●' : '○'}
                        </div>
                    ))}
                </div>

                {/* Randomized Keypad */}
                <div className="vk-keypad">
                    {shuffledKeys.map((num) => (
                        <button
                            key={`key-${num}`}
                            className="vk-key"
                            onClick={() => handleKeyPress(num)}
                            disabled={digits.length >= length}
                            type="button"
                        >
                            {num}
                        </button>
                    ))}
                    {/* Action buttons */}
                    <button
                        className="vk-key vk-key-action"
                        onClick={handleClear}
                        type="button"
                    >
                        Clear
                    </button>
                    <button
                        className="vk-key vk-key-action"
                        onClick={handleBackspace}
                        type="button"
                    >
                        ⌫
                    </button>
                </div>

                <div className="vk-footer">
                    <span className="vk-security-badge">
                        🔒 Randomized layout — keylogger resistant
                    </span>
                </div>
            </div>
        </div>
    );
}
