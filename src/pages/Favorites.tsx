import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { collection, getDocs, doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
};

export default function Favorites({ user }: { user: User }) {
    const [items, setItems] = useState<Theater[]>([]);
    const [loading, setLoading] = useState(true);

    const PAGE_SIZE = 5;
    const [page, setPage] = useState(1);

    const [removingId, setRemovingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            const favSnap = await getDocs(collection(db, "users", user.uid, "favorites"));

            const ids = favSnap.docs.map((d) => d.id);

            const cinemas = await Promise.all(
                ids.map(async (cinemaId) => {
                    const s = await getDoc(doc(db, "cinema", cinemaId));
                    if (!s.exists()) return null;
                    const raw = s.data() as Record<string, unknown>;
                    const c: Theater = {
                        id: s.id,
                        name: String(raw.name ?? ""),
                        address: String(raw.address ?? ""),
                        lat: Number(raw.lat),
                        lng: Number(raw.lng),
                        tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
                    };
                    return c;
                })
            );

            const nextItems = cinemas.filter(Boolean) as Theater[];
            setItems(nextItems);
            setPage(1);
            setLoading(false);
        };

        void load();
    }, [user.uid]);

    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

    const pagedItems = items.slice(
        (page - 1) * PAGE_SIZE,
        (page - 1) * PAGE_SIZE + PAGE_SIZE
    );

    useEffect(() => {
        // items가 줄어들었을 때 현재 페이지가 범위를 벗어나면 보정
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const unfavorite = async (cinemaId: string) => {
        try {
            setError(null);
            setRemovingId(cinemaId);

            await deleteDoc(doc(db, "users", user.uid, "favorites", cinemaId));
            setItems((prev) => prev.filter((x) => x.id !== cinemaId));
        } catch (e) {
            setError(String(e));
        } finally {
            setRemovingId(null);
        }
    };

    if (loading) return <div className="muted">로딩중...</div>;

    return (
        <div className="grid">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 className="title">나의 관심 영화관</h2>

                {items.length > PAGE_SIZE && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            이전
                        </button>
                        <span className="muted">{page} / {totalPages}</span>
                        <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                            다음
                        </button>
                    </div>
                )}

                <div className="muted" style={{ marginLeft: "auto" }}>{items.length}개</div>
            </div>

            {error && (
                <div style={{ color: "#fca5a5", whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>
                    {error}
                </div>
            )}

            {items.length === 0 ? (
                <div className="glass card muted">아직 관심 등록한 영화관이 없습니다.</div>
            ) : (
                <div className="grid">
                    {pagedItems.map((t) => (
                        <div key={t.id} className="glass card">
                            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                                <b>{t.name}</b>

                                <div style={{ marginLeft: "auto", display: "flex", gap: 15, alignItems: "center" }}>
                                    <Link className="pill" to={`/cinema/${t.id}`}> 상세 보기 </Link>
                                    <button
                                        className="btn danger"
                                        onClick={() => unfavorite(t.id)}
                                        disabled={removingId === t.id}
                                    >
                                        {removingId === t.id ? "해제 중..." : "💔 관심 해제"}
                                    </button>

                                </div>
                            </div>

                            <div className="muted" style={{ marginTop: 6 }}>{t.address}</div>
                            {t.tags?.length ? (
                                <div className="muted" style={{ marginTop: 8 }}>태그: {t.tags.join(", ")}</div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}