import { lionPayload0 } from "./lionPayload0";
import { lionPayload1 } from "./lionPayload1";
import { lionPayload2 } from "./lionPayload2";
import { lionPayload3 } from "./lionPayload3";
import { lionPayload4 } from "./lionPayload4";
import { lionPayload5 } from "./lionPayload5";

// LIONA03 is a compact structural dataset derived from the uploaded lion reference.
// The original image is never displayed at runtime. 3,325 structural anchors expand
// deterministically into 23,275 GPU particles, with 1,800 precomputed fiber links.
export const LION_PARTICLE_BASE64 =
  lionPayload0 + lionPayload1 + lionPayload2 + lionPayload3 + lionPayload4 + lionPayload5;

export const LION_CHILDREN_PER_ANCHOR = 7;
