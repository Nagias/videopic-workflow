import type { Shot } from "./director";
import { DEFAULT_LOOK } from "./prompts";
import type { WorkflowGraph } from "./workflow";

// Mẫu viết lại 28/10/2026 theo cảnh v2: khung đầu là ảnh đứng yên, chuyển động chỉ là việc xảy ra sau đó,
// đồ vật có ảnh mẫu và trạng thái (bổ củi: rìu bổ → gỗ tách; cận cảnh luôn thấy tay người tác động).

const CHARACTER =
  "một phụ nữ Việt Nam trưởng thành khoảng 22 tuổi, gương mặt bình thường kiểu người Việt phổ thông (không phải người mẫu), mặt mộc, da rám nắng nhẹ có chút mồ hôi và bụi, tóc đen buộc đuôi ngựa thấp hơi rối, dáng thon khoẻ; mặc áo bra thể thao trơn màu xám than (đồ tập), quần legging leo núi dài màu xanh ô liu sẫm và giày leo núi màu nâu";

const LOCATION =
  "sườn đồi rừng ở tỉnh Sơn La, vùng núi Tây Bắc Việt Nam: một bãi cỏ nhỏ bằng phẳng trên sườn đồi, ngay bên dưới là con suối đá nước trong chảy qua, phía sau là rừng nhiệt đới rậm và những dãy núi đất thấp xa xa có sương mỏng, sáng sớm";

const PROPS = [
  { name: "lều", description: "lều mái vòm nhỏ hai người màu xanh rêu, vải dù hơi bạc màu, dây chằng màu cam", states: "dựng trên bãi cỏ" },
  { name: "bếp đá", description: "vòng bếp lửa xếp bằng đá suối tròn cỡ nắm tay, đường kính khoảng 60 cm, giữa có tro cũ", states: "chưa nhóm, có mồi lửa, đang cháy" },
  { name: "gốc cây", description: "gốc cây cưa phẳng đường kính 40 cm, cao ngang gối, mặt cắt có vòng gỗ, vỏ nâu sần", states: "bình thường" },
  { name: "khúc gỗ", description: "khúc gỗ thông ngắn dài khoảng 40 cm, đường kính 20 cm, vỏ nâu sẫm, mặt cắt vàng nhạt", states: "nguyên khúc, bổ đôi" },
  { name: "rìu", description: "rìu nhỏ cán gỗ dài 50 cm, lưỡi thép xám hơi gỉ", states: "bình thường" },
  { name: "que đánh lửa", description: "que đánh lửa ferro dài 10 cm cán nhựa đen, kèm thanh thép cạo nhỏ", states: "bình thường" },
];

const s = (id: string, size: Shot["size"], angle: Shot["angle"], move: Shot["move"], subject: Shot["subject"], link: Shot["link"], start: string, motion: string, props = ""): Shot => ({
  id,
  size,
  angle,
  move,
  subject,
  link,
  start,
  motion,
  props,
});

