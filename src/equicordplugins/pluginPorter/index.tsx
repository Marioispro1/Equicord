/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { EquicordDevs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { TextArea, Toasts, useMemo, useState } from "@webpack/common";

function toBase64(text: string) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(base64: string) {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function isSafeObject(obj: any): boolean {
    if (obj == null || typeof obj !== "object") return true;
    for (const key in obj) {
        if (["__proto__", "constructor", "prototype"].includes(key)) return false;
        if (!isSafeObject(obj[key])) return false;
    }
    return true;
}

function exportPlugins() {
    return toBase64(JSON.stringify({ plugins: PlainSettings.plugins }));
}

type PluginData = Record<string, { enabled?: boolean;[setting: string]: any; }>;

function decodeExport(base64: string): PluginData {
    let parsed: any;
    try {
        parsed = JSON.parse(fromBase64(base64.trim()));
    } catch {
        throw new Error("Invalid code. Make sure you pasted the full export.");
    }

    if (!isSafeObject(parsed) || typeof parsed.plugins !== "object" || parsed.plugins === null)
        throw new Error("This code does not contain plugin data.");

    return parsed.plugins;
}

function parsePreview(json: string): PluginData {
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error("The edited JSON is invalid.");
    }

    if (!isSafeObject(parsed) || typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        throw new Error("The edited JSON must be an object of plugins.");

    return parsed;
}

async function importPlugins(plugins: PluginData, included: Set<string>) {
    for (const [name, data] of Object.entries(plugins)) {
        if (!included.has(name) || typeof data !== "object" || data === null) continue;
        PlainSettings.plugins[name] = { ...PlainSettings.plugins[name], ...data };
    }

    await VencordNative.settings.set(PlainSettings);
}

const toast = (type: string, message: string) =>
    Toasts.show({ type, message, id: Toasts.genId() });

function PorterComponent() {
    const [code, setCode] = useState("");
    const [json, setJson] = useState<string | null>(null);
    const [excluded, setExcluded] = useState<Set<string>>(new Set());

    const [plugins, jsonError] = useMemo(() => {
        if (json === null) return [null, null] as const;
        try {
            return [parsePreview(json), null] as const;
        } catch (err) {
            return [null, (err as Error).message] as const;
        }
    }, [json]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Button onClick={() => copyWithToast(exportPlugins(), "Plugin export copied to clipboard!")}>
                Export plugins to clipboard
            </Button>
            <TextArea
                value={code}
                onChange={setCode}
                placeholder="Paste an export code here"
            />
            <Button
                disabled={!code.trim()}
                onClick={() => {
                    try {
                        const decoded = decodeExport(code);
                        setJson(JSON.stringify(decoded, null, 4));
                        setExcluded(new Set());
                    } catch (err) {
                        toast(Toasts.Type.FAILURE, (err as Error).message);
                    }
                }}
            >
                Preview import
            </Button>
            {plugins !== null && (
                <>
                    {(Object.entries(plugins) as [string, PluginData[string]][]).map(([name, data]) => (
                        <div key={name}>
                            <FormSwitch
                                title={name}
                                description={`${data?.enabled ? "Enabled" : "Disabled"}, ${Math.max(Object.keys(data ?? {}).length - 1, 0)} settings`}
                                value={!excluded.has(name)}
                                onChange={v => {
                                    const next = new Set(excluded);
                                    v ? next.delete(name) : next.add(name);
                                    setExcluded(next);
                                }}
                                hideBorder
                            />
                        </div>
                    ))}
                </>
            )}
            {json !== null && (
                <>
                    <TextArea
                        value={json}
                        onChange={setJson}
                        rows={12}
                    />
                    {jsonError && <span style={{ color: "var(--text-danger)" }}>{jsonError}</span>}
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button
                            disabled={plugins === null}
                            onClick={async () => {
                                if (plugins === null) return;
                                try {
                                    const included = new Set(Object.keys(plugins).filter(name => !excluded.has(name)));
                                    await importPlugins(plugins, included);
                                    setCode("");
                                    setJson(null);
                                    toast(Toasts.Type.SUCCESS, "Plugins imported. Restart to apply changes!");
                                } catch (err) {
                                    toast(Toasts.Type.FAILURE, String(err instanceof Error ? err.message : err));
                                }
                            }}
                        >
                            Import {plugins ? Object.keys(plugins).length - excluded.size : 0} plugins
                        </Button>
                        <Button variant="secondary" onClick={() => setJson(null)}>
                            Cancel
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

const settings = definePluginSettings({
    porter: {
        type: OptionType.COMPONENT,
        component: PorterComponent
    }
});

export default definePlugin({
    name: "PluginPorter",
    description: "Export all of your plugins and their settings as a base64 code and import them on another device.",
    authors: [EquicordDevs.Marioispro1],
    settings
});
