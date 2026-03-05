"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin, Plus, Search, X, Loader2, Sparkles, Clock } from "lucide-react";
import { forwardGeocode } from "@/lib/geocoding";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase, type Place, type BusinessHours } from "@/lib/supabase";
import { PRESET_CATEGORIES, DURATION_OPTIONS } from "@/lib/constants";
import { useMapStore } from "@/store/useMapStore";

// ── Google Places API の型 ───────────────────────────────
interface PlacePrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
  description: string;
}

interface PlaceDetails {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photoRefs: string[];
  website: string | null;
  businessHours: BusinessHours | null;
}

// AI 抽出結果の型
interface AiExtractResult {
  name?: string | null;
  address?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  categories?: string[];
  opening_hours_text?: string | null;
  note?: string | null;
  error?: string;
}

// ── フォームスキーマ ─────────────────────────────────────
const placeSchema = z.object({
  name: z.string().min(1, "名前を入力してください"),
  address: z.string().optional(),
  note: z.string().optional(),
  categories: z.array(z.string()),
  budget_min: z.string().optional(),
  budget_max: z.string().optional(),
  duration: z.string().optional(),
  opening_hours_text: z.string().optional(),
  image_urls: z.array(z.object({ value: z.string() })),
});

type PlaceFormValues = z.infer<typeof placeSchema>;

interface AddPlaceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coords: { lat: number; lng: number } | null;
  geocodedAddress: string | null;
  onPickFromMap: () => void;
  onCoordsChange: (coords: { lat: number; lng: number }) => void;
  onSaved: (place: Place) => void;
  editPlace?: Place;
}

