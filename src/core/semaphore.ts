// Giới hạn số việc chạy cùng lúc (theo số tài khoản Muse đang rảnh).
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
      active++;
    },
    release() {
      active--;
      waiting.shift()?.();
    },
  };
}
