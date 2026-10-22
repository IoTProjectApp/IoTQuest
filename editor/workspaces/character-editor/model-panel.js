// Importing your own character models in the Character Editor: the "Imported bodies" list in the
// inspector, the panel that shows a picked model on stage (wearing the picked person's clothes and
// playing their clips) until it is added, and adding and removing models (public/data/models.js,
// with each model's file beside the game's in public/models/people). The fitting itself is in
// model-import.js.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { IMPORTED_MODELS } from '../../../public/character-models.js';
import {
  ModelError,
  readModelFile,
  fitModel,
  modelToGlb,
  modelNameProblem,
  modelNameFromFile,
  modelEntry,
} from './model-import.js';
import { icon } from '../../ui/icons.js';

const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
// The name a model being imported is shown under until it is added (no real model has a space).
const PREVIEW = ' importing';

// stage: the editor's Stage; shell: window.editorShell; toast(message, error); loaders(): three's
// GLTFLoader, FBXLoader and GLTFExporter; redraw(): show the stage and inspector again.
export function createModelImport({ stage, shell, toast, loaders, redraw }) {
  const panel = document.getElementById('model-panel');
  let saved = { version: 1, models: {} },
    importing = null,
    previews = 0;

  // A fitted model handed to the renderer as if it had loaded from its file.
  // Wrapped in a scene as a loaded file is: the renderer sizes the scene, not the model.
  function provide(file, root) {
    const scene = new THREE.Group();
    scene.add(root);
    const gltf = { scene, animations: [] };
    stage.characters.models.set(file, { promise: Promise.resolve(gltf), gltf });
  }
  function forgetPreview() {
    if (!importing) return;
    stage.characters.models.delete(importing.file);
    delete IMPORTED_MODELS[PREVIEW];
  }
  function close() {
    forgetPreview();
    importing = null;
    render();
    redraw();
  }

  async function pick() {
    if (!shell?.openModel)
      return toast('Importing a model needs the editor (scripts/world-editor.sh).', true);
    let picked;
    try {
      picked = await shell.openModel();
    } catch (error) {
      return toast(error.message, true);
    }
    if (picked) await start(picked);
  }
  // A picked file ({ name, ext, bytes }): fit it and show it on stage.
  async function start(picked) {
    let fitted;
    try {
      fitted = fitModel(await readModelFile(picked, await loaders()));
    } catch (error) {
      if (!(error instanceof ModelError)) console.error(error);
      return toast(error.message, true);
    }
    forgetPreview();
    // Each preview its own file name: the renderer keeps measurements by file.
    const file = 'model-preview-' + ++previews;
    importing = {
      source: picked.name,
      file,
      fitted,
      name: modelNameFromFile(picked.name),
      woman: false,
      height: fitted.height,
    };
    IMPORTED_MODELS[PREVIEW] = { file: file + '.glb', height: fitted.height };
    provide(file, fitted.root);
    render();
    redraw();
  }

  function render() {
    panel.hidden = !importing;
    if (!importing) return (panel.innerHTML = '');
    const f = importing.fitted,
      problem = modelNameProblem(importing.name);
    const facts = [
      `${f.bones} bones, ${f.meshes} ${f.meshes === 1 ? 'piece' : 'pieces'}`,
      f.turned.length ? f.turned.join(' and ') : '',
      f.left ? `${f.left} unrigged ${f.left === 1 ? 'piece' : 'pieces'} left out` : '',
    ].filter(Boolean);
    panel.innerHTML = `<div class="panel-head"><strong>Import a body</strong><span class="note">${escape(importing.source)}</span></div>
      <p class="note">${escape(facts.join(' · '))}. Shown wearing the picked person's clothes and playing their clips.${
        f.missing.length
          ? ` It has no ${escape(f.missing.join(', '))}: ${f.missing.includes('Spine2') ? 'aprons, ties and lanyards sit on the lower spine' : 'the feet bend less'}.`
          : ''
      }</p>
      <label class="field"><span>Name</span><input class="input" id="model-name" value="${escape(importing.name)}" maxlength="40" spellcheck="false" />
        <small class="${problem ? 'bad' : ''}">${escape(problem || 'Listed under “Played by” as ' + importing.name)}</small></label>
      <div class="segmented" id="model-kind" role="group" aria-label="Listed as">
        <button data-woman="false" class="${importing.woman ? '' : 'active'}">A man</button>
        <button data-woman="true" class="${importing.woman ? 'active' : ''}">A woman</button>
      </div>
      <label class="field"><span>Height against the game's people</span>
        <span class="controls"><input type="range" id="model-height" min="0.6" max="1.25" step="0.01" value="${importing.height}" />
        <span class="value" id="model-height-value">${importing.height.toFixed(2)}×</span></span></label>
      <div class="actions"><button class="button" id="model-cancel">Cancel</button>
        <button class="button primary" id="model-add" ${problem ? 'disabled' : ''}>${icon('plus', 16)}Add to the game</button></div>`;
    document.getElementById('model-name').addEventListener('input', (e) => {
      importing.name = e.target.value.trim();
      const p = modelNameProblem(importing.name),
        small = panel.querySelector('.field small');
      small.textContent = p || 'Listed under “Played by” as ' + importing.name;
      small.classList.toggle('bad', !!p);
      document.getElementById('model-add').disabled = !!p;
    });
    for (const b of panel.querySelectorAll('[data-woman]'))
      b.addEventListener('click', () => {
        importing.woman = b.dataset.woman === 'true';
        render();
      });
    document.getElementById('model-height').addEventListener('input', (e) => {
      importing.height = Number(e.target.value);
      IMPORTED_MODELS[PREVIEW].height = importing.height;
      document.getElementById('model-height-value').textContent = importing.height.toFixed(2) + '×';
    });
    document.getElementById('model-cancel').addEventListener('click', close);
    document.getElementById('model-add').addEventListener('click', add);
  }

  // Saves the model beside the others and lists it in public/data/models.js.
  async function add() {
    const { name, woman, height, fitted } = importing,
      problem = modelNameProblem(name);
    if (problem) return toast(problem, true);
    try {
      const { GLTFExporter } = await loaders(),
        glb = await modelToGlb(fitted.root, GLTFExporter),
        entry = modelEntry(name, { woman, height });
      await shell.saveModel(name, new Uint8Array(glb));
      const now = await shell.read('models');
      now.models[name] = entry;
      await shell.write('models', now);
      saved = now;
      IMPORTED_MODELS[name] = entry;
      const file = entry.file.slice(0, -4);
      provide(file, fitted.root);
      stage.characters.models.delete(importing.file);
      delete IMPORTED_MODELS[PREVIEW];
      importing = null;
      render();
      redraw();
      toast(`Added ${name}: pick it under “Played by” for anyone.`);
    } catch (error) {
      toast('Could not add the model: ' + error.message, true);
    }
  }

  // users: the settings that name the model (by person id).
  async function remove(name, users = []) {
    if (
      !confirm(
        `Remove ${name} from the game? Its file is deleted.` +
          (users.length ? ` ${users.length} setting(s) use it; they go back to as built.` : ''),
      )
    )
      return;
    try {
      await shell.removeModel(name);
      const now = await shell.read('models');
      delete now.models[name];
      await shell.write('models', now);
      saved = now;
      delete IMPORTED_MODELS[name];
      stage.characters.models.delete('model-' + name);
      redraw();
      toast(`Removed ${name}.`);
    } catch (error) {
      toast('Could not remove the model: ' + error.message, true);
    }
  }

  return {
    // The saved models file (public/data/models.js), as the editor opened it.
    load(models) {
      saved = models;
    },
    // Imported models for the "Played by" list.
    choices() {
      return Object.entries(saved.models)
        .filter(([name]) => name in IMPORTED_MODELS)
        .map(([name, m]) => [name, `${name} · ${m.woman ? 'woman' : 'man'}, imported`]);
    },
    // Who to show: the person as they are, or played by the model being imported.
    preview(look) {
      return importing ? { ...look, model: PREVIEW } : look;
    },
    // The inspector's section: the imported models, and importing one.
    section() {
      const names = Object.keys(saved.models);
      return `<section>
        <div class="section-head"><h3>Imported bodies</h3><button class="button" id="import-model" title="Bring in a rigged character from a .glb, .gltf or .fbx file: a Mixamo character, a Ready Player Me avatar or a Blender export">${icon('plus', 16)}Import model…</button></div>
        ${
          names.length
            ? `<ul class="imported">${names
                .map((name) => {
                  const m = saved.models[name];
                  return `<li><span>${escape(name)}</span><span class="note">${m.woman ? 'woman' : 'man'}${m.height ? ` · ${m.height}× tall` : ''}${name in IMPORTED_MODELS ? '' : ' · not loaded'}</span>
                    <button class="reset-one" data-remove-model="${escape(name)}" title="Remove ${escape(name)} from the game">${icon('erase', 14)}</button></li>`;
                })
                .join('')}</ul>`
            : '<p class="note">None yet. An imported body can play anyone: pick it under “Played by”.</p>'
        }
      </section>`;
    },
    bind(el, usersOf) {
      el.querySelector('#import-model')?.addEventListener('click', pick);
      for (const b of el.querySelectorAll('[data-remove-model]'))
        b.addEventListener('click', () =>
          remove(b.dataset.removeModel, usersOf(b.dataset.removeModel)),
        );
    },
    // For test scripts: import a file without the dialog.
    start,
  };
}
