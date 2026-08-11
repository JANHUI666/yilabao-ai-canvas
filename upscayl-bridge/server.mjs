import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.UPSCAYL_BRIDGE_PORT || 8766);
const UPSCAYL_EXE = process.env.UPSCAYL_EXE || "C:\\Program Files\\Upscayl\\resources\\bin\\upscayl-bin.exe";
const UPSCAYL_MODELS = process.env.UPSCAYL_MODELS || "C:\\Program Files\\Upscayl\\resources\\models";
const MAX_BODY_BYTES = 80 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

let workQueue = Promise.resolve();

const server = createServer(async (request, response) => {
    setCorsHeaders(response);
    if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
    }

    if (request.method === "GET" && request.url === "/health") {
        const ready = existsSync(UPSCAYL_EXE) && existsSync(UPSCAYL_MODELS);
        sendJson(response, ready ? 200 : 503, {
            ok: true,
            ready,
            scale: 2,
            model: "upscayl-standard-4x",
            ...(ready ? {} : { error: "未找到 Upscayl 程序或模型目录，请确认 Upscayl 已安装在默认位置。" }),
        });
        return;
    }

    if (request.method !== "POST" || request.url !== "/upscale") {
        sendJson(response, 404, { error: "接口不存在" });
        return;
    }

    if (!existsSync(UPSCAYL_EXE) || !existsSync(UPSCAYL_MODELS)) {
        sendJson(response, 503, { error: "未找到 Upscayl，请先安装 Upscayl 2.15.0。" });
        return;
    }

    try {
        const payload = JSON.parse((await readRequestBody(request)).toString("utf8"));
        const image = parseImageDataUrl(payload?.dataUrl);
        const dataUrl = await enqueue(() => upscaleImage(image));
        sendJson(response, 200, { dataUrl });
    } catch (error) {
        sendJson(response, error?.code === "BODY_TOO_LARGE" ? 413 : 500, { error: error instanceof Error ? error.message : "Upscayl 处理失败" });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Upscayl x2 服务已启动：http://${HOST}:${PORT}`);
    console.log("请保持此窗口打开，然后回到易拉宝 AI 画布使用。");
});

function setCorsHeaders(response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Cache-Control", "no-store");
}

function sendJson(response, status, payload) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                const error = new Error("图片文件过大，单张不能超过 80 MB。");
                error.code = "BODY_TOO_LARGE";
                reject(error);
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => resolve(Buffer.concat(chunks)));
        request.on("error", reject);
    });
}

function parseImageDataUrl(value) {
    if (typeof value !== "string") throw new Error("没有收到图片数据。");
    const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
    if (!match) throw new Error("图片格式不正确，请使用 PNG、JPG 或 WebP 图片。");
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) throw new Error("图片内容为空。");
    return buffer;
}

function enqueue(task) {
    const result = workQueue.then(task);
    workQueue = result.catch(() => undefined);
    return result;
}

async function upscaleImage(buffer) {
    const directory = await mkdtemp(join(tmpdir(), "yilabao-upscayl-"));
    const inputPath = join(directory, "input.png");
    const outputPath = join(directory, "output-x2.png");
    try {
        await writeFile(inputPath, buffer);
        await runUpscayl(inputPath, outputPath);
        const output = await readFile(outputPath);
        return `data:image/png;base64,${output.toString("base64")}`;
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

function runUpscayl(inputPath, outputPath) {
    const args = ["-i", inputPath, "-o", outputPath, "-m", UPSCAYL_MODELS, "-n", "upscayl-standard-4x", "-z", "4", "-s", "2", "-t", "128", "-f", "png"];
    return new Promise((resolve, reject) => {
        const child = spawn(UPSCAYL_EXE, args, { windowsHide: true });
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("Upscayl 处理超过 30 分钟，已停止。"));
        }, PROCESS_TIMEOUT_MS);
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0 && existsSync(outputPath)) resolve();
            else reject(new Error(stderr.trim() || `Upscayl 处理失败（退出码 ${code ?? "未知"}）`));
        });
    });
}
