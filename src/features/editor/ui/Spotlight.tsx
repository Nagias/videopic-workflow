import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../../../app/api-client";
import type { AssetSummary } from "../../../shared/api";
import { ASSET_KINDS } from "../../../shared/node-definition";
import { PORT_KIND_LABEL } from "../../../shared/ports";
import {
  catalogItems,
  filterByPort,
  portFor,
  recentFrom,
  recentItems,
  rememberRecent,
  searchItems,
  visibleCategories,
  type CatalogItem,
  type CategoryId,
  type PortFilter,
} from "./catalog";

export type ScreenPoint = { x: number; y: number };

// Khoá localStorage của danh sách "Gần đây" (tối đa RECENT_MAX khoá mục, mới nhất đứng đầu).
export const RECENT_STORAGE_KEY = "videopic.spotlight.recent";

type Props = {
  // Toạ độ MÀN HÌNH nơi mở ô (chỗ thả dây, chỗ bấm chuột phải). Không có thì ô nằm giữa phía trên.
  at?: ScreenPoint;
  // Đang kéo dây từ một cổng: chỉ liệt kê node có cổng hợp loại.
  filter?: PortFilter;
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
};

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 470;
const ALL = "tat-ca";
type TabId = CategoryId | typeof ALL;

function readRecent(): string[] {
  try {
    return recentFrom(JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "null"));
  } catch (e) {
    console.error("Không đọc được danh sách node gần đây của ô tìm:", e);
    return [];
  }
}

function writeRecent(keys: string[]): void {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    console.error("Không lưu được danh sách node gần đây của ô tìm:", e);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

// Ô tìm node kiểu Spotlight: gõ để lọc, ↑↓ để chọn, Enter để thêm, Esc để đóng.
export function Spotlight({ at, filter, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [recentKeys, setRecentKeys] = useState<string[]>(readRecent);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetProblem, setAssetProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<TabId | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Kho tài sản (nhân vật, bối cảnh, đồ vật đã tạo). Tải lỗi thì ô tìm vẫn dùng được, chỉ nhóm Nguồn & kho báo lỗi.
  useEffect(() => {
    let alive = true;
    void Promise.allSettled(ASSET_KINDS.map((kind) => api.listAssets(kind))).then((results) => {
      if (!alive) return;
      const failed = results.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
      for (const reason of failed) console.error("Không tải được kho tài sản cho ô tìm node:", reason);
      setAssets(results.flatMap((r) => (r.status === "fulfilled" ? r.value.assets : [])));
      const first = failed[0];
      setAssetProblem(failed.length === 0 ? null : first instanceof Error ? first.message : String(first));
    });
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => {
    const all = catalogItems(assets);
    return filter ? filterByPort(all, filter) : all;
  }, [assets, filter]);
  const recent = useMemo(() => recentItems(items, recentKeys), [items, recentKeys]);
  const tabs = useMemo((): { id: TabId; label: string }[] => {
    // Kho tải lỗi thì vẫn có nhóm Nguồn & kho để hiện lời báo.
    const cats = visibleCategories(items, recent.length, assetProblem ? ["nguon-kho"] : []).map((c) => ({ id: c.id, label: c.label }));
    return filter ? [{ id: ALL, label: "Tất cả" }, ...cats] : cats;
  }, [items, recent.length, assetProblem, filter]);

  const tab: TabId = picked && tabs.some((t) => t.id === picked) ? picked : (tabs[0]?.id ?? ALL);
  const searching = query.trim() !== "";
  const list = useMemo(() => {
    if (searching) return searchItems(items, query);
    if (tab === ALL) return items;
    if (tab === "gan-day") return recent;
    return items.filter((i) => i.category === tab);
  }, [searching, items, query, tab, recent]);
  const current = Math.min(active, Math.max(0, list.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(".sp-item.hl")?.scrollIntoView({ block: "nearest" });
  }, [current, list]);

  const choose = (item: CatalogItem) => {
    const next = rememberRecent(recentKeys, item.key);
    setRecentKeys(next);
    writeRecent(next);
    onPick(item);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      setActive((current + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const item = list[current];
      if (item) choose(item);
    }
  };

  const left = at ? clamp(at.x - PANEL_WIDTH / 2, 10, window.innerWidth - PANEL_WIDTH - 10) : undefined;
  const top = at ? clamp(at.y - 40, 60, window.innerHeight - PANEL_HEIGHT - 10) : undefined;

  return (
    <div
      className="spotlight-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`spotlight ${at ? "at" : ""}`}
        data-testid="spotlight"
        role="dialog"
        aria-label="Thêm node"
        style={at ? { left, top } : undefined}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          data-testid="spotlight-input"
          placeholder="Tìm node, mẫu, nhân vật trong kho…"
          aria-label="Tìm node"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        {filter ? (
          <div className="sp-filter" data-testid="spotlight-filter">
            Chỉ hiện node {filter.dir === "out" ? "nhận" : "tạo ra"} <b className={`kind-${filter.kind}`}>{PORT_KIND_LABEL[filter.kind]}</b> — chọn một node, nó sẽ được đặt ở chỗ bạn thả dây và nối sẵn.
          </div>
        ) : null}
        <div className="sp-body">
          <div className="sp-cats">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`spotlight-cat-${t.id}`}
                className={!searching && t.id === tab ? "on" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPicked(t.id);
                  setQuery("");
                  setActive(0);
                  inputRef.current?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="sp-list" ref={listRef} role="listbox">
            {!searching && tab === "nguon-kho" && assetProblem ? (
              <div className="sp-note" data-testid="spotlight-kho-problem">
                Không tải được kho tài sản ({assetProblem}). Các node khác vẫn thêm được bình thường.
              </div>
            ) : null}
            {list.map((item, i) => {
              const port = filter ? portFor(item, filter) : undefined;
              return (
                <div
                  key={item.key}
                  role="option"
                  aria-selected={i === current}
                  data-testid={`spotlight-item-${item.key}`}
                  className={`sp-item ${i === current ? "hl" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <div className="sp-ic">{item.icon}</div>
                  <div className="sp-text">
                    <b>
                      {item.label}
                      {port && filter ? (
                        <span className={`sp-port kind-${port.kind}`}>
                          {filter.dir === "out" ? "vào cổng" : "từ cổng"} «{port.label}»
                        </span>
                      ) : null}
                    </b>
                    <small>{item.description}</small>
                  </div>
                </div>
              );
            })}
            {list.length === 0 && !(tab === "nguon-kho" && assetProblem && !searching) ? <div className="sp-note">Không có node nào khớp.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
