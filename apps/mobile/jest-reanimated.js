/**
 * Reanimated's shipped mock, with what the app needs on top. Its `useReducedMotion` is a TODO, so
 * motion stays on; its shared values have no `modify` (`@/motion`'s `forceReset` needs it), so one is
 * added over `set`. Suites that mock Reanimated themselves spread this rather than the bare mock.
 */
const mock = require("react-native-reanimated/mock");

module.exports = {
  ...mock,
  useReducedMotion: () => false,
  useSharedValue: (init) => {
    const value = mock.useSharedValue(init);
    return new Proxy(value, {
      get: (target, prop) => (prop === "modify" ? (modifier) => target.set(modifier(target.get())) : target[prop]),
    });
  },
};