const SHOTS: Shot[] = [
  s("c01", "EWS", "aerial", "drone", "none", "cut",
    "nhìn từ trên cao: bãi cỏ nhỏ trên sườn đồi, chiếc lều xanh rêu dựng giữa bãi, vòng bếp đá bên cạnh lều, con suối đá chảy ngay bên dưới, rừng rậm xung quanh có sương mỏng",
    "flycam bay chậm về phía lều, sương mỏng trôi qua tán cây, nước suối lấp lánh", "lều: dựng trên bãi cỏ\nbếp đá: chưa nhóm"),
  s("c02", "WS", "eye", "handheld", "character", "cut",
    "cô gái đứng ở mép suối bên trái khung hình, quay lưng về phía máy, tay phải cầm chiếc rìu nhỏ, tay trái ôm một khúc gỗ ngắn, phía trên dốc cỏ là chiếc lều xanh rêu",
    "cô bước lên dốc cỏ về phía lều, chân giẫm lên cỏ ướt, khúc gỗ và rìu đung đưa theo bước đi", "rìu: bình thường\nkhúc gỗ: nguyên khúc"),
  s("c03", "MS", "eye", "static", "character", "cut",
    "cô gái đứng sau gốc cây cưa phẳng cạnh lều, quay mặt về phía máy hơi chếch sang trái, khúc gỗ ngắn dựng đứng trên mặt gốc cây, hai tay nắm cán rìu giơ cao qua đầu",
    "cô bổ mạnh rìu xuống giữa khúc gỗ, lưỡi rìu cắm vào gỗ, khúc gỗ tách làm đôi đổ sang hai bên, vụn gỗ văng ra", "khúc gỗ: nguyên khúc -> bổ đôi\ngốc cây: bình thường"),
  s("c04", "INSERT", "high", "static", "hands", "cut",
    "cận mặt gốc cây nhìn từ trên xuống: hai nửa khúc gỗ vừa bổ nằm hai bên, lưỡi rìu cắm giữa mặt gốc cây, bàn tay cô gái nắm cán rìu",
    "bàn tay rút mạnh lưỡi rìu ra khỏi gốc cây, vài vụn gỗ rơi xuống", "khúc gỗ: bổ đôi\ngốc cây: bình thường"),
  s("c05", "MCU", "low", "handheld", "character", "cut",
    "cận trung cô gái đứng thẳng cạnh gốc cây, rìu thả xuôi bên tay phải, mặt lấm tấm mồ hôi, nhìn sang trái khung hình",
    "cô thở ra một hơi, đưa cẳng tay trái lên lau mồ hôi trán rồi cúi nhìn xuống đống gỗ"),
  s("c06", "MCU", "low", "handheld", "character", "chain", "",
    "cô cúi xuống nhặt hai nửa khúc gỗ đã bổ ôm vào lòng rồi đứng thẳng lên", "khúc gỗ: bổ đôi"),
  s("c07", "CU", "eye", "pan", "none", "cut",
    "dòng suối trong chảy qua những hòn đá phủ rêu, nắng sớm nhẹ",
    "máy lia chậm theo dòng nước, nước chảy xiết qua đá tạo bọt trắng"),
  s("c08", "MS", "high", "static", "character", "cut",
    "cô gái quỳ cạnh vòng bếp đá bên lều, quay mặt sang phải khung hình, trước mặt là một nắm cỏ khô và que nhỏ trong lòng bếp, hai nửa khúc gỗ đặt bên cạnh bếp",
    "cô xếp cỏ khô và que nhỏ thành một chụm nhỏ gọn giữa lòng bếp", "bếp đá: chưa nhóm -> có mồi lửa\nkhúc gỗ: bổ đôi"),
  s("c09", "INSERT", "eye", "static", "hands", "cut",
    "cận hai bàn tay cô gái cầm que đánh lửa và thanh thép cạo, chĩa vào chụm cỏ khô giữa lòng bếp đá",
    "bàn tay cạo mạnh thanh thép dọc que đánh lửa, tia lửa sáng bắn xuống chụm cỏ khô, một làn khói mỏng bốc lên", "que đánh lửa: bình thường\nbếp đá: có mồi lửa"),
  s("c10", "INSERT", "eye", "push_in", "hands", "chain", "",
    "một ngọn lửa nhỏ bén vào cỏ khô, hai bàn tay khum lại che gió và thổi nhẹ, lửa cháy to dần", "bếp đá: có mồi lửa -> đang cháy"),
  s("c11", "MCU", "eye", "push_in", "character", "cut",
    "cận trung cô gái quỳ cạnh bếp đá đang cháy, ánh lửa ấm chiếu lên mặt, tay phải cầm một nửa khúc gỗ",
    "cô đặt nửa khúc gỗ vào bếp, lửa liếm lên mép gỗ, cô rụt tay lại", "bếp đá: đang cháy\nkhúc gỗ: bổ đôi"),
  s("c12", "WS", "high", "pull_out", "character", "cut",
    "cô gái ngồi bó gối cạnh bếp đá đang cháy trước chiếc lều xanh rêu, nhìn xuống con suối bên dưới",
    "máy lùi chậm ra xa, khói bếp bay lên hoà vào sương sáng, cô vẫn ngồi yên ngắm suối", "bếp đá: đang cháy\nlều: dựng trên bãi cỏ"),
];

