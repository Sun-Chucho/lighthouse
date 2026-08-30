import { ArrowUpCircle, Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DesktopUpdateState } from "../types/desktop";

export function DesktopUpdateBanner() {
  const bridge = window.lighthouseDesktop;
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [dismissedStage, setDismissedStage] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onUpdateState((nextState) => {
      setState(nextState);
      setDismissedStage(null);
    });
  }, [bridge]);

  if (!bridge || !state || dismissedStage === state.stage) return null;
  if (["development", "current", "offline"].includes(state.stage)) return null;

  const downloaded = state.stage === "downloaded";
  const downloading = state.stage === "available" || state.stage === "downloading" || state.stage === "checking";

  return (
    <aside className={`desktop-update desktop-update--${state.stage}`} aria-live="polite">
      <span className="desktop-update__icon">
        {downloaded ? <ArrowUpCircle size={20} /> : downloading ? <Download size={20} /> : <RefreshCw size={20} />}
      </span>
      <p>
        <strong>{downloaded ? "Lighthouse update ready" : downloading ? "Updating Lighthouse" : "Update check will retry"}</strong>
        <small>{downloaded ? `Version ${state.detail} is downloaded.` : state.detail || "Checking the latest Windows version."}</small>
      </p>
      {downloaded ? (
        <button type="button" onClick={() => void bridge.installUpdate()}>Restart now</button>
      ) : null}
      <button className="desktop-update__close" type="button" aria-label="Dismiss update notice" onClick={() => setDismissedStage(state.stage)}><X size={16} /></button>
    </aside>
  );
}
