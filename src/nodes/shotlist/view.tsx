import { CAMERA_ANGLES, CAMERA_MOVES, checkShotList, SHOT_SIZES, type Shot } from "../../shared/director";
import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import type { ShotListParams } from "./definition";

const options = (o: Record<string, { label: string }>) =>
  Object.entries(o).map(([k, v]) => (
    <option key={k} value={k}>
      {v.label}
    </option>
  ));

export function ShotListView({ id, params, setParams }: NodeViewProps<ShotListParams>) {
  const shots = params.shots ?? [];
  const check = checkShotList(shots);
  const update = (i: number, patch: Partial<Shot>) => setParams({ shots: shots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const remove = (i: number) => setParams({ shots: shots.filter((_, j) => j !== i) });
  const add = () =>
    setParams({
      shots: [...shots, { id: `c${Date.now().toString(36)}`, size: "MS", angle: "eye", move: "static", subject: "character", link: "cut", action: "" }],
    });

  return (
    <div className="shotlist nowheel" data-testid={`shotlist-${id}`}>
      {shots.map((s, i) => (
        <div className="shot-row" key={s.id} data-testid={`shot-row-${id}-${i + 1}`}>
          <div className="shot-head">
            <strong>{i + 1}</strong>
            <select className="nodrag" value={s.size} onChange={(e) => update(i, { size: e.target.value as Shot["size"] })}>
              {options(SHOT_SIZES)}
            </select>
            <select className="nodrag" value={s.angle} onChange={(e) => update(i, { angle: e.target.value as Shot["angle"] })}>
              {options(CAMERA_ANGLES)}
            </select>
            <select className="nodrag" value={s.move} onChange={(e) => update(i, { move: e.target.value as Shot["move"] })}>
              {options(CAMERA_MOVES)}
            </select>
            <select className="nodrag" value={s.subject} onChange={(e) => update(i, { subject: e.target.value as Shot["subject"] })}>
              <option value="character">Có nhân vật</option>
              <option value="none">Cảnh phụ (B-roll)</option>
            </select>
            <select className="nodrag" value={s.link} onChange={(e) => update(i, { link: e.target.value as Shot["link"] })} title="Nối: lấy khung cuối cảnh trước làm khung đầu">
              <option value="cut">Cắt cảnh</option>
              <option value="chain">Nối tiếp</option>
            </select>
            <button type="button" className="icon nodrag" title="Xoá cảnh" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
          <textarea className="nodrag" rows={2} value={s.action} placeholder="Hành động trong cảnh" onChange={(e) => update(i, { action: e.target.value })} />
        </div>
      ))}
      <button type="button" className="nodrag" data-testid={`add-shot-${id}`} onClick={add}>
        + Thêm cảnh
      </button>
      {check.errors.map((e) => (
        <div className="node-error inline" key={e}>
          {e}
        </div>
      ))}
      {check.warnings.map((w) => (
        <div className="node-warn" key={w}>
          {w}
        </div>
      ))}
    </div>
  );
}
