// Câu trả lời chữ giả (không tốn lượt): dùng cho test và chạy thử giao diện.
export function fakeTextReply(prompt: string): string {
  return `Trả lời giả cho: ${prompt.trim().slice(0, 60)}`;
}
