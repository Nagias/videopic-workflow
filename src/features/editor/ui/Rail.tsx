// Thanh công cụ dọc bên trái canvas. Các nút còn lại (Kho, Mẫu, Nhóm, Phím tắt) được thêm ở các bước sau.
export function Rail({ onAdd }: { onAdd: () => void }) {
  return (
    <nav className="rail" aria-label="Công cụ">
      <button type="button" className="plus" data-testid="rail-add" title="Thêm node (phím / hoặc Space)" aria-label="Thêm node" onClick={onAdd}>
        +
      </button>
    </nav>
  );
}
