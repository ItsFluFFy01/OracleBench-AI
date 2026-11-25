export const config = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:5000",
  bridgeUrl: import.meta.env.VITE_BRIDGE_URL || "http://localhost:3001",
  useMocks:
    import.meta.env.VITE_USE_MOCKS === "true" ||
    import.meta.env.VITE_USE_MOCKS === true ||
    import.meta.env.VITE_USE_MOCKS === undefined,
};
