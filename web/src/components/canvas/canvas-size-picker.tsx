import { useEffect, useRef, useState } from "react";
import { Select } from "antd";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const sizeOptions = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
const posterSizeOptions = [
    { value: "1712x3840", label: "80x180cm · 1712x3840" },
    { value: "1440x3840", label: "60x160cm · 1440x3840" },
    { value: "1504x3840", label: "78x200cm · 1504x3840" },
    { value: "1888x3840", label: "98x200cm · 1888x3840" },
    { value: "2208x3680", label: "120x200cm · 2208x3680" },
    { value: "2336x3504", label: "60x90cm · 2336x3504" },
    { value: "2400x3360", label: "50x70cm · 2400x3360" },
    { value: "1728x3840", label: "45x100cm · 1728x3840" },
    { value: "1920x3840", label: "100x200cm · 1920x3840" },
] as const;

type CanvasSizePickerProps = {
    value: string;
    className?: string;
    onChange: (value: string) => void;
};

export function CanvasSizePicker({ value, className, onChange }: CanvasSizePickerProps) {
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const extraOptions = [value, search.trim()].filter((item) => item && !sizeOptions.includes(item));
    const knownOptions = [...sizeOptions.map((size) => ({ value: size, label: size })), ...posterSizeOptions];
    const options = [...knownOptions, ...Array.from(new Set(extraOptions)).filter((size) => !knownOptions.some((item) => item.value === size)).map((size) => ({ value: size, label: size }))];
    const selectSize = (next: string) => {
        onChange(next.trim());
        setSearch("");
        setOpen(false);
    };

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target && (rootRef.current?.contains(target) || target.closest(".ant-select-dropdown"))) return;
            setOpen(false);
        };
        window.addEventListener("pointerdown", close, true);
        return () => window.removeEventListener("pointerdown", close, true);
    }, [open]);

    return (
        <div ref={rootRef} className={className}>
            <Select
                showSearch
                open={open}
                className={cn("canvas-compact-control canvas-control-select h-full w-full")}
                value={value || undefined}
                searchValue={search}
                placeholder={t("canvas.controls.ratio")}
                options={options}
                popupMatchSelectWidth={false}
                popupRender={(menu) => (
                    <div onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        {menu}
                    </div>
                )}
                onOpenChange={setOpen}
                onSearch={setSearch}
                onChange={selectSize}
                onBlur={() => {
                    if (search.trim()) selectSize(search);
                }}
                onInputKeyDown={(event) => {
                    if (event.key === "Enter" && search.trim()) selectSize(search);
                }}
            />
        </div>
    );
}
