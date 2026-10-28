import { z } from "zod";
import { defineNode } from "../../shared/node-definition";
import { PROVIDER_IDS } from "../../shared/providers";

export const params = z.object({
  description: z.string().trim().min(20, "Mô tả bối cảnh quá ngắn (cần địa hình, vật cố định như lều, suối, ánh sáng)"),
  provider: z.enum(PROVIDER_IDS, { error: "Chưa chọn dịch vụ" }),
});
export type LocationParams = z.infer<typeof params>;

export const LOCATION_VIEWS = (d: string) => [
  {
    view: "wide",
    label: "toàn cảnh",
    prompt: `Photorealistic wide landscape photo, no people: ${d}. Natural light, documentary photography`,
  },
  {
    view: "close",
    label: "cận khu lều",
    prompt: `Photorealistic photo of the same place as in the attached photo, closer view of the main fixed objects, no people: ${d}`,
  },
];

export const definition = defineNode<LocationParams>({
  type: "location",
  label: "Hồ sơ không gian",
  description: "Tạo bộ ảnh gốc của bối cảnh (toàn cảnh, cận) không có người, để mọi cảnh giữ đúng nơi chốn.",
  inputs: [],
  outputs: [{ name: "location", kind: "imageset", label: "Không gian" }],
  params,
  defaults: { description: "", provider: "fake" },
});
