import Supercluster from "supercluster";
import type { Place } from "@/lib/supabase";

// クラスタリングを開始するスポット数の閾値（未満なら従来の個別マーカー表示）
export const CLUSTER_THRESHOLD = 50;

export type PlacePointProps = { placeId: string };

/** filteredPlaces から supercluster インデックスを構築する */
export function buildClusterIndex(
  places: Place[]
): Supercluster<PlacePointProps> {
  const index = new Supercluster<PlacePointProps>({ radius: 60, maxZoom: 15 });
  index.load(
    places.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { placeId: p.id },
    }))
  );
  return index;
}
