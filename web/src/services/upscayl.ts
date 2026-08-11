const DEFAULT_UPSCAYL_BRIDGE_URL = "http://127.0.0.1:8767";
const UPSCAYL_BRIDGE_URL_KEY = "infinite-canvas:upscayl-bridge-url";
export const UPSCAYL_WARNING_EVENT = "infinite-canvas:upscayl-warning";

type UpscaylResponse = {
    dataUrl?: string;
    error?: string;
};

export type UpscaylResult = {
    dataUrl: string;
    upscaled: boolean;
    error?: string;
};

export function getUpscaylBridgeUrl() {
    if (typeof window === "undefined") return DEFAULT_UPSCAYL_BRIDGE_URL;
    return localStorage.getItem(UPSCAYL_BRIDGE_URL_KEY)?.trim().replace(/\/+$/, "") || DEFAULT_UPSCAYL_BRIDGE_URL;
}

export async function checkLocalUpscayl(signal?: AbortSignal) {
    const response = await fetch(`${getUpscaylBridgeUrl()}/health`, { signal, cache: "no-store" });
    const payload = (await response.json()) as { ok?: boolean; ready?: boolean; error?: string };
    if (!response.ok || !payload.ok || !payload.ready) throw new Error(payload.error || "本机 Upscayl 服务未就绪");
    return payload;
}

export async function upscaleWithLocalUpscayl(dataUrl: string, signal?: AbortSignal) {
    const response = await fetch(`${getUpscaylBridgeUrl()}/upscale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
        signal,
    });
    const payload = (await response.json().catch(() => ({}))) as UpscaylResponse;
    if (!response.ok || !payload.dataUrl) throw new Error(payload.error || `Upscayl 请求失败（HTTP ${response.status}）`);
    return payload.dataUrl;
}

export async function upscaleReturnedImage(dataUrl: string, signal?: AbortSignal): Promise<UpscaylResult> {
    try {
        return { dataUrl: await upscaleWithLocalUpscayl(dataUrl, signal), upscaled: true };
    } catch (error) {
        if (signal?.aborted) throw error;
        const message = error instanceof Error ? error.message : "本机 Upscayl 服务不可用";
        console.warn(`[Upscayl] ${message}`);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(UPSCAYL_WARNING_EVENT, { detail: message }));
        return { dataUrl, upscaled: false, error: message };
    }
}
