// In-memory AsyncStorage for node-environment tests.
const store = new Map();
module.exports = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, v),
  removeItem: async (k) => void store.delete(k),
  clear: async () => store.clear(),
};
module.exports.default = module.exports;
