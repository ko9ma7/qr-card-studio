import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9223";
const pageUrl = process.argv[2];
const screenshotPath = process.argv[3];
const desktopScreenshotPath = process.argv[4];
if (!pageUrl || !screenshotPath || !desktopScreenshotPath) throw new Error("page URL and screenshot paths are required");

const page = await fetch(`${endpoint}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then(response => response.json());
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });

let id = 0;
const pending = new Map();
ws.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); ws.send(JSON.stringify({ id: messageId, method, params })); });
const evaluate = async expression => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await new Promise(resolve => setTimeout(resolve, 900));

const initial = await evaluate(`({
  title: document.title,
  input: document.querySelector('#url')?.id,
  status: document.querySelector('#statusBadge')?.textContent,
  error: document.querySelector('#fieldMessage')?.textContent
})`);
if (initial.title !== "QR Card Studio | 명함·업무용 QR 코드 만들기" || initial.input !== "url") throw new Error(`initial render failed: ${JSON.stringify(initial)}`);

const urlResult = await evaluate(`(() => {
  document.querySelector('#fillSample').click();
  return {
    status: document.querySelector('#statusBadge').textContent,
    hasSvg: Boolean(document.querySelector('#qrOutput svg')),
    pngDisabled: document.querySelector('#downloadPng').disabled,
    quietViewBox: document.querySelector('#qrOutput svg')?.getAttribute('viewBox')
  };
})()`);
if (urlResult.status !== "생성 완료" || !urlResult.hasSvg || urlResult.pngDisabled) throw new Error(`URL generation failed: ${JSON.stringify(urlResult)}`);

const cardResult = await evaluate(`(() => {
  document.querySelector('[data-type="vcard"]').click();
  document.querySelector('#fillSample').click();
  document.querySelector('#themeToggle').click();
  return {
    status: document.querySelector('#statusBadge').textContent,
    data: window.__testData || document.querySelector('#firstName')?.value,
    dark: document.documentElement.dataset.theme,
    fields: document.querySelectorAll('#dynamicFields input').length
  };
})()`);
if (cardResult.status !== "생성 완료" || cardResult.data !== "길동" || cardResult.dark !== "dark" || cardResult.fields < 8) throw new Error(`vCard flow failed: ${JSON.stringify(cardResult)}`);

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await evaluate("window.scrollTo(0, 520)");
await new Promise(resolve => setTimeout(resolve, 200));
const desktopShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
fs.mkdirSync(path.dirname(desktopScreenshotPath), { recursive: true });
fs.writeFileSync(desktopScreenshotPath, Buffer.from(desktopShot.data, "base64"));

await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await new Promise(resolve => setTimeout(resolve, 300));
const mobile = await evaluate(`({
  viewport: document.documentElement.clientWidth,
  bodyWidth: document.body.scrollWidth,
  previewTop: Math.round(document.querySelector('.preview-card').getBoundingClientRect().top),
  makerTop: Math.round(document.querySelector('.maker-card').getBoundingClientRect().top)
})`);
if (mobile.bodyWidth > mobile.viewport || mobile.previewTop <= mobile.makerTop) throw new Error(`mobile layout failed: ${JSON.stringify(mobile)}`);

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
fs.writeFileSync(screenshotPath, Buffer.from(shot.data, "base64"));
console.log(JSON.stringify({ initial, urlResult, cardResult, mobile, screenshotPath, desktopScreenshotPath }, null, 2));
ws.close();
