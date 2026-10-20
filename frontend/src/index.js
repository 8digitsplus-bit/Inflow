import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { initProdfix, captureProdfixError } from "@/lib/prodfix";

initProdfix();

const ErrorFallback = () => (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#050507", color: "#e4e4e7", fontFamily: "system-ui, sans-serif", padding: "24px", textAlign: "center" }}>
    <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Something went wrong</h1>
    <p style={{ color: "#a1a1aa", fontSize: "14px", marginBottom: "20px" }}>An unexpected error occurred and our team has been notified.</p>
    <button onClick={() => window.location.reload()} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "9999px", padding: "8px 20px", fontSize: "14px", cursor: "pointer" }}>Reload</button>
  </div>
);

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureProdfixError(error, { componentStack: info.componentStack, source: "react_error_boundary" });
  }

  render() {
    return this.state.error ? <ErrorFallback /> : this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
