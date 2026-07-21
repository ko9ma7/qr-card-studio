import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9223";
const pageUrl = process.argv[2];
const screenshotPath = process.argv[3];
const desktopScreenshotPath = process.argv[4];
const downloadPath = process.argv[5];
if (!pageUrl || !screenshotPath || !desktopScreenshotPath || !downloadPath) throw new Error("page URL, screenshot paths, and download path are required");

const page = await fetch(`${endpoint}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then(response => response.json());
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });

let id = 0;
const pending = new Map();
const runtimeExceptions = [];
const consoleErrors = [];
ws.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") runtimeExceptions.push(message.params.exceptionDetails.text);
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push(message.params.args.map(arg => arg.value || arg.description).join(" "));
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
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath });
await new Promise(resolve => setTimeout(resolve, 900));

const initial = await evaluate(`({
  title: document.title,
  input: document.querySelector('#url')?.id,
  status: document.querySelector('#statusBadge')?.textContent,
  error: document.querySelector('#fieldMessage')?.textContent
})`);
if (initial.title !== "QR Card Studio | 명함·업무용 QR 코드 만들기" || initial.input !== "url") throw new Error(`initial render failed: ${JSON.stringify(initial)}`);

await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied = text; } } })`);
const typeResults = [];
const typeCases = {
  url: [1, 'https://'], vcard: [8, 'BEGIN:VCARD'], text: [1, 'QR Card Studio'], email: [3, 'mailto:'], sms: [2, 'SMSTO:'], wifi: [4, 'WIFI:'],
  kakao: [1, 'https://'], whatsapp: [2, 'https://wa.me/'], youtube: [1, 'https://'], geo: [2, 'geo:'], event: [5, 'BEGIN:VCALENDAR'], crypto: [3, 'bitcoin:']
};
for (const [type, [expectedFields, prefix]] of Object.entries(typeCases)) {
  const result = await evaluate(`(async () => {
    document.querySelector('[data-type="${type}"]').click();
    document.querySelector('#fillSample').click();
    window.__copied = '';
    document.querySelector('#copyData').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      type: '${type}',
      fields: document.querySelectorAll('#dynamicFields input, #dynamicFields textarea, #dynamicFields select').length,
      status: document.querySelector('#statusBadge').textContent,
      message: document.querySelector('#fieldMessage').textContent,
      hasSvg: Boolean(document.querySelector('#qrOutput svg')),
      buttonsEnabled: !document.querySelector('#downloadPng').disabled && !document.querySelector('#downloadSvg').disabled && !document.querySelector('#copyData').disabled,
      payload: window.__copied
    };
  })()`);
  if (result.fields !== expectedFields || result.status !== "생성 완료" || result.message || !result.hasSvg || !result.buttonsEnabled || !result.payload.startsWith(prefix)) throw new Error(`${type} flow failed: ${JSON.stringify(result)}`);
  typeResults.push({ ...result, payload: `${result.payload.slice(0, 36)}${result.payload.length > 36 ? '…' : ''}` });
}

const validationResults = await evaluate(`(() => {
  document.querySelector('[data-type="email"]').click();
  document.querySelector('#emailTo').value = 'wrong-address';
  document.querySelector('#emailTo').dispatchEvent(new Event('input', { bubbles: true }));
  const email = document.querySelector('#fieldMessage').textContent;
  document.querySelector('[data-type="url"]').click();
  document.querySelector('#fillSample').click();
  document.querySelector('#bgColor').value = '#172554';
  document.querySelector('#bgColor').dispatchEvent(new Event('input', { bubbles: true }));
  const contrast = document.querySelector('#fieldMessage').textContent;
  document.querySelector('#bgColor').value = '#ffffff';
  document.querySelector('#bgColor').dispatchEvent(new Event('input', { bubbles: true }));
  return { email, contrast, recovered: document.querySelector('#statusBadge').textContent };
})()`);
if (!validationResults.email.includes("이메일") || !validationResults.contrast.includes("대비") || validationResults.recovered !== "생성 완료") throw new Error(`validation feedback failed: ${JSON.stringify(validationResults)}`);

const logoResult = await evaluate(`(async () => {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], 'test-logo.png', { type: 'image/png' }));
  Object.defineProperty(document.querySelector('#logoUpload'), 'files', { configurable: true, value: transfer.files });
  document.querySelector('#logoUpload').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  return { name: document.querySelector('#logoName').textContent, hasImage: Boolean(document.querySelector('#qrOutput svg image')), clearVisible: !document.querySelector('#clearLogo').hidden };
})()`);
if (logoResult.name !== "test-logo.png" || !logoResult.hasImage || !logoResult.clearVisible) throw new Error(`logo flow failed: ${JSON.stringify(logoResult)}`);

const copyFallback = await evaluate(`(async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
  window.__fallbackCopied = '';
  const original = document.execCommand;
  document.execCommand = command => { if (command === 'copy') window.__fallbackCopied = document.activeElement.value; return true; };
  document.querySelector('#copyData').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  document.execCommand = original;
  return { copied: window.__fallbackCopied, toast: document.querySelector('#toast').textContent };
})()`);
if (!copyFallback.copied.startsWith("https://") || !copyFallback.toast.includes("복사했습니다")) throw new Error(`copy fallback failed: ${JSON.stringify(copyFallback)}`);

await evaluate(`(() => { document.querySelector('#downloadSvg').click(); document.querySelector('#downloadPng').click(); })()`);
await new Promise(resolve => setTimeout(resolve, 1400));
const downloads = fs.readdirSync(downloadPath).map(name => ({ name, size: fs.statSync(path.join(downloadPath, name)).size }));
if (!downloads.some(file => file.name.endsWith(".svg") && file.size > 100) || !downloads.some(file => file.name.endsWith(".png") && file.size > 100)) throw new Error(`downloads failed: ${JSON.stringify(downloads)}`);

const resetAndTheme = await evaluate(`(() => {
  document.querySelector('#themeToggle').click();
  const theme = document.documentElement.dataset.theme;
  document.querySelector('#resetAll').click();
  return { theme, status: document.querySelector('#statusBadge').textContent, logo: document.querySelector('#logoName').textContent, frame: document.querySelector('#frameStyle').value, fg: document.querySelector('#fgColor').value, bg: document.querySelector('#bgColor').value };
})()`);
if (resetAndTheme.theme !== "dark" || resetAndTheme.status !== "입력 대기" || resetAndTheme.logo !== "선택된 이미지 없음" || resetAndTheme.frame !== "none" || resetAndTheme.fg !== "#172554" || resetAndTheme.bg !== "#ffffff") throw new Error(`reset/theme failed: ${JSON.stringify(resetAndTheme)}`);

await evaluate(`(() => { document.querySelector('[data-type="text"]').click(); document.querySelector('#fillSample').click(); document.querySelector('#frameStyle').value='label'; document.querySelector('#frameStyle').dispatchEvent(new Event('input', { bubbles:true })); })()`);

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
if (runtimeExceptions.length || consoleErrors.length) throw new Error(`browser errors: ${JSON.stringify({ runtimeExceptions, consoleErrors })}`);
console.log(JSON.stringify({ initial, typeResults, validationResults, logoResult, copyFallback: { copied: copyFallback.copied.slice(0, 36), toast: copyFallback.toast }, downloads, resetAndTheme, mobile, runtimeExceptions, consoleErrors, screenshotPath, desktopScreenshotPath }, null, 2));
ws.close();
