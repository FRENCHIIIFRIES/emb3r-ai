// The eight subject tutors: who each one is, how it teaches, and which of the
// models on this computer suits its subject.
//
// A tutor is Ember teaching one subject. It keeps her origin and student mode,
// it answers on this computer only (main.js never sends a tutor chat to the
// web, whatever web access is set to), and it stays on its subject.
//
// Nothing in here touches Electron, the disk or the network, so `npm test`
// runs all of it.

export const TUTORS = {
  maths: {
    name: "Maths",
    subject: "mathematics",
    style: "Work one example with the student step by step, writing out every line of working, then give them a similar one to try. Check an answer by putting it back into the question.",
    kind: "stem",
  },
  biology: {
    name: "Biology",
    subject: "biology",
    style: "Start from something the student has seen in everyday life, then explain how the structure fits its job, one idea per step.",
    kind: "general",
  },
  chemistry: {
    name: "Chemistry",
    subject: "chemistry",
    style: "Say what the particles are doing first, then write the equation and balance it step by step, with a unit on every number.",
    kind: "stem",
  },
  physics: {
    name: "Physics",
    subject: "physics",
    style: "Describe the situation in words first, then the equation in words, then in symbols, and check the units at the end.",
    kind: "stem",
  },
  history: {
    name: "History",
    subject: "history",
    style: "Tell it as causes, events and consequences, give each event its date, and ask how we know - which source says so.",
    kind: "general",
  },
  geography: {
    name: "Geography",
    subject: "geography",
    style: "Start with where it is, then why there, then what it does to people and places, with a real case study.",
    kind: "general",
  },
  english: {
    name: "English",
    subject: "English language and literature",
    style: "Quote the text word for word first, then say what it shows, then why the writer chose those words, and help the student build a paragraph.",
    kind: "general",
  },
  languages: {
    name: "Languages",
    subject: "learning a language (French, Spanish, Hindi, German, or whichever the student names)",
    style: "Teach short phrases and patterns before rules, a few new words at a time, writing the language with the English beside it, and give the student a line to try.",
    kind: "general",
  },
};

export const TUTOR_IDS = Object.keys(TUTORS);

export function isTutor(id) {
  return typeof id === "string" && Object.hasOwn(TUTORS, id);
}

// What every tutor does, whatever its subject: the study rules from the design
// (hint before answer, one check question, short replies), and staying on the
// subject it teaches.
const STUDY_RULES =
  "Keep replies short. Give a hint before an answer, and end with one short question that checks the student understood. "
  + "Help the student do their homework; never just hand over work they will be marked on. "
  + "Stay on your subject: if they ask about something else, say in one line which tutor, or Ember in a normal chat, can help with it, and bring them back.";

// The system prompt for a tutor chat. `origin` is who made emb3r, `safe` is
// student mode's rules when it is on, `name` the line with the user's name.
export function tutorPrompt(id, { origin = "", safe = "", name = "" } = {}) {
  const t = TUTORS[id];
  if (!t) throw new Error(`no tutor called ${id}`);
  return [safe, origin,
    `Right now you are the ${t.name} tutor in emb3r, and you teach ${t.subject} only.`,
    t.style, STUDY_RULES, name].filter(Boolean).join(" ").trim();
}

// Which installed model each kind of tutor answers on, best first. Maths and
// the sciences go to Qwen2.5 3B, which is stronger at maths than Llama 3.2 3B
// at the same size; everything else to Llama 3.2 3B. Never a reasoning model:
// Qwen3 1.7B was tried here and answered three ordinary questions with nothing
// at all (see MODEL_CATALOG in main.js).
export const TUTOR_MODELS = {
  stem: ["Qwen2.5-3B-Instruct-Q4_K_M.gguf", "Llama-3.2-3B-Instruct-Q4_K_M.gguf"],
  general: ["Llama-3.2-3B-Instruct-Q4_K_M.gguf", "Qwen2.5-3B-Instruct-Q4_K_M.gguf"],
};

// The model this tutor should use, from the files actually present, or null
// when none of its models is - then the chat stays on the model already chosen.
export function preferredModelFor(id, installed) {
  const t = TUTORS[id];
  if (!t || !Array.isArray(installed)) return null;
  return TUTOR_MODELS[t.kind].find((file) => installed.includes(file)) || null;
}

// The model that would suit this tutor best, installed or not - what to offer
// to download when the chat had to settle for something else.
export function bestModelFor(id) {
  const t = TUTORS[id];
  return t ? TUTOR_MODELS[t.kind][0] : null;
}
