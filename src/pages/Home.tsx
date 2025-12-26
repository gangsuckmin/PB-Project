import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLngTuple } from "leaflet";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
};

type TheaterWithDistance = Theater & { distanceKm: number | null };

type RankItem = {
    cinemaId: string;
    cinemaName: string;
    tag: string;
    avgOverall: number;
    count: number;
};

// 내 위치: 사람 아이콘(살짝 큰)
const MyLocationIcon = L.divIcon({
    className: "",
    html: `
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg"
         style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <circle cx="12" cy="7" r="4" fill="#2563eb"/>
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#2563eb"/>
    </svg>
  `,
    iconSize: [30, 30],
    iconAnchor: [20, 25],
});

// 일반 영화관: 아주 작은 빨강 점
const TheaterRedIcon = L.divIcon({
    className: "",
    html: `
    <div style="
      width: 12px; height: 12px;
      background: #ef4444;
      border: 2px solid white;
      border-radius: 999px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.30);
    "></div>
  `,
    iconSize: [6, 6],
    iconAnchor: [3, 3],
});

// 랭킹 TOP10: 별
const TheaterStarIcon = L.divIcon({
    className: "",
    html: `<div style="font-size:16px;line-height:16px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">⭐</div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

// 관심 영화관: 하트
const TheaterHeartIcon = L.divIcon({
    className: "",
    html: `<div style="font-size:16px;line-height:16px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">❤️</div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
});



function Recenter({ pos, zoom }: { pos: { lat: number; lng: number } | null; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        if (!pos) return;
        map.setView([pos.lat, pos.lng], zoom, { animate: true });
    }, [pos, zoom, map]);
    return null;
}

