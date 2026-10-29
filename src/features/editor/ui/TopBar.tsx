import { useEffect, useState } from "react";
import { api } from "../../../app/api-client";
import { webNodes } from "../../../nodes/registry.web";
import type { MuseAccountsResponse } from "../../../shared/api";
import { WORKFLOW_TEMPLATES } from "../../../shared/templates";
import { estimateText } from "./estimate-view";
import { RUN_LABEL } from "./run-view";
import type { EstimateView } from "./use-estimate";
import type { RunPanelApi } from "./use-run";
import type { WorkflowApi } from "./use-workflow";

type Props = {
  wf: WorkflowApi;
  run: RunPanelApi;
  onAddNode: (type: string) => void;
  // Bấm Chạy cả workflow: Editor lo (mọi đường chạy đi qua một chỗ).
  onRun: () => void;
  // Đang kiểm ước tính hoặc hộp xác nhận đang mở: chưa cho chạy tiếp, chưa cho đổi workflow.
  checking: boolean;
  // Ước tính (cả workflow, bản đã lưu) cho ô "Lần chạy tới".
  estimate: EstimateView;
};

export function TopBar({ wf, run, onAddNode, onRun, checking, estimate }: Props) {
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
  const pill = estimate.estimate ? estimateText(estimate.estimate) : estimate.error ? "không ước tính được" : "đang tính…";

  return (
    <div className="toolbar">
      <h1>VideoPic Workflow</h1>
      <select data-testid="workflow-select" value={workflowId ?? ""} disabled={checking} onChange={(e) => void switchTo(() => api.getWorkflow(e.target.value))}>
        {wf.workflowList.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {WORKFLOW_TEMPLATES.map((t) => (
        <button key={t.id} type="button" data-testid={`template-${t.id}`} disabled={checking} onClick={() => void switchTo(() => api.createFromTemplate(t.id))}>
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
      <span className={`estimate-pill ${estimate.error ? "error" : ""}`} data-testid="estimate-pill" title={estimate.error ?? "Ước tính của bản đã lưu, cho lần Chạy cả workflow"}>
        Lần chạy tới: <b>{pill}</b>
      </span>
      <button
        type="button"
        className="primary"
        data-testid="run-button"
        disabled={!workflowId || run.active || run.starting || run.syncing || checking}
        onClick={onRun}
      >
        {busy ? "Đang chạy…" : checking ? "Đang tính lượt…" : "▶ Chạy"}
      </button>
    </div>
  );
}
