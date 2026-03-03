"use client";

import { useEffect, useState } from "react";

/**
 * アプリがPWA（スタンドアロン）モードで動作しているか検知するフック。
 * - CSS側: @media (display-mode: standalone) で判定
 * - JS側: このフックで isPWA を取得して使用する
 *
 * ブラウザ（アドレスバーあり） → isPWA = false
 * ホーム画面追加（PWA）      → isPWA = true
 */
export function usePWA(): boolean {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");

    const update = () => {
      const standaloneMedia = mq.matches;
      // iOS Safari の navigator.standalone も考慮
      const iosStandalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsPWA(standaloneMedia || iosStandalone);
    };

    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isPWA;
}
