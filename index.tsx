import React, { ReactNode, Component } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Error Boundary to catch white screen crashes during runtime
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public declare props: Readonly<ErrorBoundaryProps>;
  public state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    if (window.confirm("¿Estás seguro? Esto borrará los datos locales del navegador para corregir el error. Si tienes respaldo en Supabase, podrás bajarlos después.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', color: '#111' }}>
          <h1 style={{ color: '#DC2626', fontSize: '24px', marginBottom: '10px' }}>¡Algo salió mal!</h1>
          <p style={{ color: '#7F1D1D', marginBottom: '20px' }}>El sistema ha encontrado un error crítico.</p>

          <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #FECACA', marginBottom: '20px', maxWidth: '600px', textAlign: 'left', overflow: 'auto', maxHeight: '200px', width: '100%' }}>
            <code style={{ color: '#B91C1C', fontSize: '12px', display: 'block' }}>{this.state.error?.message || this.state.error?.toString()}</code>
          </div>

          <button
            onClick={this.handleReset}
            style={{
              padding: '15px 30px',
              background: '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            REINICIAR SISTEMA (Borrar Datos Locales)
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

try {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (e) {
  console.error("Fatal rendering error:", e);
  rootElement.innerHTML = '<div style="padding: 20px; color: red;">Error fatal al iniciar la aplicación. Por favor recarga la página.</div>';
}