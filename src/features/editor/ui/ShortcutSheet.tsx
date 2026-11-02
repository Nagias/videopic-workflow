import { SHORTCUTS } from "./shortcuts";

// Bảng phím tắt (phím ?). Dựng từ đúng bảng SHORTCUTS mà actionFor dùng để nhận phím, nên không thể ghi phím nào không có thật.
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="sheet-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" data-testid="shortcut-sheet" role="dialog" aria-label="Phím tắt">
        <div className="sheet-head">
          <b>Phím tắt</b>
          <button type="button" aria-label="Đóng bảng phím tắt" onClick={onClose}>
            ✕
          </button>
        </div>
        <table>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.action}>
                <td className="sheet-keys">
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 ? " hoặc " : null}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sheet-note">Phím tắt không chạy khi bạn đang gõ trong một ô nhập.</p>
      </div>
    </div>
  );
}