const SON_LA: WorkflowGraph = {
  nodes: [
    { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { name: "Cô gái Sơn La", description: CHARACTER, provider: "muse" } },
    { id: "location-1", type: "location", position: { x: 40, y: 640 }, params: { name: "Sườn đồi suối đá Sơn La", description: LOCATION, look: DEFAULT_LOOK, provider: "muse" } },
    { id: "props-1", type: "props", position: { x: 40, y: 1140 }, params: { name: "Đồ cắm trại Sơn La", items: PROPS, provider: "muse" } },
    { id: "shotlist-1", type: "shotlist", position: { x: 480, y: 40 }, params: { shots: SHOTS } },
    { id: "film-1", type: "film", position: { x: 1120, y: 40 }, params: { provider: "muse", fixBrightness: true } },
  ],
  edges: [
    { id: "e-char-film", source: "character-1", sourceHandle: "character", target: "film-1", targetHandle: "character" },
    { id: "e-loc-film", source: "location-1", sourceHandle: "location", target: "film-1", targetHandle: "location" },
    { id: "e-props-film", source: "props-1", sourceHandle: "props", target: "film-1", targetHandle: "props" },
    { id: "e-shots-film", source: "shotlist-1", sourceHandle: "shots", target: "film-1", targetHandle: "shots" },
  ],
};

const IDEA =
  "Cô gái đi bộ một mình vào rừng nguyên sinh, tìm thấy một thác nước nhỏ, múc nước suối vào chiếc nồi nhôm nhỏ, nhóm bếp đá đun sôi nước rồi ngồi nghỉ uống nước ngắm thác. Phong cách vlog sinh tồn yên bình, không lời thoại.";

const FOREST =
  "rừng nguyên sinh vùng núi Tây Bắc Việt Nam: một thác nước nhỏ cao khoảng 3 mét đổ xuống vũng nước trong, bờ đá phủ rêu, cây cổ thụ và dương xỉ xung quanh, ánh sáng dịu xuyên qua tán lá";

const IDEA_TO_FILM: WorkflowGraph = {
  nodes: [
    { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { name: "Cô gái Sơn La", description: CHARACTER, provider: "muse" } },
    { id: "location-1", type: "location", position: { x: 40, y: 640 }, params: { name: "Thác nước rừng nguyên sinh", description: FOREST, look: DEFAULT_LOOK, provider: "muse" } },
    { id: "writer-1", type: "writer", position: { x: 480, y: 40 }, params: { idea: IDEA, shotCount: 8, provider: "muse" } },
    { id: "props-1", type: "props", position: { x: 480, y: 760 }, params: { name: "", items: [], provider: "muse" } },
    { id: "film-1", type: "film", position: { x: 1120, y: 40 }, params: { provider: "muse", fixBrightness: true } },
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

export const WORKFLOW_TEMPLATES = [
  { id: "sinh-ton-son-la", label: "Sinh tồn Sơn La (12 cảnh ~60 giây)", name: "Sinh tồn Sơn La", graph: SON_LA },
  { id: "y-tuong-thanh-phim", label: "Ý tưởng → phim (Muse viết kịch bản, 8 cảnh)", name: "Ý tưởng → phim", graph: IDEA_TO_FILM },
] as const;

export type TemplateId = (typeof WORKFLOW_TEMPLATES)[number]["id"];
