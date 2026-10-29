import { useEffect, useState } from "react";
import { api } from "../../../app/api-client";
import { webNodes } from "../../../nodes/registry.web";
import type { MuseAccountsResponse } from "../../../shared/api";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import { RUN_LABEL, type RunApi } from "./use-run";
import type { WorkflowApi } from "./use-workflow";

type Props = {
  wf: WorkflowApi;
  run: RunApi;
  onAddNode: (type: string) => void;
};

export function TopBar({ wf, run, onAddNode }: Props) {
  const [muse, setMuse] = useState<MuseAccountsResponse | null>(null);
  useEffect(() => {
    api
      .getMuseAccounts()
      .then(setMuse)
      .catch(() => setMuse(null));
  }, []);
  const readyMuse = muse?.accounts.filter((a) => a.loggedIn).length ?? 0;
  const { workflowId, saveState, switchTo } = wf;
  const busy = run.active || run.starting;

  return (
    <div className="toolbar">
      <h1>VideoPic Workflow</h1>
      <select data-testid="workflow-select" value={workflowId ?? ""} onChange={(e) => void switchTo(() => api.getWorkflow(e.target.value))}>
        {wf.workflowList.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {WORKFLOW_TEMPLATES.map((t) => (
        <button key={t.id} type="button" data-testid={`template-${t.id}`} onClick={() => void switchTo(() => api.createFromTemplate(t.id))}>
          + Mẫu {t.name}
        </button>
      ))}
      <select
        data-testid="add-node"
        value=""
        onChange={(e) => {
          if (e.target.value) onAddNode(e.target.value);
        }}
      >
        <option value="">+ Thêm node…</option>
        {Object.entries(webNodes)
          .filter(([, impl]) => !impl.definition.hidden)
          .map(([type, impl]) => (
            <option key={type} value={type}>
              {impl.definition.label}
            </option>
          ))}
      </select>
      <span className="muse-accounts" data-testid="muse-accounts" title={muse?.accounts.map((a) => `${a.id}: ${a.state}`).join("\n")}>
        Muse: {readyMuse}/{muse?.accounts.length ?? 0} tài khoản
      </span>
      <span className={`save-state ${saveState}`} data-testid="save-status">
        {saveState === "saving" ? "Đang lưu…" : saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Lưu lỗi" : ""}
      </span>
      <span className={`run-state ${run.starting ? "queued" : (run.run?.status ?? "")}`} data-testid="run-status">
        {run.starting ? RUN_LABEL.queued : run.runLabel}
      </span>
      <button
        type="button"
        className="primary"
        data-testid="run-button"
        disabled={!workflowId || run.active || run.starting || run.syncing}
        onClick={() => void run.startRun()}
      >
        {busy ? "Đang chạy…" : "▶ Chạy"}
      </button>
      {run.active ? (
        <button type="button" data-testid="cancel-run" disabled={run.cancelling} onClick={() => void run.cancel()}>
          {run.cancelling ? "Đang huỷ…" : "Huỷ"}
        </button>
      ) : null}
    </div>
  );
}