export function AddPlaceSheet({
  open,
  onOpenChange,
  coords,
  geocodedAddress,
  onPickFromMap,
  onCoordsChange,
  onSaved,
  editPlace,
}: AddPlaceSheetProps) {
  const { room, currentUser } = useMapStore();

  const [customCatInput, setCustomCatInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // ── AI 自動入力 ──────────────────────────────────────
  const [aiUrl, setAiUrl] = useState("");
  const [isAiExtracting, setIsAiExtracting] = useState(false);
  const [aiError, setAiError] = useState("");

  // ── Autocomplete 用 state ────────────────────────────
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [isFillingDetails, setIsFillingDetails] = useState(false);

  // オートコンプリートの誤爆防止
  const suppressAutocompleteRef = useRef(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);

  // Place Details から取得した business_hours を保持（フォームスキーマ外）
  const businessHoursRef = useRef<BusinessHours | null>(null);

  const isEdit = !!editPlace;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<PlaceFormValues>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      name: "",
      address: "",
      note: "",
      categories: [],
      budget_min: undefined,
      budget_max: undefined,
      duration: undefined,
      opening_hours_text: "",
      image_urls: [{ value: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "image_urls",
  });

  const addressValue = useWatch({ control, name: "address" });

  // ── リバースジオコーディング結果を反映 ──────────────
  useEffect(() => {
    if (geocodedAddress) {
      suppressAutocompleteRef.current = true;
      setValue("address", geocodedAddress);
    }
  }, [geocodedAddress, setValue]);

  // ── Autocomplete デバウンス ──────────────────────────
  useEffect(() => {
    if (suppressAutocompleteRef.current) {
      suppressAutocompleteRef.current = false;
      setSuggestions([]);
      return;
    }

    const query = addressValue?.trim();
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingSuggestions(true);
      try {
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(query)}`
        );
        const data: PlacePrediction[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setIsFetchingSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [addressValue]);

  // ── サジェスト選択 → Place Details 取得 → 全自動入力 ──
  async function handleSelectSuggestion(prediction: PlacePrediction) {
    setShowSuggestions(false);
    setSuggestions([]);
    suppressAutocompleteRef.current = true;
    setIsFillingDetails(true);

    try {
      const res = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(prediction.place_id)}`
      );
      const details: PlaceDetails | null = await res.json();
      if (!details) return;

      suppressAutocompleteRef.current = true;

      // 施設名 → 名前フィールドへ
      setValue("name", details.name ?? prediction.structured_formatting.main_text);
      // フル住所 → 住所フィールドへ（"日本" 等の国名サフィックスを除去）
      const cleanAddress = (details.address ?? "")
        .replace(/,?\s*(日本|Japan)$/i, "")
        .trim();
      setValue(
        "address",
        (cleanAddress || prediction.structured_formatting.secondary_text) ?? ""
      );

      if (details.photoRefs.length > 0) {
        setValue(
          "image_urls",
          details.photoRefs.map((ref) => ({
            value: `/api/places/photo?ref=${encodeURIComponent(ref)}`,
          }))
        );
      }

      const website = details.website;
      if (
        website &&
        !website.includes("google.com") &&
        !website.includes("goo.gl")
      ) {
        const prefix = website.includes("tabelog.com") ? "食べログ" : "公式サイト";
        const existingNote = getValues("note") ?? "";
        const newLine = `${prefix}: ${website}`;
        setValue("note", existingNote ? `${existingNote}\n${newLine}` : newLine);
      }

      // 営業時間: structured data を ref に、テキストをフォームにセット
      businessHoursRef.current = details.businessHours;
      if (details.businessHours?.weekday_text?.length) {
        setValue(
          "opening_hours_text",
          details.businessHours.weekday_text.join("\n")
        );
      }

      if (details.lat !== null && details.lng !== null) {
        onCoordsChange({ lat: details.lat, lng: details.lng });
      }
    } catch {
      // サイレント失敗
    } finally {
      setIsFillingDetails(false);
    }
  }

  // ── 検索ボタン：Place Details 取得 → 名前・住所・ピン自動入力 ──
  async function handleAddressSearch() {
    const query = getValues("address")?.trim();
    if (!query) return;
    setIsSearching(true);
    setShowSuggestions(false);

    try {
      // 1. オートコンプリートで先頭候補を取得
      const acRes = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(query)}`
      );
      const predictions: PlacePrediction[] = await acRes.json();

      if (predictions.length > 0) {
        // 2. 先頭候補で Place Details を取得（名前・住所・写真等を自動入力）
        setIsSearching(false);
        await handleSelectSuggestion(predictions[0]);
      } else {
        // 3. サジェストなし → 座標のみジオコーディング
        const result = await forwardGeocode(query);
        setIsSearching(false);
        if (result) onCoordsChange(result);
      }
    } catch {
      const result = await forwardGeocode(query);
      setIsSearching(false);
      if (result) onCoordsChange(result);
    }
  }

  // ── AI URL 自動入力 ──────────────────────────────────
  async function handleAiExtract() {
    const url = aiUrl.trim();
    if (!url) return;
    setIsAiExtracting(true);
    setAiError("");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result: AiExtractResult = await res.json();

      if (!res.ok || result.error) {
        setAiError(result.error ?? "抽出に失敗しました");
        return;
      }

      // オートコンプリートが誤爆しないよう抑制してから setValue
      suppressAutocompleteRef.current = true;

      if (result.name) setValue("name", result.name);
      if (result.address) setValue("address", result.address);
      if (result.budget_min != null)
        setValue("budget_min", String(result.budget_min));
      if (result.budget_max != null)
        setValue("budget_max", String(result.budget_max));
      if (result.opening_hours_text)
        setValue("opening_hours_text", result.opening_hours_text);
      if (result.note) {
        const existing = getValues("note") ?? "";
        setValue("note", existing ? `${existing}\n${result.note}` : result.note);
      }
      if (result.categories?.length) {
        const existing = getValues("categories") ?? [];
        const merged = Array.from(new Set([...existing, ...result.categories]));
        setValue("categories", merged);
      }

      // 住所が入ったらピンを移動（既存ロジックを自然に発火）
      if (result.address) {
        suppressAutocompleteRef.current = true;
        const geocoded = await forwardGeocode(result.address);
        if (geocoded) onCoordsChange(geocoded);
      }
    } catch {
      setAiError("通信エラーが発生しました");
    } finally {
      setIsAiExtracting(false);
    }
  }

  // ── フォームの開閉リセット ──────────────────────────
  useEffect(() => {
    if (open && editPlace) {
      businessHoursRef.current = editPlace.business_hours ?? null;
      reset({
        name: editPlace.name,
        address: editPlace.address ?? "",
        note: editPlace.note ?? "",
        categories: editPlace.categories ?? [],
        budget_min: editPlace.budget_min?.toString() ?? "",
        budget_max: editPlace.budget_max?.toString() ?? "",
        duration: editPlace.duration ?? undefined,
        opening_hours_text: editPlace.opening_hours_text ?? "",
        image_urls:
          editPlace.image_urls && editPlace.image_urls.length > 0
            ? editPlace.image_urls.map((v) => ({ value: v }))
            : [{ value: "" }],
      });
    } else if (!open) {
      businessHoursRef.current = null;
      reset({
        name: "",
        address: "",
        note: "",
        categories: [],
        budget_min: undefined,
        budget_max: undefined,
        duration: undefined,
        opening_hours_text: "",
        image_urls: [{ value: "" }],
      });
      setCustomCatInput("");
      setSuggestions([]);
      setShowSuggestions(false);
      setAiUrl("");
      setAiError("");
    }
  }, [open, editPlace, reset]);

  // ── 保存 ────────────────────────────────────────────
  async function onSubmit(values: PlaceFormValues) {
    if (!coords) {
      setError("root", {
        message: "📍 ピンアイコンをクリックして地図から場所を選択してください",
      });
      return;
    }

    // business_hours がなく opening_hours_text がある場合、または編集で営業時間テキストを変更した場合、AI で構造化
    const origText = ((isEdit && editPlace?.opening_hours_text) || "").trim();
    const newText = values.opening_hours_text?.trim() ?? "";
    const textChanged = isEdit && origText !== newText;
    const shouldParse =
      newText && (!businessHoursRef.current || textChanged);
    if (shouldParse) {
      try {
        const res = await fetch("/api/places/parse-hours", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: values.opening_hours_text }),
        });
        if (res.ok) {
          businessHoursRef.current = await res.json();
        }
      } catch {
        // 変換失敗はサイレントに無視して保存を続行
      }
    } else if (textChanged && !newText) {
      // 編集で営業時間をクリアした場合は business_hours も破棄
      businessHoursRef.current = null;
    }

    const imageUrls = values.image_urls
      .map(({ value }) => value.trim())
      .filter(Boolean);

    const budgetMin = values.budget_min ? parseInt(values.budget_min, 10) : null;
    const budgetMax = values.budget_max ? parseInt(values.budget_max, 10) : null;

    const payload = {
      name: values.name,
      address: values.address || null,
      note: values.note || null,
      categories: values.categories.length > 0 ? values.categories : null,
      budget_min: budgetMin,
      budget_max: budgetMax,
      duration: values.duration || null,
      opening_hours_text:
        businessHoursRef.current?.weekday_text?.length
          ? businessHoursRef.current.weekday_text.join("\n")
          : values.opening_hours_text || null,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      lat: coords.lat,
      lng: coords.lng,
      business_hours: businessHoursRef.current,
      room_id: room?.id ?? null,
      created_by_name: isEdit
        ? editPlace?.created_by_name ?? null
        : currentUser.name || null,
      created_by_id: isEdit
        ? editPlace?.created_by_id ?? null
        : currentUser.id,
    };

    let data, error;

    if (isEdit && editPlace) {
      ({ data, error } = await supabase
        .from("places")
        .update(payload)
        .eq("id", editPlace.id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabase
        .from("places")
        .insert(payload)
        .select()
        .single());
    }

    if (error) {
      setError("root", { message: error.message });
      return;
    }

    onSaved(data as Place);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent side="right" className="flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>
            {isAiExtracting
              ? "✨ AI が情報を抽出中..."
              : isFillingDetails
                ? "情報を取得中..."
                : isEdit
                  ? "スポットを編集"
                  : "場所を追加"}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-5 px-6 py-4 flex-1">

            {/* ✨ AI 自動入力セクション */}
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 dark:bg-violet-950/20 dark:border-violet-700 p-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                AIで自動入力（任意）
              </p>
              <div className="flex gap-2">
                <Input
                  value={aiUrl}
                  onChange={(e) => {
                    setAiUrl(e.target.value);
                    setAiError("");
                  }}
                  placeholder="食べログ・公式サイト・GoogleマップのURLを貼り付け"
                  className="flex-1 text-sm bg-white dark:bg-background"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAiExtract();
                    }
                  }}
                  disabled={isAiExtracting}
                />
                <Button
                  type="button"
                  onClick={handleAiExtract}
                  disabled={isAiExtracting || !aiUrl.trim()}
                  className="gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700 text-white"
                  size="sm"
                >
                  {isAiExtracting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {isAiExtracting ? "解析中..." : "自動入力"}
                </Button>
              </div>
              {aiError && (
                <p className="text-xs text-destructive">{aiError}</p>
              )}
            </div>

            {/* 名前 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                名前 <span className="text-destructive">*</span>
              </label>
              <Input {...register("name")} placeholder="場所の名前" />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* 住所 + Autocomplete + 検索 + 地図で選択 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">住所 / 施設名で検索</label>
              <div ref={addressContainerRef} className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      {...register("address")}
                      placeholder="施設名や住所を入力（例: USJ、渋谷スクランブル交差点）"
                      className="flex-1"
                      autoComplete="off"
                      onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setShowSuggestions(false);
                          handleAddressSearch();
                        }
                        if (e.key === "Escape") {
                          setShowSuggestions(false);
                        }
                      }}
                    />
                    {(isFetchingSuggestions || isFillingDetails) && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground pointer-events-none" />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setShowSuggestions(false);
                      handleAddressSearch();
                    }}
                    disabled={isSearching}
                    title="住所から座標を検索"
                  >
                    <Search
                      className={`size-4 ${isSearching ? "animate-pulse" : ""}`}
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onPickFromMap}
                    title="地図から場所を選択"
                  >
                    <MapPin className="size-4" />
                  </Button>
                </div>

                {/* Autocomplete ドロップダウン */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background border rounded-lg shadow-lg overflow-hidden">
                    {suggestions.map((s) => (
                      <button
                        key={s.place_id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(s);
                        }}
                      >
                        <p className="text-sm font-medium truncate">
                          {s.structured_formatting.main_text}
                        </p>
                        {s.structured_formatting.secondary_text && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {s.structured_formatting.secondary_text}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {coords ? (
                <p className="text-xs text-muted-foreground">
                  📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  施設名を入力してサジェストから選ぶか、ピンで地図から指定できます
                </p>
              )}
            </div>

            {/* カテゴリ */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">カテゴリ</label>
              <Controller
                name="categories"
                control={control}
                render={({ field }) => {
                  const customCats = field.value.filter(
                    (v) => !(PRESET_CATEGORIES as readonly string[]).includes(v)
                  );

                  function addCustom() {
                    const val = customCatInput.trim();
                    if (val && !field.value.includes(val)) {
                      field.onChange([...field.value, val]);
                    }
                    setCustomCatInput("");
                  }

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {PRESET_CATEGORIES.map((cat) => {
                          const selected = field.value.includes(cat);
                          return (
                            <Badge
                              key={cat}
                              variant={selected ? "default" : "outline"}
                              className="cursor-pointer select-none transition-colors"
                              onClick={() =>
                                field.onChange(
                                  selected
                                    ? field.value.filter((v) => v !== cat)
                                    : [...field.value, cat]
                                )
                              }
                            >
                              {cat}
                            </Badge>
                          );
                        })}
                      </div>

                      {customCats.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {customCats.map((cat) => (
                            <Badge
                              key={cat}
                              variant="default"
                              className="cursor-pointer select-none gap-1 pr-1.5"
                              onClick={() =>
                                field.onChange(
                                  field.value.filter((v) => v !== cat)
                                )
                              }
                            >
                              {cat}
                              <X className="size-3 opacity-70" />
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          value={customCatInput}
                          onChange={(e) => setCustomCatInput(e.target.value)}
                          placeholder="自由入力（例: ラーメン、デート）"
                          className="flex-1 h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustom();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={addCustom}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                }}
              />
            </div>

            {/* 予算 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">予算</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    {...register("budget_min")}
                    type="number"
                    min={0}
                    placeholder="下限"
                    className="pl-7"
                  />
                </div>
                <span className="text-muted-foreground text-sm shrink-0">〜</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    {...register("budget_max")}
                    type="number"
                    min={0}
                    placeholder="上限"
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            {/* 滞在時間 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">滞在時間</label>
              <Controller
                name="duration"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* 営業時間 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                営業時間
              </label>
              <textarea
                {...register("opening_hours_text")}
                placeholder={"例: 月〜金 11:00〜22:00\n土日祝 10:00〜23:00 (水曜定休)"}
                rows={3}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            {/* 画像URL */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">画像URL</label>
              <div className="flex flex-col gap-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <Input
                      {...register(`image_urls.${index}.value`)}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ value: "" })}
                  className="w-fit"
                >
                  <Plus className="size-3.5" />
                  追加
                </Button>
              </div>
            </div>

            {/* メモ */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">メモ</label>
              <textarea
                {...register("note")}
                placeholder="メモを入力"
                rows={3}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            {errors.root && (
              <p className="text-sm text-destructive">{errors.root.message}</p>
            )}
          </div>

          <SheetFooter className="px-6 pb-6">
            <Button
              type="submit"
              disabled={isSubmitting || isFillingDetails || isAiExtracting}
              className="w-full"
            >
              {isSubmitting
                ? isEdit ? "更新中..." : "保存中..."
                : isEdit ? "更新する" : "保存する"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
