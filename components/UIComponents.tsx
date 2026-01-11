
import React, { useState, useEffect, useRef } from 'react';

// --- Hooks ---
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const useNotifications = () => {
  const requestPermission = async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  };

  const sendNotification = (title: string, body: string, tag?: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041888.png',
        tag,
        silent: false
      });
    }
  };

  return { requestPermission, sendNotification };
};

// --- UI Components ---

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', icon, children, className = '', ...props }) => {
  const base = "rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-3 text-sm",
    lg: "px-6 py-4 text-base",
  };

  const variants = {
    primary: "bg-primary hover:bg-indigo-700 text-white shadow-md",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-300",
    success: "bg-green-600 hover:bg-green-700 text-white shadow-md",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-md",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-900",
    outline: "bg-transparent border-2 border-primary text-primary hover:bg-primary hover:text-white",
    accent: "bg-purple-600 hover:bg-purple-700 text-white shadow-md"
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {icon && <i className={`fas fa-${icon} ${children ? '' : 'text-lg'}`}></i>}
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: string;
  uppercase?: boolean;
}

// INPUT DE ALTO CONTRASTE (CAJA GRIS, TEXTO NEGRO) - CON MAYÚSCULAS AUTOMÁTICAS
export const Input: React.FC<InputProps> = ({ label, error, icon, className = '', style, uppercase = true, onChange, type, ...props }) => {
  // Convertir a mayúsculas automáticamente para campos de texto
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uppercase && type !== 'email' && type !== 'password' && type !== 'number' && type !== 'date' && type !== 'tel') {
      e.target.value = e.target.value.toUpperCase();
    }
    onChange?.(e);
  };

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-bold text-gray-900 mb-1 ml-1">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-600">
            <i className={`fas fa-${icon}`}></i>
          </div>
        )}
        <input
          type={type}
          className={`w-full ${icon ? 'pl-10' : 'px-4'} py-3 rounded-xl outline-none transition-colors font-bold shadow-sm ${uppercase && type !== 'email' && type !== 'password' && type !== 'number' && type !== 'date' ? 'uppercase' : ''} ${className}`}
          style={{
            backgroundColor: error ? '#FEF2F2' : '#E5E7EB',
            color: error ? '#991B1B' : '#000000',
            border: error ? '2px solid #EF4444' : '1px solid #9CA3AF',
            ...style
          }}
          onFocus={(e) => e.target.select()}
          onChange={handleChange}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1 ml-1 font-bold"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
    </div>
  );
};

interface CardProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '', actions, noPadding = false }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col ${className}`}>
    {(title || actions) && (
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-2xl">
        {title && <h3 className="text-lg font-bold text-gray-900">{title}</h3>}
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-6'}>{children}</div>
  </div>
);

export const Badge: React.FC<{ variant?: 'success' | 'warning' | 'danger' | 'info' | 'default', children: React.ReactNode, className?: string }> = ({ variant = 'default', children, className = '' }) => {
  const variants = {
    success: 'bg-green-100 text-green-800 border border-green-200',
    warning: 'bg-yellow-100 text-yellow-900 border border-yellow-200',
    danger: 'bg-red-100 text-red-800 border border-red-200',
    info: 'bg-blue-100 text-blue-800 border border-blue-200',
    default: 'bg-gray-100 text-gray-900 border border-gray-200'
  };
  return <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${variants[variant]} ${className}`}>{children}</span>;
};

export const Alert: React.FC<{ variant?: 'success' | 'warning' | 'danger' | 'info'; children: React.ReactNode; className?: string; onClose?: () => void }> = ({ variant = 'info', children, className = '', onClose }) => {
  const variants = {
    success: 'bg-green-50 text-green-900 border-green-200',
    warning: 'bg-yellow-50 text-yellow-900 border-yellow-200',
    danger: 'bg-red-50 text-red-900 border-red-200',
    info: 'bg-blue-50 text-blue-900 border-blue-200'
  };
  return (
    <div className={`p-4 rounded-xl border flex items-start gap-3 ${variants[variant]} ${className}`}>
      <div className="flex-1 text-sm font-bold">{children}</div>
      {onClose && <button onClick={onClose}><i className="fas fa-times"></i></button>}
    </div>
  );
};

