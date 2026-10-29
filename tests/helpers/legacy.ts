import { SON_LA_CHARACTER, SON_LA_LOCATION, SON_LA_PROPS, SON_LA_SHOTS } from "../../src/shared/templates";
import type { ProviderId } from "../../src/shared/providers";
import type { WorkflowGraph } from "../../src/shared/workflow";

// Workflow kiểu cũ (trước khi có node Cảnh/Ghép phim), đúng dạng hai mẫu cũ: dùng để thử chuyển workflow cũ.

export function legacySonLaGraph(provider: ProviderId = "fake", fixBrightness = true): WorkflowGraph {
  return {
    nodes: [
      { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { name: "Cô gái Sơn La", description: SON_LA_CHARACTER, provider } },
      { id: "location-1", type: "location", position: { x: 40, y: 640 }, params: { name: "Sườn đồi suối đá Sơn La", description: SON_LA_LOCATION, provider } },
      { id: "props-1", type: "props", position: { x: 40, y: 1140 }, params: { name: "Đồ cắm trại Sơn La", items: SON_LA_PROPS, provider } },
      { id: "shotlist-1", type: "shotlist", position: { x: 480, y: 40 }, params: { shots: SON_LA_SHOTS } },
      { id: "film-1", type: "film", position: { x: 1120, y: 40 }, params: { provider, fixBrightness } },
    ],
    edges: [
      { id: "e-char-film", source: "character-1", sourceHandle: "character", target: "film-1", targetHandle: "character" },
      { id: "e-loc-film", source: "location-1", sourceHandle: "location", target: "film-1", targetHandle: "location" },
      { id: "e-props-film", source: "props-1", sourceHandle: "props", target: "film-1", targetHandle: "props" },
      { id: "e-shots-film", source: "shotlist-1", sourceHandle: "shots", target: "film-1", targetHandle: "shots" },
    ],
  };
}

export function legacyIdeaGraph(provider: ProviderId = "fake", shotCount = 8): WorkflowGraph {
  return {
    nodes: [
      { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { name: "Cô gái", description: "một cô gái Việt Nam 22 tuổi, tóc buộc đuôi ngựa, áo thể thao xám", provider } },
      { id: "location-1", type: "location", position: { x: 40, y: 640 }, params: { name: "Thác nước", description: "rừng nguyên sinh có thác nước nhỏ đổ xuống vũng nước trong", provider } },
      { id: "writer-1", type: "writer", position: { x: 480, y: 40 }, params: { idea: "Cô gái vào rừng nguyên sinh, tìm thấy thác nước nhỏ rồi nhóm bếp đá đun nước.", shotCount, provider } },
      { id: "props-1", type: "props", position: { x: 480, y: 760 }, params: { name: "", items: [], provider } },
      { id: "film-1", type: "film", position: { x: 1120, y: 40 }, params: { provider, fixBrightness: true } },
    ],
    edges: [
      { id: "e-char-writer", source: "character-1", sourceHandle: "character", target: "writer-1", targetHandle: "character" },
      { id: "e-loc-writer", source: "location-1", sourceHandle: "location", target: "writer-1", targetHandle: "location" },
      { id: "e-writer-props", source: "writer-1", sourceHandle: "props", target: "props-1", targetHandle: "spec" },
      { id: "e-char-film", source: "character-1", sourceHandle: "character", target: "film-1", targetHandle: "character" },
      { id: "e-loc-film", source: "location-1", sourceHandle: "location", target: "film-1", targetHandle: "location" },
      { id: "e-props-film", source: "props-1", sourceHandle: "props", target: "film-1", targetHandle: "props" },
      { id: "e-shots-film", source: "writer-1", sourceHandle: "shots", target: "film-1", targetHandle: "shots" },
    ],
  };
}
