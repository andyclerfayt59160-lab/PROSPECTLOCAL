import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type ToastItem = {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
};

type ToastContextType = {
  showToast: (message: string, tone?: ToastItem['tone']) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TONE_MAP = {
  info: { bg: '#DBEAFE', text: '#1D4ED8' },
  success: { bg: '#DCFCE7', text: '#15803D' },
  warning: { bg: '#FEF3C7', text: '#B45309' },
  error: { bg: '#FEE2E2', text: '#B91C1C' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={styles.container}>
        {toasts.map((toast) => {
          const tone = TONE_MAP[toast.tone || 'info'];
          return (
            <View key={toast.id} style={[styles.toast, { backgroundColor: tone.bg }]}>
              <Text style={[styles.toastText, { color: tone.text }]}>{toast.message}</Text>
            </View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    right: 20,
    left: 20,
    alignItems: 'center',
    gap: 10,
    zIndex: 9999,
  },
  toast: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
