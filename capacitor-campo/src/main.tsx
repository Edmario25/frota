import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import AppCampo from "@/pages/app/campo/AppCampo"

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppCampo crash:", error, info);
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{
          background: "#0f172a", color: "#f87171", fontFamily: "monospace",
          fontSize: 13, padding: 24, whiteSpace: "pre-wrap", minHeight: "100vh",
          overflowY: "auto",
        }}>
          {"REACT ERROR:\n" + err.message + "\n\n" + (err.stack || "")}
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppCampo />
    </ErrorBoundary>
  </StrictMode>
)
