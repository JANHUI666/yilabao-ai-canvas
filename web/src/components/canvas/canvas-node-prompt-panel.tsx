import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent } from "react";
import { ArrowUp, LoaderCircle, Maximize2, Paperclip, Square, X } from "lucide-react";
import { App, Button, Image, Modal, Tooltip } from "antd";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasPromptImage } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { uploadImage } from "@/services/image-storage";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode; // Plugin nodes set their generation type through useBuiltinPanel.mode.
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onImageSettingsOpenChange, modeOverride }: CanvasNodePromptPanelProps) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    const [uploadingImages, setUploadingImages] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptImages = node.metadata?.promptImages || [];
    const imageReferences = useMemo(() => buildPromptImageReferences(node, mentionReferences, promptImages), [mentionReferences, node, promptImages]);
    const chipReferences = useMemo(() => [...mentionReferences.filter((reference) => reference.kind !== "image"), ...imageReferences], [imageReferences, mentionReferences]);

    // Restore prompts only when switching nodes; preserve the current input after generation on the same node.
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (isEditingExistingContent) onConfigChange(node.id, { composerContent: value });
        else onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
    };

    const openExpandedEditor = () => {
        setExpanded(true);
    };

    const addImages = async (files: File[]) => {
        const available = MAX_PROMPT_IMAGES - promptImages.length;
        const images = files.filter(isImageFile).slice(0, Math.max(0, available));
        if (!images.length) {
            message.warning(promptImages.length >= MAX_PROMPT_IMAGES ? t("canvas.promptPanel.imageLimit", { count: MAX_PROMPT_IMAGES }) : t("canvas.promptPanel.imageOnly"));
            return;
        }
        if (images.some((file) => file.size > MAX_PROMPT_IMAGE_BYTES)) {
            message.warning(t("canvas.promptPanel.imageTooLarge", { size: MAX_PROMPT_IMAGE_MB }));
            return;
        }
        setUploadingImages(true);
        try {
            const uploaded = await Promise.all(
                images.map(async (file) => {
                    const image = await uploadImage(file);
                    return {
                        id: nanoid(),
                        name: file.name || `reference-${Date.now()}.png`,
                        type: image.mimeType || file.type || "image/png",
                        previewUrl: image.url,
                        storageKey: image.storageKey,
                        naturalWidth: image.width,
                        naturalHeight: image.height,
                        bytes: image.bytes,
                    } satisfies CanvasPromptImage;
                }),
            );
            onConfigChange(node.id, { promptImages: [...promptImages, ...uploaded] });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.promptPanel.imageUploadFailed"));
        } finally {
            setUploadingImages(false);
        }
    };

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
        const files = Array.from(event.clipboardData.items)
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
        if (!files.length) return;
        event.preventDefault();
        void addImages(files);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        const files = Array.from(event.dataTransfer.files).filter(isImageFile);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        void addImages(files);
    };

    const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (files.length) void addImages(files);
    };

    const removePromptImage = (imageId: string) => {
        onConfigChange(node.id, { promptImages: promptImages.filter((image) => image.id !== imageId) });
    };

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onPaste={handlePaste}
            onDragOver={(event) => {
                if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) event.preventDefault();
            }}
            onDrop={handleDrop}
        >
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileInput} />
            {imageReferences.length ? (
                <div className="thin-scrollbar mb-2 flex min-h-[76px] gap-2 overflow-x-auto pb-1" aria-label={t("canvas.promptPanel.referenceImages")}>
                    {imageReferences.map((reference) => (
                        <div key={reference.id} className="relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-md border" style={{ borderColor: theme.toolbar.border }}>
                            <button type="button" className="block size-full" onClick={() => setImagePreview(reference.previewUrl || null)} aria-label={t("canvas.promptPanel.previewReference", { label: reference.label })}>
                                <img src={reference.previewUrl} alt={reference.label} className="size-full bg-black/5 object-contain" />
                                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[11px] leading-4 text-white">{reference.label}</span>
                            </button>
                            {reference.promptImageId ? (
                                <button type="button" className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/65 text-white hover:bg-black/80" onClick={() => removePromptImage(reference.promptImageId!)} aria-label={t("canvas.promptPanel.removeReference", { label: reference.label })}>
                                    <X className="size-3" />
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
            <CanvasPromptChipInput
                value={prompt}
                references={chipReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                className="thin-scrollbar h-40 w-full cursor-text resize-none rounded-xl px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: "transparent", color: theme.node.text }}
                placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                        <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={<Maximize2 className="size-3.5" />} onClick={openExpandedEditor} aria-label={t("canvas.promptPanel.expandEditor")} />
                    </Tooltip>
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <Tooltip title={t("canvas.promptPanel.addReference")}>
                            <Button
                                type="text"
                                loading={uploadingImages}
                                className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0"
                                style={{ color: theme.node.text }}
                                icon={uploadingImages ? undefined : <Paperclip className="size-4" />}
                                onClick={() => fileInputRef.current?.click()}
                                aria-label={t("canvas.promptPanel.addReference")}
                            />
                        </Tooltip>
                    ) : null}
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasTextSettingsPopover config={config} onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })} />
                        </>
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    danger={isRunning}
                    disabled={!isRunning && !prompt.trim()}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">{t("canvas.promptPanel.stop")}</span>
                            </>
                        ) : (
                            <ArrowUp className="size-4" />
                        )}
                    </span>
                </Button>
            </div>
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <CanvasPromptChipInput
                        value={prompt}
                        references={chipReferences}
                        onChange={updatePrompt}
                        className="thin-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-xl border p-4 text-[15px] leading-6 outline-none"
                        style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
                    />
                </div>
            </Modal>
            {imagePreview ? <Image src={imagePreview} alt={t("canvas.promptPanel.referencePreview")} style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );
}

const MAX_PROMPT_IMAGES = 10;
const MAX_PROMPT_IMAGE_MB = 25;
const MAX_PROMPT_IMAGE_BYTES = MAX_PROMPT_IMAGE_MB * 1024 * 1024;

type PromptImageReference = CanvasResourceReference & { promptImageId?: string };

function buildPromptImageReferences(node: CanvasNodeData, references: CanvasResourceReference[], promptImages: CanvasPromptImage[]): PromptImageReference[] {
    const connected = references.filter((reference) => reference.kind === "image" && reference.previewUrl && reference.nodeId !== node.id);
    const source = node.type === CanvasNodeType.Image && node.metadata?.content ? [{ id: `source:${node.id}`, nodeId: node.id, kind: "image" as const, title: node.title, previewUrl: node.metadata.content, active: true }] : [];
    return [
        ...source,
        ...connected,
        ...promptImages.map((image) => ({ id: `prompt:${image.id}`, nodeId: image.id, kind: "image" as const, title: image.name, previewUrl: image.previewUrl, active: true, promptImageId: image.id })),
    ].map((reference, index) => ({ ...reference, label: imageReferenceLabel(index) }));
}

function isImageFile(file: File) {
    return file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    return {
        ...globalConfig,
        model: resolveModelForCapability(globalConfig, node.metadata?.model, mode),
        reasoningEffort: node.metadata?.reasoningEffort || globalConfig.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        background: node.metadata?.background ?? globalConfig.background ?? defaultConfig.background,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
