// Pure decision: 3D carousel or Victor's 2D picker. The demo must never depend on the 3D.

export function pickerMode({ compact, search, webgl }: { compact: boolean; search: string; webgl: boolean }): "3d" | "2d" {
  const p = new URLSearchParams(search);
  if (compact) return "2d";
  if (p.get("q") === "low") return "2d";
  if (p.has("player") || p.has("demo")) return "2d"; // deep links skip the picker anyway
  if (!webgl) return "2d";
  return "3d";
}

/** True when a WebGL2 context can be created (checked once, on the client). */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    const ok = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
