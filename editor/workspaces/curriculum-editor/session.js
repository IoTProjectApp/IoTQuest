// Curriculum & Code Coach Editor model: manages programming techniques & patterns
// (public/quest-techniques.js), Check Your Understanding questions (public/technique-questions.js),
// custom Code Coach diagnostic rules, and live Code Coach sandbox evaluation against any quest.
// Saved in public/data/curriculum.js. Free of the DOM so it runs under Node in tests.
import { missions, defaults } from '../../../public/missions.js';
import { TECHNIQUES as BUILTIN_TECHNIQUES } from '../../../public/quest-techniques.js';
import { TECHNIQUE_QUESTIONS as BUILTIN_QUESTIONS } from '../../../public/technique-questions.js';
import { coachSteps, guidedStarter } from '../../../public/code-coach.js';
import { diagnose } from '../../../public/diagnostics.js';
import { understandingQuestions } from '../../../public/understanding.js';

export { missions };

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class CurriculumSession {
  constructor(saved = { version: 1, techniques: {}, questions: {}, coachTips: [] }) {
    this.techniques = clone(saved?.techniques || {});
    this.questions = clone(saved?.questions || {});
    this.coachTips = clone(saved?.coachTips || []);
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  snapshot() {
    return {
      techniques: clone(this.techniques),
      questions: clone(this.questions),
      coachTips: clone(this.coachTips),
    };
  }

  commit(label, mutate, merge = null) {
    const before = this.snapshot();
    mutate();
    const after = this.snapshot();
    if (same(before, after)) return false;
    const top = this.undoStack.at(-1);
    if (!(merge && top?.merge === merge && !this.redoStack.length)) {
      this.undoStack.push({ label, state: before, merge });
    }
    this.redoStack = [];
    this.emit();
    return true;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ label: entry.label, state: this.snapshot() });
    this.techniques = entry.state.techniques;
    this.questions = entry.state.questions;
    this.coachTips = entry.state.coachTips;
    this.emit();
    return entry.label;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, state: this.snapshot() });
    this.techniques = entry.state.techniques;
    this.questions = entry.state.questions;
    this.coachTips = entry.state.coachTips;
    this.emit();
    return entry.label;
  }

  // ---- Techniques & Comprehension Questions ----
  isBuiltinTechnique(key) {
    return key in BUILTIN_TECHNIQUES;
  }

  isEditedTechnique(key) {
    return Boolean(key in this.techniques || key in this.questions);
  }

  allTechniques() {
    const keys = new Set([...Object.keys(BUILTIN_TECHNIQUES), ...Object.keys(this.techniques)]);
    return [...keys].map((key) => this.getTechnique(key));
  }

  getTechnique(key) {
    const baseT = BUILTIN_TECHNIQUES[key];
    const editT = this.techniques[key];
    if (!baseT && !editT) return null;
    const baseQ = BUILTIN_QUESTIONS[key];
    const editQ = this.questions[key];
    const question = clone(
      editQ ||
        baseQ || {
          prompt: `Why is the ${editT?.title || key} pattern useful in IoT programs?`,
          choices: [
            {
              text: 'It makes the controller respond reliably to real-world sensor behaviour',
              right: true,
              why: 'Right. Each pattern solves a timing, state, or noise challenge.',
            },
            {
              text: 'It makes the sensor hardware run at a higher voltage',
              why: 'Code patterns never change the physical voltage supplied to a pin.',
            },
          ],
        },
    );
    return {
      key,
      builtin: Boolean(baseT),
      edited: this.isEditedTechnique(key),
      title: editT?.title ?? baseT?.title ?? key,
      body: editT?.body ?? baseT?.body ?? '',
      cpp: editT?.cpp ?? baseT?.cpp ?? '',
      python: editT?.python ?? baseT?.python ?? '',
      question,
    };
  }

  addCustomTechnique({
    key = '',
    title = 'Debounce a Noisy Switch',
    body = 'Mechanical contacts bounce for a few milliseconds when pressed. Wait until the reading has stayed stable for a short debounce window before accepting the change.',
    cpp = 'if (reading != lastReading) {\n  lastBounce = millis();\n}\nif (millis() - lastBounce >= ____) {\n  stableState = reading;\n}\nlastReading = reading;',
    python = 'if reading != last_reading:\n    last_bounce = time.ticks_ms()\nif time.ticks_diff(time.ticks_ms(), last_bounce) >= ____:\n    stable_state = reading\nlast_reading = reading',
  } = {}) {
    let baseKey =
      String(key || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'custom-pattern';
    let finalKey = baseKey;
    let n = 2;
    const existing = new Set(this.allTechniques().map((t) => t.key));
    while (existing.has(finalKey)) finalKey = `${baseKey}-${n++}`;

    this.commit(`Add technique ${title}`, () => {
      this.techniques[finalKey] = { title, body, cpp, python };
      this.questions[finalKey] = {
        prompt: `What problem does the "${title}" pattern solve?`,
        choices: [
          {
            text: 'It filters out rapid contact bounce so one press is read cleanly',
            right: true,
            why: 'Right. Waiting for the signal to settle stops false triggers.',
          },
          {
            text: 'It increases the analog resolution of the pin',
            why: 'Debouncing is about timing stability on a digital input, not ADC resolution.',
          },
        ],
      };
    });
    return finalKey;
  }

  updateTechnique(key, patch = {}, merge = null) {
    const current = this.getTechnique(key);
    if (!current) return false;
    return this.commit(
      `Update technique ${key}`,
      () => {
        const base = BUILTIN_TECHNIQUES[key];
        const next = {
          title: patch.title !== undefined ? patch.title : current.title,
          body: patch.body !== undefined ? patch.body : current.body,
          cpp: patch.cpp !== undefined ? patch.cpp : current.cpp,
          python: patch.python !== undefined ? patch.python : current.python,
        };
        if (base && same(next, base)) {
          delete this.techniques[key];
        } else {
          this.techniques[key] = next;
        }
      },
      merge,
    );
  }

  updateQuestion(key, questionPatch = {}, merge = null) {
    const current = this.getTechnique(key);
    if (!current) return false;
    return this.commit(
      `Update question for ${key}`,
      () => {
        const baseQ = BUILTIN_QUESTIONS[key];
        const nextQ = {
          prompt:
            questionPatch.prompt !== undefined ? questionPatch.prompt : current.question.prompt,
          choices:
            questionPatch.choices !== undefined
              ? clone(questionPatch.choices)
              : clone(current.question.choices),
        };
        if (baseQ && same(nextQ, baseQ)) {
          delete this.questions[key];
        } else {
          this.questions[key] = nextQ;
        }
      },
      merge,
    );
  }

  resetTechnique(key) {
    if (!this.isBuiltinTechnique(key)) return false;
    return this.commit(`Reset ${key}`, () => {
      delete this.techniques[key];
      delete this.questions[key];
    });
  }

  removeCustomTechnique(key) {
    if (this.isBuiltinTechnique(key)) return false;
    return this.commit(`Delete ${key}`, () => {
      delete this.techniques[key];
      delete this.questions[key];
    });
  }

  // ---- Custom Code Coach Diagnostic Rules ----
  addCoachTip({
    title = 'Avoid long blocking delay()',
    pattern = 'delay\\s*\\(\\s*[5-9]\\d{3,}',
    language = 'both', // 'cpp' | 'python' | 'both'
    severity = 'tip', // 'warning' | 'tip'
    message = 'A very long delay() freezes the loop so sensors are not checked while waiting. Consider using millis() instead.',
  } = {}) {
    const id = 'tip-' + (this.coachTips.length + 1) + '-' + (Date.now() % 10000);
    this.commit(`Add Coach tip "${title}"`, () => {
      this.coachTips.push({ id, title, pattern, language, severity, message });
    });
    return id;
  }

  updateCoachTip(id, patch = {}, merge = null) {
    return this.commit(
      'Update Coach tip',
      () => {
        const tip = this.coachTips.find((t) => t.id === id);
        if (!tip) return;
        Object.assign(tip, clone(patch));
      },
      merge,
    );
  }

  removeCoachTip(id) {
    return this.commit('Remove Coach tip', () => {
      this.coachTips = this.coachTips.filter((t) => t.id !== id);
    });
  }

  // ---- Code Coach Sandbox Evaluation ----
  starterForQuest(questIndex = 0, language = 'cpp') {
    const mission = missions[questIndex] || missions[0];
    return guidedStarter(mission, language);
  }

  evaluateSandbox({ questIndex = 0, language = 'cpp', board = 'ESP32', code = '' } = {}) {
    const mission = missions[questIndex] || missions[0];
    const devices = defaults(mission.ids || [], board);
    const steps = coachSteps(mission, language, devices, board).map((s) => {
      const verdict = s.check ? s.check(code) : { status: 'manual', detail: 'Guided step' };
      return {
        key: s.key,
        title: s.title,
        task: s.task,
        pattern: s.pattern || '',
        status: verdict.status,
        detail: verdict.detail || '',
      };
    });

    const builtinDiagnostics = diagnose(code, language, devices);
    const customMatches = [];
    for (const tip of this.coachTips) {
      if (tip.language !== 'both' && tip.language !== language) continue;
      try {
        const re = new RegExp(tip.pattern, 'm');
        const m = code.match(re);
        if (m) {
          customMatches.push({
            id: tip.id,
            severity: tip.severity || 'tip',
            title: tip.title,
            message: tip.message,
          });
        }
      } catch {
        // Invalid regex is caught by check()
      }
    }

    const comprehension = understandingQuestions(mission, language, devices, board);
    return {
      mission,
      devices,
      steps,
      diagnostics: builtinDiagnostics,
      customMatches,
      comprehension,
    };
  }

  // ---- Validation Check ----
  check() {
    const problems = [];
    const add = (id, field, text, error = true) => problems.push({ id, field, text, error });

    for (const t of this.allTechniques()) {
      if (!t.edited && t.builtin) continue;
      if (!String(t.title || '').trim()) add(t.key, 'title', 'Technique title cannot be empty.');
      if (!String(t.body || '').trim()) add(t.key, 'body', 'Explanation body cannot be empty.');
      if (!String(t.cpp || '').trim()) add(t.key, 'cpp', 'C++ code pattern cannot be empty.');
      if (!String(t.python || '').trim())
        add(t.key, 'python', 'MicroPython code pattern cannot be empty.');

      const q = t.question;
      if (!String(q?.prompt || '').trim()) {
        add(t.key, 'prompt', 'Understanding question prompt cannot be empty.');
      }
      const choices = q?.choices || [];
      if (choices.length < 2) {
        add(t.key, 'choices', 'Question must have at least 2 answer choices.');
      }
      if (!choices.some((c) => c.right)) {
        add(t.key, 'choices', 'Question must have one right answer marked.');
      }
      for (const c of choices) {
        if (!String(c.text || '').trim() || !String(c.why || '').trim()) {
          add(t.key, 'choices', 'Every choice must have both answer text and an explanation.');
          break;
        }
      }
    }

    for (const tip of this.coachTips) {
      if (!String(tip.title || '').trim())
        add(tip.id, 'title', 'Coach rule title cannot be empty.');
      if (!String(tip.message || '').trim())
        add(tip.id, 'message', 'Coach rule feedback message cannot be empty.');
      if (!String(tip.pattern || '').trim()) {
        add(tip.id, 'pattern', 'Coach rule regex pattern cannot be empty.');
      } else {
        try {
          new RegExp(tip.pattern);
        } catch {
          add(tip.id, 'pattern', `Invalid regular expression "${tip.pattern}".`);
        }
      }
    }

    return problems;
  }

  savedFile() {
    return {
      version: 1,
      techniques: clone(this.techniques),
      questions: clone(this.questions),
      coachTips: clone(this.coachTips),
    };
  }
}
