import { Component, type ReactNode } from "react";

// Một node vẽ lỗi (vd dữ liệu lưu dạng lạ) chỉ hỏng ô của nó, không làm sập cả canvas.
export class NodeErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  override render() {
    if (this.state.error) return <div className="node-error inline">Không hiển thị được node này: {this.state.error}</div>;
    return this.props.children;
  }
}
