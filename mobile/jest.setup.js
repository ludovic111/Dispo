// Mocks globaux des modules natifs sans implémentation JS pure sous Jest.
// Un test peut toujours les redéfinir avec son propre `jest.mock(...)`.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {},
  useReducedMotion: () => true,
}));
