/** Dependency-free Chrome screenshots + browser checks. Run against a local production server. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const base = process.env.PAIN_BASE_URL || "http://localhost:3100";
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((path) => existsSync(path));
if (!chrome) throw new Error("Set CHROME_PATH to a local Chrome or Edge executable.");
const output = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots/pain");
const profile = await mkdtemp(join(tmpdir(), "pain-chrome-"));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const port = await new Promise((done) => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => done(address.port)); });
});
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let socket;
let id = 0;
const pending = new Map();
const errors = [];
const checks = [];

async function until(fn, description, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const result = await fn(); if (result) return result; } catch { /* Chrome/page may still be starting. */ }
    await pause(100);
  }
  throw new Error(`Timed out: ${description}`);
}
function send(method, params = {}) {
  return new Promise((resolveCall, reject) => {
    const call = ++id;
    const timer = setTimeout(() => { pending.delete(call); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(call, { resolve: (result) => { clearTimeout(timer); resolveCall(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: call, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(query, ready = "document.querySelector('[data-pain-frame]') !== null") {
  await send("Page.navigate", { url: `${base}/${query}` });
  await until(() => evaluate(`document.readyState === 'complete' && (${ready})`), `page ready: ${query}`);
  await evaluate("document.fonts.ready.then(() => true)");
  await pause(160);
}
async function capture(name, fullPage = false) {
  const clip = fullPage ? await evaluate("({ x:0, y:0, width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight, scale:1 })") : undefined;
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) });
  await writeFile(join(output, `${name}.png`), Buffer.from(result.data, "base64"));
}
async function check(name, expression) {
  const result = await evaluate(expression);
  if (!result) {
    await capture("check-failure");
    console.log(await evaluate("JSON.stringify({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,layout:[...document.querySelectorAll('.pain-header,.pain-hud,.pain-scene,.pain-visual,.pain-footer')].map(e=>({class:e.className,height:e.getBoundingClientRect().height}))})"));
    throw new Error(`Browser check failed: ${name}`);
  }
  checks.push(name);
}

try {
  const pages = await until(async () => { const response = await fetch(`http://127.0.0.1:${port}/json/list`); return response.ok && response.json(); }, "Chrome debugger");
  socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.reject(new Error(message.error.message)); else call?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await mkdir(output, { recursive: true });
  for (let scene = 1; scene <= 7; scene++) {
    const hits = scene === 5 ? [1, 2, 3, 4] : [1];
    for (const hit of hits) {
      await navigate(`?pain=${scene}&hit=${hit}&still=1`);
      await check(`scene ${scene}.${hit}: no horizontal overflow`, "document.documentElement.scrollWidth <= innerWidth");
      await check(`scene ${scene}.${hit}: fits the slide`, "document.documentElement.scrollHeight <= innerHeight + 2");
      if (scene === 6) await check("computed final health is 22", "document.querySelector('.pain-health strong').textContent === '22/100'");
      await capture(`pain-${scene}${scene === 5 ? `-hit-${hit}` : ""}`);
    }
  }
  await check("retry rewinds the project", "document.querySelector('.pain-health strong').textContent === '100/100'");
  await evaluate("document.querySelector('.pain-next').click()");
  await until(() => evaluate("!document.querySelector('[data-pain-frame]') && document.body.innerText.includes('Thomas')"), "replay in existing demo");
  await check("replay bypasses player selection", "!document.body.innerText.includes('Choose your player') && location.search.includes('player=house')");
  await navigate("?pain=1&still=1");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 });
  await until(() => evaluate("document.querySelector('[data-pain-frame]')?.dataset.painFrame === '1'"), "clicker next");
  checks.push("presenter clicker advances exactly once");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 });
  await until(() => evaluate("document.querySelector('[data-pain-frame]')?.dataset.painFrame === '0'"), "clicker back");
  checks.push("presenter clicker goes back");
  await evaluate("document.querySelector('.pain-next').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await until(() => evaluate("document.querySelector('[data-pain-frame]')?.dataset.painFrame === '1'"), "focused button Enter");
  await pause(100);
  await check("Enter on a focused button advances exactly once", "document.querySelector('[data-pain-frame]')?.dataset.painFrame === '1'");
  await evaluate("document.querySelector('.pain-skip').click()");
  await until(() => evaluate("document.body.innerText.includes('Choose your player')"), "skip opens players");
  checks.push("skip opens existing player selector");
  await navigate("?demo=intent", "document.body.innerText.includes('Are you planning to buy a home?')");
  await check("existing intent backup bypasses intro", "!document.querySelector('[data-pain-frame]')");
  await navigate("?player=business&demo=live", "document.body.innerText.includes('Your plan is live')");
  await check("existing business backup bypasses intro", "!document.querySelector('[data-pain-frame]') && document.body.innerText.includes('Lina')");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  for (let scene = 1; scene <= 7; scene++) {
    await navigate(`?pain=${scene}&still=1`);
    await check(`720p scene ${scene}: fits the slide`, "document.documentElement.scrollHeight <= innerHeight + 2");
  }
  await navigate("?pain=5&hit=4&still=1");
  await check("720p projector fits horizontally", "document.documentElement.scrollWidth <= innerWidth");
  await check("720p projector fits vertically", "document.documentElement.scrollHeight <= innerHeight + 2");
  await capture("pain-projector-720p");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const scene of [1, 2, 3, 4, 5, 6, 7]) {
    await navigate(`?pain=${scene}&still=1`);
    await check(`mobile scene ${scene}: no horizontal overflow`, "document.documentElement.scrollWidth <= innerWidth");
    if (scene === 1 || scene === 5) await capture(`pain-mobile-${scene}`, true);
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("?pain=1");
  await check("reduced motion disables ambient animations", "getComputedStyle(document.querySelector('.pain-heart')).animationName === 'none'");
  if (errors.length) throw new Error(`Browser console errors: ${errors.join("; ")}`);
  await rm(join(output, "check-failure.png"), { force: true });
  const report = { base, screenshots: 13, checks, consoleErrors: errors };
  await writeFile(join(output, "checks.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await pause(500);
  // Only remove the exact temporary profile created by this process.
  if (resolve(dirname(profile)) === resolve(tmpdir()) && basename(profile).startsWith("pain-chrome-")) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
