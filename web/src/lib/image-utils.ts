import i18n from "@/i18n";
import type { ReferenceImage } from "@/types/image";

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number) {
    const value = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes ? i18n.t("common.durationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") }) : i18n.t("common.durationSeconds", { seconds });
}

export function getDataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        return 0;
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(file);
    });
}

export function readImageMeta(dataUrl: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve) => {
        const image = new Image();
        const done = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024, mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" });
        image.onload = done;
        image.onerror = done;
        setTimeout(done, 3000);
        image.src = dataUrl;
    });
}

export type MaskedEditRegion = { x: number; y: number; width: number; height: number };

export async function prepareMaskedEdit(originalDataUrl: string, editMaskDataUrl: string) {
    const [original, mask] = await Promise.all([loadImage(originalDataUrl), loadImage(editMaskDataUrl)]);
    const imageWidth = original.naturalWidth || original.width;
    const imageHeight = original.naturalHeight || original.height;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = imageWidth;
    maskCanvas.height = imageHeight;
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!maskContext) {
        return { sourceDataUrl: originalDataUrl, maskDataUrl: editMaskDataUrl, region: { x: 0, y: 0, width: imageWidth, height: imageHeight } };
    }

    maskContext.drawImage(mask, 0, 0, imageWidth, imageHeight);
    const pixels = maskContext.getImageData(0, 0, imageWidth, imageHeight).data;
    let minX = imageWidth;
    let minY = imageHeight;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < imageHeight; y += 1) {
        for (let x = 0; x < imageWidth; x += 1) {
            if (pixels[(y * imageWidth + x) * 4 + 3] >= 128) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) {
        return { sourceDataUrl: originalDataUrl, maskDataUrl: editMaskDataUrl, region: { x: 0, y: 0, width: imageWidth, height: imageHeight } };
    }

    const selectionWidth = maxX - minX + 1;
    const selectionHeight = maxY - minY + 1;
    const padding = Math.max(64, Math.round(Math.max(selectionWidth, selectionHeight) * 0.45));
    const cropWidth = Math.min(imageWidth, Math.max(1024, selectionWidth + padding * 2));
    const cropHeight = Math.min(imageHeight, Math.max(1024, selectionHeight + padding * 2));
    const centerX = minX + selectionWidth / 2;
    const centerY = minY + selectionHeight / 2;
    const region: MaskedEditRegion = {
        x: Math.max(0, Math.min(imageWidth - cropWidth, Math.round(centerX - cropWidth / 2))),
        y: Math.max(0, Math.min(imageHeight - cropHeight, Math.round(centerY - cropHeight / 2))),
        width: cropWidth,
        height: cropHeight,
    };
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = region.width;
    sourceCanvas.height = region.height;
    sourceCanvas.getContext("2d")?.drawImage(original, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    const croppedMaskCanvas = document.createElement("canvas");
    croppedMaskCanvas.width = region.width;
    croppedMaskCanvas.height = region.height;
    croppedMaskCanvas.getContext("2d")?.drawImage(maskCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    return { sourceDataUrl: sourceCanvas.toDataURL("image/png"), maskDataUrl: croppedMaskCanvas.toDataURL("image/png"), region };
}

/**
 * Merge an edit result back over the original image. The edit mask generated by
 * the canvas is white/opaque outside the selection and transparent inside it,
 * matching the OpenAI image-editing convention.
 */
export async function compositeMaskedImage(originalDataUrl: string, generatedDataUrl: string, editMaskDataUrl: string, region?: MaskedEditRegion) {
    const [original, generated, mask] = await Promise.all([loadImage(originalDataUrl), loadImage(generatedDataUrl), loadImage(editMaskDataUrl)]);
    const canvas = document.createElement("canvas");
    canvas.width = original.naturalWidth || original.width;
    canvas.height = original.naturalHeight || original.height;
    const context = canvas.getContext("2d");
    if (!context) return originalDataUrl;

    context.drawImage(original, 0, 0, canvas.width, canvas.height);
    const target = region || { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const editedLayer = document.createElement("canvas");
    editedLayer.width = target.width;
    editedLayer.height = target.height;
    const editedContext = editedLayer.getContext("2d");
    if (!editedContext) return canvas.toDataURL("image/png");
    editedContext.drawImage(generated, 0, 0, target.width, target.height);
    editedContext.globalCompositeOperation = "destination-out";
    editedContext.drawImage(mask, 0, 0, target.width, target.height);
    context.drawImage(editedLayer, target.x, target.y);
    return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        image.src = dataUrl;
    });
}

export function dataUrlToFile(image: ReferenceImage) {
    const [header, content] = image.dataUrl.split(",", 2);
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || image.type || "image/png";
    const binary = atob(content || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], image.name || "reference.png", { type: mimeType });
}
