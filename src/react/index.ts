/**
 * moderato/react — hooks only, safe for React DOM *and* React Native.
 * DOM components (field and upload wrappers) live in "moderato/web".
 */

export {
  useModeratedSubmit,
} from "./useModeratedSubmit.js";
export type {
  ModeratedSubmit,
  ModeratedSubmitOptions,
  MutationCallbacks,
  MutationLike,
  SubmitTarget,
} from "./useModeratedSubmit.js";

export { useModeration } from "./useModeration.js";
export type { UseModeration } from "./useModeration.js";

export {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MIN_LENGTH,
  useModeratedField,
} from "./useModeratedField.js";
export type {
  FieldCheck,
  ModeratedField,
  UseModeratedFieldOptions,
} from "./useModeratedField.js";

// The server-refusal contract, re-exported so a client that only ever
// needs `refusalFrom` can import everything from one place.
export {
  DEFAULT_REFUSAL_FALLBACK,
  REFUSED_STATUS,
  refusalFrom,
} from "../refusal.js";