export default function Home({ user }: { user: User }) {
    const [theaters, setTheaters] = useState<Theater[]>([]);
    const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
    const [locError, setLocError] = useState<string | null>(null);
    const [locLoading, setLocLoading] = useState(false);

    const [ranking, setRanking] = useState<RankItem[]>([]);
    const [rankLoading, setRankLoading] = useState(false);

    const [radiusM, setRadiusM] = useState(10000); // 10km
    const NEARBY_PAGE_SIZE = 8;
    const [nearbyPage, setNearbyPage] = useState(1);
    const [favoriteCinemaIds, setFavoriteCinemaIds] = useState<Set<string>>(new Set());


    useEffect(() => {
        const load = async () => {
            const snap = await getDocs(collection(db, "cinema"));
            const list: Theater[] = snap.docs.map((d) => {
                const raw = d.data() as Record<string, unknown>;
                return {
                    id: d.id,
                    name: String(raw.name ?? ""),
                    address: String(raw.address ?? ""),
                    lat: Number(raw.lat),
                    lng: Number(raw.lng),
                    tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
                };
            });
            setTheaters(list);
        };
        void load();
    }, [user]);

    useEffect(() => {
        const loadFavorites = async () => {
            try {
                const snap = await getDocs(collection(db, "users", user.uid, "favorites"));
                const s = new Set<string>();
                snap.docs.forEach((d) => s.add(d.id));
                setFavoriteCinemaIds(s);
            } catch {
                setFavoriteCinemaIds(new Set());
            }
        };
        void loadFavorites();
    }, [user.uid]);

    useEffect(() => {
        const loadRanking = async () => {
            setRankLoading(true);
            try {
                const items: RankItem[] = [];
                await Promise.all(
                    theaters.map(async (t) => {
                        const tags = t.tags ?? [];
                        await Promise.all(
                            tags.map(async (tag) => {
                                const statsRef = doc(db, "cinema", t.id, "tagReviews", tag, "stats", "summary");
                                const s = await getDoc(statsRef);
                                if (!s.exists()) return;
                                const raw = s.data() as any;
                                const avgOverall = Number(raw.avgOverall ?? 0);
                                const count = Number(raw.count ?? 0);
                                if (count > 0) {
                                    items.push({ cinemaId: t.id, cinemaName: t.name, tag, avgOverall, count });
                                }
                            })
                        );
                    })
                );
                items.sort((a, b) => b.avgOverall - a.avgOverall);
                setRanking(items.slice(0, 10));
            } finally {
                setRankLoading(false);
            }
        };
        if (theaters.length > 0) void loadRanking();
    }, [theaters]);

    const top10CinemaIdSet = useMemo(() => {
        const s = new Set<string>();
        for (const r of ranking) s.add(r.cinemaId);
        return s;
    }, [ranking]);

    const refreshLocation = () => {
        setLocError(null);
        if (!navigator.geolocation) {
            setLocError("위치 기능을 지원하지 않는 브라우저입니다.");
            return;
        }
        setLocLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocLoading(false);
            },
            (err) => {
                setLocError(err.message);
                setLocLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    useEffect(() => {
        refreshLocation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const toRad = (x: number) => (x * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    };

    const theatersWithDistance: TheaterWithDistance[] = useMemo(() => {
        return theaters
            .map((t) => ({
                ...t,
                distanceKm: myPos ? haversineKm(myPos, { lat: t.lat, lng: t.lng }) : null,
            }))
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }, [theaters, myPos]);

    const nearbyWithinRadius = useMemo(() => {
        return theatersWithDistance
            .filter((t) => t.distanceKm !== null && (t.distanceKm as number) * 1000 <= radiusM)
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }, [theatersWithDistance, radiusM]);

    // ✅ 내 주변 리스트 pagination
    useEffect(() => {
        // 반경/위치/데이터가 바뀌면 1페이지로
        setNearbyPage(1);
    }, [radiusM, myPos, theaters.length]);

    const nearbyTotalPages = useMemo(() => {
        return Math.max(1, Math.ceil(nearbyWithinRadius.length / NEARBY_PAGE_SIZE));
    }, [nearbyWithinRadius.length]);

    const nearbyPaged = useMemo(() => {
        const start = (nearbyPage - 1) * NEARBY_PAGE_SIZE;
        return nearbyWithinRadius.slice(start, start + NEARBY_PAGE_SIZE);
    }, [nearbyWithinRadius, nearbyPage]);

    useEffect(() => {
        // 리스트가 줄어들어 페이지가 범위를 벗어나면 보정
        if (nearbyPage > nearbyTotalPages) setNearbyPage(nearbyTotalPages);
    }, [nearbyPage, nearbyTotalPages]);
    const mapCenter: LatLngTuple = myPos
        ? [myPos.lat, myPos.lng]
        : theatersWithDistance.length > 0
            ? [theatersWithDistance[0].lat, theatersWithDistance[0].lng]
            : [37.5665, 126.978];

    return (
        <div className="homeLayout" style={{ alignItems: "stretch" }}>
            {/* LEFT: Ranking */}
            <div className="glass card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <h2 className="title">⭐특별 상영관 랭킹 TOP10⭐</h2>
                    <div className="muted" style={{ marginLeft: "auto" }}>{rankLoading ? "계산 중..." : ""}</div>
                </div>

                <div className="rankScroll" style={{ marginTop: 10, flex: 1, maxHeight: "none" }}>
                    {ranking.length === 0 ? (
                        <div className="muted">아직 랭킹 데이터가 없어요.</div>
                    ) : (
                        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                            {ranking.map((r, idx) => (
                                <li
                                    key={`${r.cinemaId}-${r.tag}`}
                                    style={{
                                        marginBottom: 10,
                                        paddingBottom: 8,
                                        borderBottom: "1px solid rgba(255,255,255,.08)",
                                    }}
                                >
                                    <Link to={`/cinema/${r.cinemaId}`} style={{ fontWeight: 600, fontSize: 15 }}>
                                        [{idx + 1}위] {r.cinemaName}<br/>{r.tag}
                                    </Link>
                                    <div className="muted">
                                        {r.avgOverall.toFixed(1)}점({r.count}명)
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* RIGHT: Location / Top5 / Map */}
            <div className="grid">


                {/* Nearby Top5 */}
                <div className="glass card">
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                        <h2 className="title" style={{ margin: 0 }}>내 주변 특별 영화관</h2>

                        {locError && (
                            <div style={{ width: "100%", color: "#fca5a5", fontSize: 12, marginTop: 8 }}>
                                {locError}
                            </div>
                        )}
                    </div>

                    {/* body: LEFT controls / RIGHT list */}
                    <div
                        className="laserSplit"
                        style={{
                            display: "grid",
                            gridTemplateColumns: "260px 1fr",
                            gap: 22,
                            alignItems: "start",
                            marginTop: 12,
                        }}
                    >
                        {/* LEFT: controls */}
                        <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
                            <button
                                className="btn primary"
                                onClick={refreshLocation}
                                disabled={locLoading}
                                style={{
                                    padding: "6px 10px",
                                    fontSize: 15,
                                    width: "fit-content",
                                }}
                            >
                                {locLoading ? "불러오는 중..." : "내 위치 새로고침"}
                            </button>

                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "nowrap" }}>
    <span className="muted2" style={{ whiteSpace: "nowrap", minWidth: 28 }}>
      반경
    </span>

                                <select
                                    value={radiusM}
                                    onChange={(e) => setRadiusM(Number(e.target.value))}
                                    style={{
                                        width: 80,
                                        padding: "10px 10px",
                                        fontSize: 15,
                                    }}
                                >
                                    <option value={1000}>1km</option>
                                    <option value={3000}>3km</option>
                                    <option value={5000}>5km</option>
                                    <option value={10000}>10km</option>
                                    <option value={30000}>30km</option>
                                    <option value={50000}>50km</option>
                                    <option value={100000}>100km</option>
                                </select>
                            </div>
                        </div>

                        {/* RIGHT: list */}
                        <div style={{ display: "grid", gap: 10 }}>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {nearbyWithinRadius.length === 0 ? (
                                    <li className="muted" style={{ listStyle: "none", paddingLeft: 0 }}>
                                        설정한 반경 내에 특별 영화관이 없습니다.
                                    </li>
                                ) : (
                                    nearbyPaged.map((t) => (
                                        <li key={t.id} style={{ marginBottom: 8 }}>
                                            <Link to={`/cinema/${t.id}`}>{t.name}</Link>{" "}
                                            <span className="muted">({t.distanceKm?.toFixed(2)} km)</span>
                                        </li>
                                    ))
                                )}
                            </ul>

                            {nearbyWithinRadius.length > NEARBY_PAGE_SIZE && (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
                                    <button
                                        className="btn"
                                        style={{ padding: "6px 10px", fontSize: 13 }}
                                        disabled={nearbyPage <= 1}
                                        onClick={() => setNearbyPage((p) => Math.max(1, p - 1))}
                                    >
                                        이전
                                    </button>

                                    <span className="muted">{nearbyPage} / {nearbyTotalPages}</span>

                                    <button
                                        className="btn"
                                        style={{ padding: "6px 10px", fontSize: 13 }}
                                        disabled={nearbyPage >= nearbyTotalPages}
                                        onClick={() => setNearbyPage((p) => Math.min(nearbyTotalPages, p + 1))}
                                    >
                                        다음
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Map */}
                <MapContainer center={mapCenter} zoom={myPos ? 14 : 13} style={{ height: 460, width: "100%" }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Recenter pos={myPos} zoom={14} />

                    {myPos && (
                        <>
                            <Circle
                                center={[myPos.lat, myPos.lng]}
                                radius={radiusM}
                                pathOptions={{ color: "#6fd3ff", fillColor: "#6fd3ff", fillOpacity: 0.10, weight: 2 }}
                            />
                            <Marker position={[myPos.lat, myPos.lng] as any} icon={MyLocationIcon}>
                                <Popup>내 위치</Popup>
                            </Marker>
                        </>
                    )}

                    {theatersWithDistance.map((t) => {
                        const icon = favoriteCinemaIds.has(t.id)
                            ? TheaterHeartIcon
                            : top10CinemaIdSet.has(t.id)
                                ? TheaterStarIcon
                                : TheaterRedIcon;

                        return (
                            <Marker key={t.id} position={[t.lat, t.lng] as any} icon={icon}>
                                <Popup>
                                    <b>{t.name}</b><br />
                                    <span className="muted">{t.address}</span><br />
                                    <span className="muted">
                  {t.distanceKm === null ? "거리: (위치 필요)" : `거리: ${t.distanceKm.toFixed(2)} km`}
                </span>
                                    <br />
                                    {favoriteCinemaIds.has(t.id) ? <span>❤️관심 영화관❤️</span> : null}
                                    {!favoriteCinemaIds.has(t.id) && top10CinemaIdSet.has(t.id) ? <span>⭐랭킹 TOP10⭐</span> : null}
                                    <br />
                                    <Link to={`/cinema/${t.id}`}>상세로 이동</Link>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );}