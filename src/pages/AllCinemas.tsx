import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
    brand?: "CGV" | "롯데시네마" | "메가박스" | "기타";
    region?: "서울" | "경기" | "충청" | "전라" | "강원" | "경상" | "기타";
};

const inferBrand = (name: string): Theater["brand"] => {
    const n = name.toLowerCase();
    if (n.includes("cgv")) return "CGV";
    if (n.includes("롯데") || n.includes("lotte")) return "롯데시네마";
    if (n.includes("메가") || n.includes("mega")) return "메가박스";
    return "기타";
};

const inferRegion = (address: string): Theater["region"] => {
    const a = address.trim();
    if (a.startsWith("서울")) return "서울";
    if (a.startsWith("경기") || a.startsWith("인천")) return "경기";
    if (a.startsWith("충북") || a.startsWith("충남") || a.startsWith("대전") || a.startsWith("세종")) return "충청";
    if (a.startsWith("전북") || a.startsWith("전남") || a.startsWith("광주")) return "전라";
    if (a.startsWith("강원")) return "강원";
    if (a.startsWith("경북") || a.startsWith("경남") || a.startsWith("부산") || a.startsWith("대구") || a.startsWith("울산")) return "경상";
    return "기타";
};

export default function AllCinemas({ user }: { user: User }) {
    const [theaters, setTheaters] = useState<Theater[]>([]);
    const [loading, setLoading] = useState(true);

    const [brandFilter, setBrandFilter] = useState<"ALL" | NonNullable<Theater["brand"]>>("ALL");
    const [regionFilter, setRegionFilter] = useState<"ALL" | NonNullable<Theater["region"]>>("ALL");

    const PAGE_SIZE = 3;
    const [page, setPage] = useState(1);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const snap = await getDocs(collection(db, "cinema"));
            const list: Theater[] = snap.docs.map((d) => {
                const raw = d.data() as Record<string, unknown>;
                const name = String(raw.name ?? "");
                const address = String(raw.address ?? "");
                const brandRaw = raw.brand;
                const regionRaw = raw.region;

                const brand: Theater["brand"] =
                    brandRaw === "CGV" || brandRaw === "롯데시네마" || brandRaw === "메가박스" || brandRaw === "기타"
                        ? (brandRaw as Theater["brand"])
                        : inferBrand(name);

                const region: Theater["region"] =
                    regionRaw === "서울" || regionRaw === "경기" || regionRaw === "충청" || regionRaw === "전라" || regionRaw === "강원" || regionRaw === "경상" || regionRaw === "기타"
                        ? (regionRaw as Theater["region"])
                        : inferRegion(address);

                return {
                    id: d.id,
                    name,
                    address,
                    lat: Number(raw.lat),
                    lng: Number(raw.lng),
                    tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
                    brand,
                    region,
                };
            });

            setTheaters(list);
            setLoading(false);
        };

        void load();
    }, [user.uid]);

    const filtered = useMemo(() => {
        return theaters.filter((t) => {
            const okBrand = brandFilter === "ALL" ? true : (t.brand ?? "기타") === brandFilter;
            const okRegion = regionFilter === "ALL" ? true : (t.region ?? "기타") === regionFilter;
            return okBrand && okRegion;
        });
    }, [theaters, brandFilter, regionFilter]);

    // ✅ filters 바뀌면 1페이지로
    useEffect(() => {
        setPage(1);
    }, [brandFilter, regionFilter]);

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    }, [filtered.length]);

    const paged = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, page]);

// ✅ filtered가 줄어들어 페이지가 범위를 벗어나면 보정
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    if (loading) return <div className="muted">로딩중...</div>;

    return (
        <div className="grid">
            <div className="glass card">
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <h2 className="title">특별 영화관 검색</h2>
                    <div className="muted" style={{ marginLeft: "auto" }}>{filtered.length}개</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: 10, marginTop: 12 }}>
                    <label className="muted" style={{ display: "grid", gap: 6 }}>
                         체인
                        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value as any)}>
                            <option value="ALL">전체</option>
                            <option value="CGV">CGV</option>
                            <option value="롯데시네마">롯데시네마</option>
                            <option value="메가박스">메가박스</option>
                            <option value="기타">기타</option>
                        </select>
                    </label>

                    <label className="muted" style={{ display: "grid", gap: 6 }}>
                         지역
                        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value as any)}>
                            <option value="ALL">전체</option>
                            <option value="서울">서울시</option>
                            <option value="경기">경기도</option>
                            <option value="충청">충청도</option>
                            <option value="전라">전라도</option>
                            <option value="강원">강원도</option>
                            <option value="경상">경상도</option>
                            <option value="경상">제주도</option>
                            <option value="기타">기타</option>
                        </select>
                    </label>

                    <button
                        className="btn"
                        onClick={() => {
                            setBrandFilter("ALL");
                            setRegionFilter("ALL");
                        }}
                    >
                        초기화
                    </button>
                </div>
            </div>

            <div className="grid">
                {paged.map((t) => (
                    <div key={t.id} className="glass card">
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                            <div style={{ fontWeight: 950 }}>{t.name}</div>
                            <div className="muted" style={{ marginLeft: "auto" }}>
                                {(t.brand ?? "기타")} · {(t.region ?? "기타")}
                            </div>
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>{t.address}</div>
                        {t.tags?.length ? (
                            <div className="muted" style={{ marginTop: 6 }}>특별 상영관: {t.tags.join(", ")}</div>
                        ) : null}
                        <div style={{ marginTop: 10 }}>
                            <Link className="pill" to={`/cinema/${t.id}`}>상세 보기</Link>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length > PAGE_SIZE && (
                <div className="glass card" style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
                    <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        이전
                    </button>

                    <span className="muted">
      {page} / {totalPages}
    </span>

                    <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                        다음
                    </button>
                </div>
            )}

            <div className="muted">
                ※ brand/region 필드가 없으면 이름/주소로 추정합니다.
            </div>
        </div>
    );
}