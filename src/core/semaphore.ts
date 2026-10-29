// Giới hạn số việc chạy cùng lúc (theo số tài khoản Muse đang rảnh).
// Nhả chỗ thì trao thẳng cho việc đang chờ, để việc mới gọi vào đúng lúc đó không chen thêm quá giới hạn.
export function semaphore(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async acquire() {
      if (active < max) {
        active++;
        return;
      }
      await new Promise<void>((r) => waiting.push(r));
    },
    release() {
      const next = waiting.shift();
      if (next) next();
      else active--;
    },
  };
}
