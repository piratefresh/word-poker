/**
 * Jest resolver for the mobile package.
 *
 * Jest resolves `*.native.*` files for React Native, but `react-native-worklets`'
 * native entry installs a JSI binding that cannot exist in Node — importing it
 * throws before any test runs. That package ships a resolver which drops native
 * extensions inside itself, so it is composed in front of React Native's own
 * resolver, which still has to run for everything else.
 *
 * The inner hop re-supplies jest's original `defaultResolver`: handing React
 * Native's resolver its own wrapper instead would recurse until the stack blows.
 */
const rnResolver = require("@react-native/jest-preset/jest/resolver");
const workletsResolver = require("react-native-worklets/jest/resolver");

module.exports = (request, options) =>
  workletsResolver(request, {
    ...options,
    defaultResolver: (innerRequest, innerOptions) =>
      rnResolver(innerRequest, {
        ...innerOptions,
        defaultResolver: options.defaultResolver,
      }),
  });
