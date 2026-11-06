import type { CastMember } from "../../src/shared/cast";
import type { ImageSetValue } from "../../src/shared/ports";

// Dàn nhân vật mẫu dùng chung cho test phim hoạt hình.
export const TEST_MEMBERS: CastMember[] = [
  { name: "Mướp", look: "mèo mướp cam béo tròn, mắt xanh lá, vòng cổ đỏ", size: "cao 40 cm", trait: "lười, tham ăn" },
  { name: "gián Đỏ", look: "gián nâu đứng hai chân, đội mũ lưỡi trai đỏ", size: "cao 7 cm, chỉ tới đầu gối Mướp", trait: "lanh lợi" },
  { name: "gián Xanh", look: "gián nâu đứng hai chân, quàng khăn xanh", size: "cao 7 cm", trait: "nhát" },
];

// Bộ ảnh như node Dàn nhân vật ra (mã ảnh giả).
export function testCastSet(): ImageSetValue {
  return {
    kind: "imageset",
    role: "character",
    description: "dàn nhân vật thử",
    images: [
      { mediaId: "lineup", view: "front" },
      { mediaId: "m1", view: "member-1" },
      { mediaId: "m2", view: "member-2" },
      { mediaId: "m3", view: "member-3" },
    ],
    style: "hoat-hinh-2d",
    members: TEST_MEMBERS,
    rules: "Gián luôn tìm cách cướp đồ ăn của Mướp.",
  };
}
