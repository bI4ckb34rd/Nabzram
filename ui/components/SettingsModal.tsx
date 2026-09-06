import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from './Modal';
import * as api from '../services/api';
import { RoutingRule, SettingsUpdate, WarpStatusResponse } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import CustomSelect, { SelectOption } from './CustomSelect';
import RoutingRulesEditor from './RoutingRulesEditor';

interface SettingsModalProps {
    onClose: () => void;
    onSaveSuccess: () => void;
    isVpnActive: boolean;
}

const logLevelOptions: SelectOption[] = [
    { value: '', label: 'Default' },
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'none', label: 'None' },
];

const tunRoutingOptions: SelectOption[] = [
    { value: 'ipv4_ipv6', label: 'IPv4 and IPv6' },
    { value: 'ipv4', label: 'IPv4' },
    { value: 'ipv6', label: 'IPv6' },
];

const rulesEqual = (a: RoutingRule[] = [], b: RoutingRule[] = []) =>
    JSON.stringify(a) === JSON.stringify(b);

const TabButton: React.FC<{
    tabName: string;
    currentTab: string;
    setTab: (tabName: string) => void;
    children: React.ReactNode;
}> = ({ tabName, currentTab, setTab, children }) => {
    const isActive = tabName === currentTab;
    return (
        <button
            type="button"
            onClick={() => setTab(tabName)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-selected={isActive}
            role="tab"
        >
            {children}
        </button>
    );
};

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSaveSuccess, isVpnActive }) => {
    const { setTheme, themes, theme: currentThemeName, font, setFont } = useTheme();
    const [settings, setSettings] = useState<SettingsUpdate>({ routing_rules: [], dns_hijack: true, tun_routing: 'ipv4_ipv6' });
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingXray, setIsApplyingXray] = useState(false);
    const [isSavingRouting, setIsSavingRouting] = useState(false);
    const [fontInput, setFontInput] = useState(font);
    const [activeTab, setActiveTab] = useState<'general' | 'routing' | 'warp' | 'appearance'>('general');
    const [xrayBinaryInput, setXrayBinaryInput] = useState('');
    const { addToast } = useToast();

    // WARP state
    const [warpStatus, setWarpStatus] = useState<WarpStatusResponse | null>(null);
    const [warpLoadingAction, setWarpLoadingAction] = useState<string | null>(null);

    // Ref to hold the initially loaded settings to prevent auto-saving on mount
    const initialSettings = useRef<SettingsUpdate | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            const currentSettings = await api.getSettings();
            const fetchedSettings = {
                socks_port: currentSettings.socks_port ?? undefined,
                http_port: currentSettings.http_port ?? undefined,
                xray_binary: currentSettings.xray_binary ?? undefined,
                xray_assets_folder: currentSettings.xray_assets_folder ?? undefined,
                xray_log_level: currentSettings.xray_log_level ?? undefined,
                system_proxy: currentSettings.system_proxy ?? false,
                tun_mode: currentSettings.tun_mode ?? false,
                tun_routing: currentSettings.tun_routing ?? 'ipv4_ipv6',
                dns_hijack: currentSettings.dns_hijack ?? true,
                routing_rules: currentSettings.routing_rules ?? [],
                warp_enabled: currentSettings.warp_enabled ?? false,
                warp_route_all: currentSettings.warp_route_all ?? false,
            };
            setSettings(fetchedSettings);
            setXrayBinaryInput(currentSettings.xray_binary ?? '');
            initialSettings.current = fetchedSettings;

            // Fetch WARP status
            const warpRes = await api.getWarpStatus();
            setWarpStatus(warpRes);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load settings';
            addToast(message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Auto-save for immediate changes (system proxy, log level)
    useEffect(() => {
        if (!initialSettings.current) return; // Don't run on initial mount

        const changes: SettingsUpdate = {};
        if (settings.system_proxy !== initialSettings.current.system_proxy) {
            changes.system_proxy = settings.system_proxy;
        }
        if (settings.tun_mode !== initialSettings.current.tun_mode) {
            changes.tun_mode = settings.tun_mode;
        }
        if (settings.tun_routing !== initialSettings.current.tun_routing) {
            changes.tun_routing = settings.tun_routing;
        }
        if (settings.dns_hijack !== initialSettings.current.dns_hijack) {
            changes.dns_hijack = settings.dns_hijack;
        }
        if (settings.warp_route_all !== initialSettings.current.warp_route_all) {
            changes.warp_route_all = settings.warp_route_all;
        }
        if (settings.xray_log_level !== initialSettings.current.xray_log_level) {
            changes.xray_log_level = settings.xray_log_level || null;
        }

        if (Object.keys(changes).length > 0) {
            api.updateSettings(changes)
                .then(() => {
                    // Update the initial state to prevent re-saving
                    initialSettings.current = { ...initialSettings.current, ...changes };
                })
                .catch(err => {
                    const message = err instanceof Error ? err.message : 'Failed to save setting';
                    addToast(message, 'error');
                });
        }
    }, [settings.system_proxy, settings.tun_mode, settings.tun_routing, settings.dns_hijack, settings.warp_route_all, settings.xray_log_level, addToast]);

    // Auto-save with debounce for ports and assets folder
    useEffect(() => {
        if (!initialSettings.current) return;

        const handler = setTimeout(() => {
            const changes: SettingsUpdate = {};
            if (settings.socks_port !== initialSettings.current?.socks_port) {
                changes.socks_port = settings.socks_port ? Number(settings.socks_port) : null;
            }
            if (settings.http_port !== initialSettings.current?.http_port) {
                changes.http_port = settings.http_port ? Number(settings.http_port) : null;
            }
            if (settings.xray_assets_folder !== initialSettings.current?.xray_assets_folder) {
                changes.xray_assets_folder = settings.xray_assets_folder || null;
            }

            if (Object.keys(changes).length > 0) {
                api.updateSettings(changes)
                    .then(() => {
                        initialSettings.current = { ...initialSettings.current, ...changes };
                    })
                    .catch(err => {
                        const message = err instanceof Error ? err.message : 'Failed to auto-save settings';
                        addToast(message, 'error');
                    });
            }
        }, 1000); // 1-second debounce

        return () => {
            clearTimeout(handler);
        };
    }, [settings.socks_port, settings.http_port, settings.xray_assets_folder, addToast]);

    // Debounced save for routing rules
    useEffect(() => {
        if (!initialSettings.current) return;
        if (rulesEqual(settings.routing_rules || [], initialSettings.current.routing_rules || [])) {
            return;
        }

        const handler = setTimeout(() => {
            setIsSavingRouting(true);
            api.updateSettings({ routing_rules: settings.routing_rules || [] })
                .then(() => {
                    if (initialSettings.current) {
                        initialSettings.current = {
                            ...initialSettings.current,
                            routing_rules: settings.routing_rules || [],
                        };
                    }
                })
                .catch(err => {
                    const message = err instanceof Error ? err.message : 'Failed to save routing rules';
                    addToast(message, 'error');
                })
                .finally(() => setIsSavingRouting(false));
        }, 800);

        return () => clearTimeout(handler);
    }, [settings.routing_rules, addToast]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name === 'socks_port' || name === 'http_port') {
            setSettings(prev => ({...prev, [name]: value === '' ? undefined : Number(value) }));
        } else {
            setSettings(prev => ({...prev, [name]: value }));
        }
    };
    
    const handleApplyXrayBinary = async () => {
        setIsApplyingXray(true);
        try {
            await api.updateSettings({ xray_binary: xrayBinaryInput.trim() || null });
            onSaveSuccess(); // This reloads data in App.tsx
            // Manually update settings state after successful apply
            const newPath = xrayBinaryInput.trim() || undefined;
            setSettings(prev => ({...prev, xray_binary: newPath}));
            if (initialSettings.current) {
                initialSettings.current.xray_binary = newPath;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to apply Xray path';
            addToast(message, 'error');
        } finally {
            setIsApplyingXray(false);
        }
    };

    const handleApplyFont = () => {
        const trimmedFont = fontInput.trim();
        setFont(trimmedFont);
    };

    // WARP Actions
    const handleToggleWarp = async () => {
        const targetState = !warpStatus?.enabled;
        setWarpLoadingAction(targetState ? 'enabling' : 'disabling');
        try {
            if (targetState) {
                const res = await api.enableWarp();
                setWarpStatus(res);
                setSettings(prev => ({ ...prev, warp_enabled: true }));
                if (initialSettings.current) initialSettings.current.warp_enabled = true;
                addToast(res.message || 'WARP enabled successfully', 'success');
            } else {
                const res = await api.disableWarp();
                setWarpStatus(res);
                setSettings(prev => ({ ...prev, warp_enabled: false }));
                if (initialSettings.current) initialSettings.current.warp_enabled = false;
                addToast('WARP disabled', 'info');
            }
            onSaveSuccess();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update WARP state';
            addToast(message, 'error');
        } finally {
            setWarpLoadingAction(null);
        }
    };

    const handleGenerateWarpProfile = async () => {
        setWarpLoadingAction('generating_profile');
        try {
            const res = await api.generateWarpProfile();
            setWarpStatus(res);
            addToast(res.message || 'WARP profile generated successfully', 'success');
            onSaveSuccess();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to generate WARP profile';
            addToast(message, 'error');
        } finally {
            setWarpLoadingAction(null);
        }
    };

    const handleUnregisterWarp = async () => {
        setWarpLoadingAction('unregistering');
        try {
            const res = await api.unregisterWarp();
            setWarpStatus(res);
            setSettings(prev => ({ ...prev, warp_enabled: false, warp_route_all: false }));
            if (initialSettings.current) {
                initialSettings.current.warp_enabled = false;
                initialSettings.current.warp_route_all = false;
            }
            addToast('WARP unregistered and credentials removed', 'info');
            onSaveSuccess();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to unregister WARP';
            addToast(message, 'error');
        } finally {
            setWarpLoadingAction(null);
        }
    };

    return (
        <Modal title="Settings" onClose={onClose} bodyClassName="!p-0">
            {isLoading ? (
                <div className="flex justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
            ) : (
                <div>
                    <div className="border-b border-border px-6">
                        <nav className="flex space-x-2" aria-label="Tabs" role="tablist">
                             <TabButton tabName="general" currentTab={activeTab} setTab={() => setActiveTab('general')}>
                                General
                            </TabButton>
                            <TabButton tabName="warp" currentTab={activeTab} setTab={() => setActiveTab('warp')}>
                                WARP
                            </TabButton>
                            <TabButton tabName="routing" currentTab={activeTab} setTab={() => setActiveTab('routing')}>
                                Routing
                            </TabButton>
                            <TabButton tabName="appearance" currentTab={activeTab} setTab={() => setActiveTab('appearance')}>
                                Appearance
                            </TabButton>
                        </nav>
                    </div>

                    <div className="p-6">
                        {activeTab === 'general' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-md font-semibold text-foreground mb-3">VPN Settings</h3>
                                    <div className="space-y-3">
                                     <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <label htmlFor="tun-mode-toggle" className="text-sm font-medium text-foreground select-none">
                                                Enable TUN Mode
                                            </label>
                                            <p className="text-xs text-muted-foreground/80 mt-1">Route all traffic through VPN. Requires Xray 26.7.11+.</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={settings.tun_mode}
                                            onClick={() => setSettings(prev => ({...prev, tun_mode: !prev.tun_mode}))}
                                            disabled={isVpnActive}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 ${
                                                settings.tun_mode ? 'bg-primary' : 'bg-input'
                                            }`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    settings.tun_mode ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <label id="tun-routing-label" className="text-sm font-medium text-foreground select-none">
                                                TUN Routing
                                            </label>
                                            <p className="text-xs text-muted-foreground/80 mt-1">Select IP network stack routed through the TUN interface.</p>
                                        </div>
                                        <div className="w-44">
                                            <CustomSelect
                                                value={settings.tun_routing || 'ipv4_ipv6'}
                                                onChange={(value) => setSettings(prev => ({ ...prev, tun_routing: value as 'ipv4_ipv6' | 'ipv4' | 'ipv6' }))}
                                                options={tunRoutingOptions}
                                                disabled={isVpnActive || !settings.tun_mode}
                                            />
                                        </div>
                                    </div>
                                     <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <label htmlFor="dns-hijack-toggle" className="text-sm font-medium text-foreground select-none">
                                                Enable DNS Hijack
                                            </label>
                                            <p className="text-xs text-muted-foreground/80 mt-1">Route DNS (port 53) through the proxy via dns-out.</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={settings.dns_hijack}
                                            onClick={() => setSettings(prev => ({...prev, dns_hijack: !prev.dns_hijack}))}
                                            disabled={isVpnActive}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 ${
                                                settings.dns_hijack ? 'bg-primary' : 'bg-input'
                                            }`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    settings.dns_hijack ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <label htmlFor="system-proxy-toggle" className="text-sm font-medium text-foreground select-none">
                                                Enable System Proxy
                                            </label>
                                            <p className="text-xs text-muted-foreground/80 mt-1">Automatically configure your OS proxy when connected.</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={settings.system_proxy}
                                            onClick={() => setSettings(prev => ({...prev, system_proxy: !prev.system_proxy}))}
                                            disabled={isVpnActive}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 ${
                                                settings.system_proxy ? 'bg-primary' : 'bg-input'
                                            }`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    settings.system_proxy ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    </div>
                                </div>

                                <hr className="border-border"/>

                                <div>
                                    <h3 className="text-md font-semibold text-foreground mb-2">Xray Configuration</h3>
                                    <p className="text-xs text-muted-foreground/80 mb-4">
                                        Changes to ports and asset folder are auto-saved. Binary path requires explicit apply.
                                    </p>
                                    <div>
                                        <label htmlFor="xray_binary" className="block text-sm font-medium text-muted-foreground mb-1">Xray Binary Path</label>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="text"
                                                id="xray_binary"
                                                name="xray_binary"
                                                value={xrayBinaryInput}
                                                onChange={(e) => setXrayBinaryInput(e.target.value)}
                                                className="flex-grow bg-input border border-border rounded-md p-2 text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                                                placeholder="e.g., /usr/local/bin/xray"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleApplyXrayBinary}
                                                disabled={isApplyingXray}
                                                className="bg-secondary text-secondary-foreground font-bold py-2 px-4 rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
                                            >
                                                {isApplyingXray ? 'Applying...' : 'Apply'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label htmlFor="xray_assets_folder" className="block text-sm font-medium text-muted-foreground mb-1">Xray Assets Folder</label>
                                        <input
                                            type="text"
                                            id="xray_assets_folder"
                                            name="xray_assets_folder"
                                            value={settings.xray_assets_folder ?? ''}
                                            onChange={handleChange}
                                            className="w-full bg-input border border-border rounded-md p-2 text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                                            placeholder="e.g., /usr/local/share/xray"
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <label htmlFor="xray_log_level" className="block text-sm font-medium text-muted-foreground mb-1">Xray Log Level</label>
                                        <CustomSelect
                                            value={settings.xray_log_level ?? ''}
                                            onChange={(value) => setSettings(prev => ({ ...prev, xray_log_level: value }))}
                                            options={logLevelOptions}
                                        />
                                    </div>
                                </div>

                                <hr className="border-border"/>
                                
                                <div>
                                    <h3 className="text-md font-semibold text-foreground mb-2">Proxy Ports</h3>
                                    <p className="text-xs text-muted-foreground/80 mb-4">
                                        Leave blank to use defaults. Changes are saved automatically after you stop typing.
                                    </p>
                                    <div>
                                        <label htmlFor="socks_port" className="block text-sm font-medium text-muted-foreground mb-1">SOCKS Port</label>
                                        <input
                                            type="number"
                                            id="socks_port"
                                            name="socks_port"
                                            value={settings.socks_port ?? ''}
                                            onChange={handleChange}
                                            className="w-full bg-input border border-border rounded-md p-2 text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                                            placeholder="e.g., 1080"
                                            min="0"
                                            max="65535"
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <label htmlFor="http_port" className="block text-sm font-medium text-muted-foreground mb-1">HTTP Port</label>
                                        <input
                                            type="number"
                                            id="http_port"
                                            name="http_port"
                                            value={settings.http_port ?? ''}
                                            onChange={handleChange}
                                            className="w-full bg-input border border-border rounded-md p-2 text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                                            placeholder="e.g., 8080"
                                            min="0"
                                            max="65535"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'warp' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-md font-semibold text-foreground mb-3">Cloudflare WARP</h3>
                                    <p className="text-xs text-muted-foreground/80 mb-4">
                                        Chain a Cloudflare WARP (WireGuard) outbound through your active proxy connection for extra privacy and anti-censorship.
                                    </p>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                            <div>
                                                <label htmlFor="warp-toggle" className="text-sm font-medium text-foreground select-none">
                                                    Enable WARP Chaining
                                                </label>
                                                <p className="text-xs text-muted-foreground/80 mt-1">
                                                    Automatically registers and generates a WireGuard profile if needed.
                                                </p>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                {warpLoadingAction && (
                                                    <span className="text-xs text-primary animate-pulse font-medium">
                                                        {warpLoadingAction === 'enabling' && 'Registering & Generating Profile...'}
                                                        {warpLoadingAction === 'disabling' && 'Disabling WARP...'}
                                                        {warpLoadingAction === 'generating_profile' && 'Generating Profile...'}
                                                        {warpLoadingAction === 'unregistering' && 'Unregistering...'}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    id="warp-toggle"
                                                    role="switch"
                                                    aria-checked={warpStatus?.enabled ?? false}
                                                    onClick={handleToggleWarp}
                                                    disabled={warpLoadingAction !== null}
                                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 ${
                                                        warpStatus?.enabled ? 'bg-primary' : 'bg-input'
                                                    }`}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                            warpStatus?.enabled ? 'translate-x-5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        {warpStatus?.enabled && (
                                            <>
                                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                                    <div>
                                                        <label htmlFor="warp-route-all-toggle" className="text-sm font-medium text-foreground select-none">
                                                            Route All Traffic Through WARP
                                                        </label>
                                                        <p className="text-xs text-muted-foreground/80 mt-1">
                                                            Adds catch-all rule (port 0-65535 to WARP) at the end of routing rules.
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        id="warp-route-all-toggle"
                                                        role="switch"
                                                        aria-checked={settings.warp_route_all ?? false}
                                                        onClick={() => setSettings(prev => ({ ...prev, warp_route_all: !prev.warp_route_all }))}
                                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 ${
                                                            settings.warp_route_all ? 'bg-primary' : 'bg-input'
                                                        }`}
                                                    >
                                                        <span
                                                            aria-hidden="true"
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                                settings.warp_route_all ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                <div className="p-4 bg-muted/30 border border-border/60 rounded-lg space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium text-foreground">Registration Status</span>
                                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                            warpStatus?.has_account
                                                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                                : 'bg-muted text-muted-foreground'
                                                        }`}>
                                                            {warpStatus?.has_account ? 'Registered' : 'Not Registered'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium text-foreground">Profile Status</span>
                                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                            warpStatus?.has_profile
                                                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                                : 'bg-muted text-muted-foreground'
                                                        }`}>
                                                            {warpStatus?.has_profile ? 'Generated (WireGuard ready)' : 'No Profile'}
                                                        </span>
                                                    </div>

                                                    {warpStatus?.profile && (
                                                        <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground space-y-1">
                                                            <div><span className="font-mono text-foreground/80">IPv4:</span> {warpStatus.profile.address_v4}</div>
                                                            <div><span className="font-mono text-foreground/80">Endpoint:</span> {warpStatus.profile.endpoint}</div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2 pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleGenerateWarpProfile}
                                                        disabled={warpLoadingAction !== null}
                                                        className="px-3 py-2 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
                                                    >
                                                        {warpStatus?.has_profile ? 'Regenerate Profile' : 'Generate Profile'}
                                                    </button>

                                                    {warpStatus?.has_account && (
                                                        <button
                                                            type="button"
                                                            onClick={handleUnregisterWarp}
                                                            disabled={warpLoadingAction !== null}
                                                            className="px-3 py-2 text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20 rounded-md hover:bg-destructive/20 transition-colors disabled:opacity-50"
                                                        >
                                                            Unregister WARP
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'routing' && (
                            <div className="space-y-3">
                                {isSavingRouting && (
                                    <p className="text-xs text-muted-foreground">Saving routing rules...</p>
                                )}
                                <RoutingRulesEditor
                                    rules={settings.routing_rules || []}
                                    onChange={(routing_rules) => setSettings(prev => ({ ...prev, routing_rules }))}
                                />
                            </div>
                        )}
                        {activeTab === 'appearance' && (
                             <div className="space-y-6">
                                <div>
                                    <h3 className="text-md font-semibold text-foreground mb-3">Theme</h3>
                                    <p className="text-xs text-muted-foreground/80 mb-4">
                                        Your theme selection is saved automatically.
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {themes.map((theme) => {
                                            const isActive = theme.name === currentThemeName;
                                            return (
                                                <button
                                                    key={theme.name}
                                                    type="button"
                                                    onClick={() => setTheme(theme.name)}
                                                    className={`p-2 rounded-lg border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card ${
                                                        isActive ? 'border-primary' : 'border-transparent hover:border-border'
                                                    }`}
                                                    aria-pressed={isActive}
                                                >
                                                    <div className="w-full h-10 rounded-md flex overflow-hidden mb-2 shadow-inner border border-border/20">
                                                        <div
                                                            className="w-2/3 h-full"
                                                            style={{ backgroundColor: `hsl(${theme.colors['--card']})` }}
                                                        />
                                                        <div
                                                            className="w-1/3 h-full"
                                                            style={{ backgroundColor: `hsl(${theme.colors['--primary']})` }}
                                                        />
                                                    </div>
                                                    <span className={`block text-center text-xs font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
                                                        {theme.displayName}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <hr className="border-border"/>

                                <div>
                                    <h3 className="text-md font-semibold text-foreground mb-3">Font</h3>
                                    <p className="text-xs text-muted-foreground/80 mb-4">
                                        Enter a Google Font name. Leave blank to use the default font.
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={fontInput}
                                            onChange={(e) => setFontInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFont(); }}
                                            className="flex-grow bg-input border border-border rounded-md p-2 text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                                            placeholder="e.g., Roboto (leave blank for default)"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleApplyFont}
                                            className="bg-secondary text-secondary-foreground font-bold py-2 px-4 rounded-md hover:bg-secondary/80 transition-colors"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default SettingsModal;