// MODAL WITH HIGHER Z-INDEX (z-[70]) to stay above POS Cart (z-[60])
export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} relative z-10 max-h-[95vh] flex flex-col animate-pop-in`}>
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <h3 className="text-xl font-extrabold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 flex items-center justify-center">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6 overflow-y-auto text-gray-900">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- PROFESSIONAL CONFIRM DIALOG ---
interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, onConfirm, onCancel, title = 'Confirmar', message,
  confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'danger'
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: { icon: 'trash-alt', color: 'text-red-500', bg: 'bg-red-100', btn: 'bg-red-600 hover:bg-red-700' },
    warning: { icon: 'exclamation-triangle', color: 'text-yellow-500', bg: 'bg-yellow-100', btn: 'bg-yellow-600 hover:bg-yellow-700' },
    info: { icon: 'info-circle', color: 'text-blue-500', bg: 'bg-blue-100', btn: 'bg-blue-600 hover:bg-blue-700' }
  };

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onCancel}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 animate-pop-in overflow-hidden">
        <div className="p-6 text-center">
          <div className={`w-16 h-16 ${style.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <i className={`fas fa-${style.icon} text-3xl ${style.color}`}></i>
          </div>
          <h3 className="text-xl font-extrabold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 mb-6">{message}</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-3 rounded-xl font-bold text-white ${style.btn} transition-all`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center items-center gap-2 mt-4">
      <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50">
        <i className="fas fa-chevron-left"></i>
      </button>
      <span className="text-sm font-bold text-gray-900">Página {currentPage} de {totalPages}</span>
      <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50">
        <i className="fas fa-chevron-right"></i>
      </button>
    </div>
  );
};

export const StatCard: React.FC<{ title: string; value: string | number; icon: string; color: string; trend?: string; className?: string; style?: React.CSSProperties }> = ({ title, value, icon, color, trend, className = '', style }) => (
  <div className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-200 ${className}`} style={style}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-bold text-gray-500 uppercase mb-1">{title}</p>
        <h3 className="text-2xl font-extrabold text-gray-900">{value}</h3>
        {trend && <p className="text-xs font-bold text-green-600 mt-1"><i className="fas fa-arrow-up"></i> {trend}</p>}
      </div>
      <div className={`w-12 h-12 rounded-xl ${color} text-white flex items-center justify-center shadow-md`}>
        <i className={`fas fa-${icon} text-xl`}></i>
      </div>
    </div>
  </div>
);

export const WhatsAppButton: React.FC<{ phoneNumber?: string }> = ({ phoneNumber }) => {
  const [position, setPosition] = useState({ bottom: 20, right: 20 });

  // Clean number
  const targetNumber = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : '50499999999';

  return (
    <a
      href={`https://wa.me/${targetNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed z-50 bg-[#25D366] hover:bg-green-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
      style={{ bottom: `${position.bottom}px`, right: `${position.right}px` }}
    >
      <i className="fab fa-whatsapp text-3xl"></i>
    </a>
  );
};

// --- TOAST NOTIFICATION SYSTEM ---
interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

// Global toast state
let toastListeners: ((toasts: ToastMessage[]) => void)[] = [];
let toasts: ToastMessage[] = [];

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...toasts]));
};

export const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 4000) => {
  const id = Date.now().toString();
  toasts = [...toasts, { id, message, type, duration }];
  notifyListeners();

  if (duration > 0) {
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, duration);
  }
};

export const ToastContainer: React.FC = () => {
  const [currentToasts, setCurrentToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastListeners.push(setCurrentToasts);
    return () => {
      toastListeners = toastListeners.filter(l => l !== setCurrentToasts);
    };
  }, []);

  const removeToast = (id: string) => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  };

  const icons = {
    success: 'check-circle',
    error: 'times-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200'
  };

  const textColors = {
    success: 'text-green-800',
    error: 'text-red-800',
    warning: 'text-yellow-800',
    info: 'text-blue-800'
  };

  if (currentToasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {currentToasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border animate-slide-in ${bgColors[toast.type]}`}
          onClick={() => removeToast(toast.id)}
        >
          <div className={`w-8 h-8 rounded-full ${colors[toast.type]} text-white flex items-center justify-center flex-shrink-0`}>
            <i className={`fas fa-${icons[toast.type]}`}></i>
          </div>
          <p className={`text-sm font-bold ${textColors[toast.type]} flex-1`}>{toast.message}</p>
          <button className="text-gray-400 hover:text-gray-600">
            <i className="fas fa-times"></i>
          </button>
        </div>
      ))}
    </div>
  );
};
