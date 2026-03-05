"use client";

import { useState, useEffect } from "react";
import { X, Share, PlusSquare } from "lucide-react";

export function InstallPrompt() {
    const [isStandalone, setIsStandalone] = useState(true);
    const [isIOS, setIsIOS] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // 既に閉じた記憶があれば何もしない
        const dismissed = localStorage.getItem("pwa-prompt-dismissed");
        if (dismissed) return;

        // Standaloneモード(PWAとして起動中)か判定
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
            // @ts-ignore iOS Safari用
            window.navigator.standalone === true;

        setIsStandalone(isStandaloneMode);

        if (!isStandaloneMode) {
            // PWAでない場合、OSを判定してモバイル端末なら表示
            const userAgent = window.navigator.userAgent.toLowerCase();
            const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
            const isAndroidDevice = /android/.test(userAgent);

            setIsIOS(isIOSDevice);

            if (isIOSDevice || isAndroidDevice) {
                // 少し遅延させて表示（ロード直後のUIカクツキを防ぐため）
                const timer = setTimeout(() => setShowPrompt(true), 1500);
                return () => clearTimeout(timer);
            }
        }
    }, []);

    if (!showPrompt || isStandalone) return null;

    const dismiss = () => {
        setShowPrompt(false);
        localStorage.setItem("pwa-prompt-dismissed", "true");
    };

    return (
        <div className="fixed top-4 left-4 right-4 z-[100] bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 p-4 flex flex-col gap-3 animate-in slide-in-from-top-4 fade-in duration-500">
            <button
                onClick={dismiss}
                className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full transition-colors"
            >
                <X className="w-4 h-4" />
            </button>

            <div className="flex gap-3 pr-6">
                <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center shrink-0 border border-primary/10">
                    <img src="/apple-icon.png" alt="App Icon" className="w-9 h-9 rounded-lg" />
                </div>
                <div className="flex flex-col justify-center">
                    <h3 className="font-bold text-sm text-gray-900 leading-none mb-1.5">アプリとしてインストール</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        ホーム画面に追加すると、フル画面でより快適にマップをご利用になれます。
                    </p>
                </div>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col gap-2 mt-1">
                {isIOS ? (
                    <div className="text-xs text-gray-700 font-medium flex items-center flex-wrap gap-x-1 gap-y-1.5">
                        画面下の <Share className="w-4 h-4 text-blue-500 font-bold" /> から 「ホーム画面に追加<PlusSquare className="w-4 h-4 text-gray-600 ml-0.5" />」を選択してください。
                    </div>
                ) : (
                    <div className="text-xs text-gray-700 font-medium leading-relaxed">
                        ブラウザのメニュー（︙）から<br />
                        「ホーム画面に追加」を選択してください。
                    </div>
                )}
            </div>
        </div>
    );
}
