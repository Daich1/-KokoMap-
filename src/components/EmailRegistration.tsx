"use client";

import { useState } from "react";
import { Loader2, Mail, Check } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EmailRegistrationProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    currentEmail?: string;
}

export function EmailRegistration({ open, onOpenChange, userId, currentEmail }: EmailRegistrationProps) {
    const [email, setEmail] = useState(currentEmail ?? "");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    async function handleSubmit() {
        setError("");
        setSuccess(false);

        if (!email.trim()) {
            setError("メールアドレスを入力してください");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            setError("有効なメールアドレスを入力してください");
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/register-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, recoveryEmail: email.trim() }),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || "登録に失敗しました");
            } else {
                setSuccess(true);
                setTimeout(() => onOpenChange(false), 1500);
            }
        } catch {
            setError("接続に失敗しました");
        }
        setIsLoading(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="text-left">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Mail className="size-4" />
                        メールアドレス登録
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        パスワードを忘れた時のリセットに使います。任意ですが登録をおすすめします。
                    </p>
                </DialogHeader>

                <div className="px-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-600">
                            回復用メールアドレス
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(""); setSuccess(false); }}
                            placeholder="example@gmail.com"
                            autoCapitalize="none"
                            autoCorrect="off"
                            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                            className="w-full border rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-destructive text-center bg-destructive/5 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    {success && (
                        <p className="text-xs text-green-700 text-center bg-green-50 rounded-lg px-3 py-2 flex items-center justify-center gap-1">
                            <Check className="size-3.5" />
                            メールアドレスを登録しました！
                        </p>
                    )}
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 mt-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading || !email.trim()}
                        className="w-full rounded-full font-medium"
                    >
                        {isLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : currentEmail ? "更新する" : "登録する"}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="w-full rounded-full mt-0"
                    >
                        キャンセル
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
