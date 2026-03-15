// ── state.js ────────────────────────────────────────────────────────────────
// Single source of truth for all mutable app state.
// Import and mutate via the setter functions below.

export const state = {
  tasks: [],        // T — all loaded tasks
  filtered: [],     // F — currently visible tasks
  selectedIdx: -1,  // si — index in tasks[]
  history: {},      // H — chat history per task index
  topicFilter: "Alle",
  levelFilter: "all",
  streaming: false,
  storedPin: "",
};
