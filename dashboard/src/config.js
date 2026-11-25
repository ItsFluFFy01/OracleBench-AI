const savedUseMocks =
  typeof window !== "undefined" ? localStorage.getItem("oraclebench_use_mocks") : null;

export const config = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:5000",
  bridgeUrl: import.meta.env.VITE_BRIDGE_URL || "http://localhost:3001",
  useMocks:
    savedUseMocks !== null
      ? savedUseMocks === "true"
      : import.meta.env.VITE_USE_MOCKS === "true",
  setUseMocks(val) {
    this.useMocks = Boolean(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("oraclebench_use_mocks", String(this.useMocks));
    }
  },
};
