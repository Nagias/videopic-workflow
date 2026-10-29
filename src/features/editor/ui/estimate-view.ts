import type { EstimateNode, EstimateResponse, RunScope } from "../../../shared/api";

// Hiển thị kết quả ước tính lượt (EstimateResponse) và quyết định có phải hỏi trước khi chạy. Toàn hàm thuần.

type Calls = EstimateResponse["total"];

const isZero = (c: Calls) => c.image === 0 && c.video === 0 && c.text === 0;

// "2 ảnh + 1 video + 1 chữ", bỏ phần bằng 0; bằng 0 hết thì "0 lượt".
export function callsText(c: Calls): string {
  const parts = [c.image > 0 ? `${c.image} ảnh` : "", c.video > 0 ? `${c.video} video` : "", c.text > 0 ? `${c.text} chữ` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" + ") : "0 lượt";
}

const unknownCount = (e: EstimateResponse) => e.nodes.filter((n) => n.status === "unknown").length;

// Chữ trên ô "Lần chạy tới" và đầu hộp xác nhận: số lượt MUSE (không tính dịch vụ giả), kèm số node chưa biết.
export function estimateText(e: EstimateResponse): string {
  const unknown = unknownCount(e);
  let text: string;
  if (!isZero(e.museTotal)) {
    text = `${callsText(e.museTotal)} Muse`;
  } else if (e.nodes.every((n) => n.status === "cached")) {
    text = "0 lượt Muse (dùng lại hết)";
  } else {
    // 0 lượt Muse nhưng vẫn có node sẽ chạy: "dùng lại hết" sẽ là nói sai. Node chạy bằng dịch vụ giả được đếm riêng.
    const fake = e.nodes.filter((n) => n.status === "run" && n.provider === "fake").length;
    text = fake > 0 ? `0 lượt Muse (dịch vụ giả: ${fake} node)` : "0 lượt Muse";
  }
  if (unknown > 0) text += ` + chưa biết (${unknown} node)`;
  if (e.waitsOnWriter) text += " — số cảnh chưa biết đến khi Biên kịch viết xong";
  return text;
}

// Phải hiện hộp xác nhận không? Chạy cả workflow luôn hỏi. Chạy một node / từ đây trở đi chỉ hỏi khi có lượt Muse hoặc có node
// chưa biết (ước tính không bao giờ coi "chưa biết" là 0 lượt, nên cũng không im lặng chạy).
export function needsConfirm(scope: RunScope, e: EstimateResponse): boolean {
  return scope.mode === "all" || !isZero(e.museTotal) || unknownCount(e) > 0;
}

// Một dòng của bảng trong hộp xác nhận.
export function rowText(n: EstimateNode): string {
  if (n.status === "cached") return "dùng lại";
  if (n.status === "unknown") return isZero(n.calls) ? "chưa biết" : `chưa biết (ước theo tham số: ${callsText(n.calls)})`;
  if (n.provider === null) return "chạy, không gọi dịch vụ";
  if (isZero(n.calls)) return "chạy, không tốn lượt";
  return n.provider === "muse" ? `sẽ gọi Muse: ${callsText(n.calls)}` : `chạy bằng dịch vụ giả: ${callsText(n.calls)} (không tốn lượt Muse)`;
}

// Ước tính "không thấp hơn thực tế" chỉ đúng khi mọi node đều ước được: còn node chưa biết, hoặc Biên kịch sắp viết lại số cảnh, thì không hứa.
export function isFirmEstimate(e: EstimateResponse): boolean {
  return !e.waitsOnWriter && unknownCount(e) === 0;
}
