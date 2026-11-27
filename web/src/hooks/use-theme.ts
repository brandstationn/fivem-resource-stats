import { useCallback, useState } from "react"

type Theme = "light" | "dark"
const current = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")

/** The initial theme is set by an inline script in index.html (no flash). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current)
  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark"
    document.documentElement.classList.toggle("dark", next === "dark")
    localStorage.setItem("theme", next)
    setTheme(next)
  }, [])
  return { theme, toggle }
}
