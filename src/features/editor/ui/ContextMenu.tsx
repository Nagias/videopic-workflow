import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export type MenuItem = {
  testid: string;
  icon: string;
  label: string;
  // Phím tắt của lệnh, hiện mờ bên phải.
  hint?: string;
  disabled?: boolean;
  run: () => void;
};

type Props = {
  // Toạ độ MÀN HÌNH của chỗ bấm chuột phải.
  x: number;
  y: number;
  items: readonly MenuItem[];
  onClose: () => void;
};

const EDGE_GAP = 8;

// Menu chuột phải. Nằm trọn trong cửa sổ (sát mép thì lùi vào), đóng khi bấm ra ngoài, đổi cỡ cửa sổ, hoặc chọn xong một lệnh.
// Esc và cuộn/thu phóng canvas do Editor đóng (Editor biết phím tắt và biết canvas đang cuộn).
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(EDGE_GAP, Math.min(x, window.innerWidth - width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(y, window.innerHeight - height - EDGE_GAP)),
    });
  }, [x, y, items]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // ↑↓ đi giữa các lệnh còn dùng được.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.findIndex((b) => b === document.activeElement);
    const next = e.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className="ctx-menu"
      data-testid="context-menu"
      role="menu"
      style={pos}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.testid}
          type="button"
          role="menuitem"
          className="ctx-item"
          data-testid={item.testid}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          <i>{item.icon}</i>
          <span>{item.label}</span>
          {item.hint ? <kbd>{item.hint}</kbd> : null}
        </button>
      ))}
    </div>
  );
}
