import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("HTML file path is required");

const html = fs.readFileSync(file, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n");
new Function(scripts);

const body = html.match(/<textarea[^>]+id="plainBody"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] || "";
const images = [...html.matchAll(/<img[^>]+src="([^"]+)/g)].map(match => match[1]);
const result = {
  scriptSyntax: "ok",
  bodyLength: body.length,
  images,
  copyButtons: (html.match(/data-copy/g) || []).length,
  hasLiveUrl: html.includes("https://ko9ma7.github.io/qr-card-studio/")
};

console.log(JSON.stringify(result, null, 2));
if (body.length < 1500 || images.length < 4 || result.copyButtons < 4 || !result.hasLiveUrl) process.exit(1);
