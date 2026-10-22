// Character models imported in the Character Editor (editor/workspaces/character-editor,
// launched with scripts/world-editor.sh) join the game's own (people-cast.js) from
// data/models.js:
//   { version: 1, models: { [Name]: { file: 'model-Name.glb', woman?, height? } } }
// Each is a rigged body saved beside the others (public/models/people) in the game's form: Mixamo
// bone names, centimetres under a 0.01 scale, feet on the ground, facing +z, so every clip plays
// on it. It has one level of detail, used near and far; height scales it against the game's
// people (1 = as tall). A person plays one when their settings name it (character-settings.js).
// One that is not valid, or is named like a built-in model, is left out.
import IMPORTED from './data/models.js';
import { WOMEN, MEN } from './people-cast.js';

// The game's own models, each with a light version (-low): the cast and the uniformed roles.
export const BUILT_IN_MODELS = [...WOMEN, ...MEN, 'Chad', 'Jennifer'];
export const MODEL_NAME = /^[A-Z][A-Za-z0-9]{0,39}$/;
// Whether an imported model's entry can be used.
export const validModel = (name, model) =>
  MODEL_NAME.test(name) &&
  !BUILT_IN_MODELS.includes(name) &&
  model?.file === 'model-' + name + '.glb' &&
  (model.woman === undefined || typeof model.woman === 'boolean') &&
  (model.height === undefined ||
    (Number.isFinite(model.height) && model.height >= 0.5 && model.height <= 1.3));
// The imported models that can be used, by name.
export function importedModels(saved = IMPORTED) {
  return Object.fromEntries(
    Object.entries(saved?.models || {}).filter(([name, model]) => {
      const ok = validModel(name, model);
      if (!ok) console.warn(`Imported model "${name}" left out: its entry is not valid.`);
      return ok;
    }),
  );
}
export const IMPORTED_MODELS = importedModels();
// Whether a model can play someone (a setting naming one since removed falls back to the cast).
export const knownModel = (name) => BUILT_IN_MODELS.includes(name) || name in IMPORTED_MODELS;
// The file (without .glb) a model is drawn from, far away (low) or near.
export const modelFile = (name, low = false) =>
  name in IMPORTED_MODELS ? IMPORTED_MODELS[name].file.slice(0, -4) : name + (low ? '-low' : '');
// How tall a model is drawn, against the game's people.
export const modelHeight = (name) => IMPORTED_MODELS[name]?.height ?? 1;
