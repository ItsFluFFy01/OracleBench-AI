import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ob-theme");
      if (saved === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
        setDark(true);
      }
    } catch (_) {}
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    try {
      if (next) {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("ob-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("ob-theme", "light");
      }
    } catch (_) {}
  }

  return (
    <button className="theme-toggle" onClick={toggle} title={dark ? "Thème clair" : "Thème sombre"}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
