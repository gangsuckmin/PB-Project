import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Link, useParams } from "react-router-dom";
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
};

type Review = {
    id: string; // uid
    userId: string;
    displayName: string;
    screen: number;
    picture: number;
    sound: number;
    seat: number;
    comment: string;
    likeCount: number;
};

type ReviewForm = {
    screen: number;
    picture: number;
    sound: number;
    seat: number;
    comment: string;
};

type SortMode = "latest" | "likes";

export default function CinemaDetail({ user }: { user: User }) {
    const { id } = useParams();
    const cinemaId = id ?? "";

    const [cinema, setCinema] = useState<Theater | null>(null);

    const PAGE_SIZE = 4;
    const [page, setPage] = useState(1);

    // favorites
    const [isFavorite, setIsFavorite] = useState(false);
    const [favBusy, setFavBusy] = useState(false);

    // tag
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // reviews
    const [sortMode, setSortMode] = useState<SortMode>("latest");
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewLoadError, setReviewLoadError] = useState<string | null>(null);

    const [savingReview, setSavingReview] = useState(false);
    const [myReview, setMyReview] = useState<ReviewForm>({
        screen: 0,
        picture: 0,
        sound: 0,
        seat: 0,
        comment: "",
    });

    const [reviewEditorOpen, setReviewEditorOpen] = useState(true);
    const [reviewEditorTouched, setReviewEditorTouched] = useState(false);

    const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
    const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    // load cinema
    useEffect(() => {
        const load = async () => {
            const ref = doc(db, "cinema", cinemaId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return;
            const raw = snap.data() as Record<string, unknown>;
            const c: Theater = {
                id: snap.id,
                name: String(raw.name ?? ""),
                address: String(raw.address ?? ""),
                lat: Number(raw.lat),
                lng: Number(raw.lng),
                tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
            };
            setCinema(c);
            setSelectedTag(c.tags?.[0] ?? null);
            setSortMode("latest");
        };
        if (cinemaId) void load();
    }, [cinemaId]);

    // check favorite
    useEffect(() => {
        const run = async () => {
            const favRef = doc(db, "users", user.uid, "favorites", cinemaId);
            const s = await getDoc(favRef);
            setIsFavorite(s.exists());
        };
        if (cinemaId) void run();
    }, [cinemaId, user.uid]);

    const toggleFavorite = async () => {
        if (!cinemaId) return;
        setFavBusy(true);
        try {
            const favRef = doc(db, "users", user.uid, "favorites", cinemaId);
            const snap = await getDoc(favRef);
            if (snap.exists()) {
                await deleteDoc(favRef);
                setIsFavorite(false);
            } else {
                await setDoc(favRef, { cinemaId, createdAt: serverTimestamp() }, { merge: true });
                setIsFavorite(true);
            }
        } finally {
            setFavBusy(false);
        }
    };

    // reviews subscribe
    useEffect(() => {
        if (!user || !cinemaId || !selectedTag) {
            setReviews([]);
            setReviewLoadError(null);
            setLikedMap({});
            return;
        }

        setReviewLoadError(null);

        const reviewsRef = collection(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews");
        const q =
            sortMode === "likes"
                ? query(reviewsRef, orderBy("likeCount", "desc"), orderBy("updatedAt", "desc"))
                : query(reviewsRef, orderBy("updatedAt", "desc"));

        const unsub = onSnapshot(
            q,
            (snap) => {
                const list: Review[] = snap.docs.map((d) => {
                    const raw = d.data() as Record<string, unknown>;
                    return {
                        id: d.id,
                        userId: String(raw.userId ?? d.id),
                        displayName: String(raw.displayName ?? ""),
                        screen: Number(raw.screen ?? 0),
                        picture: Number(raw.picture ?? 0),
                        sound: Number(raw.sound ?? 0),
                        seat: Number(raw.seat ?? 0),
                        comment: String(raw.comment ?? ""),
                        likeCount: Number(raw.likeCount ?? 0),
                    };
                });

                setReviews(list);

                const mine = list.find((r) => r.id === user.uid);
                if (mine) {
                    setMyReview({
                        screen: mine.screen,
                        picture: mine.picture,
                        sound: mine.sound,
                        seat: mine.seat,
                        comment: mine.comment,
                    });
                    if (!reviewEditorTouched) setReviewEditorOpen(false);
                } else {
                    setMyReview({ screen: 0, picture: 0, sound: 0, seat: 0, comment: "" });
                    if (!reviewEditorTouched) setReviewEditorOpen(true);
                }

                // liked map
                void (async () => {
                    const pairs = await Promise.all(
                        list.map(async (r) => {
                            const likeRef = doc(
                                db,
                                "cinema",
                                cinemaId,
                                "tagReviews",
                                selectedTag,
                                "reviews",
                                r.id,
                                "likes",
                                user.uid
                            );
                            const likeSnap = await getDoc(likeRef);
                            return [r.id, likeSnap.exists()] as const;
                        })
                    );
                    const next: Record<string, boolean> = {};
                    for (const [rid, liked] of pairs) next[rid] = liked;
                    setLikedMap(next);
                })();
            },
            (err) => {
                setReviews([]);
                setLikedMap({});
                setReviewLoadError(err.message || "리뷰를 불러오지 못했습니다.");
            }
        );

        return () => unsub();
    }, [user, cinemaId, selectedTag, sortMode, reviewEditorTouched]);

    const saveMyReview = async () => {
        if (!selectedTag) return;
        setSavingReview(true);
        setError(null);

        const reviewRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", user.uid);
        const statsRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "stats", "summary");

        const newOverall = (myReview.screen + myReview.picture + myReview.sound + myReview.seat) / 4;

        try {
            await runTransaction(db, async (tx) => {
                const reviewSnap = await tx.get(reviewRef);
                const statsSnap = await tx.get(statsRef);

                let oldOverall: number | null = null;
                if (reviewSnap.exists()) {
                    const prev = reviewSnap.data() as any;
                    oldOverall =
                        prev.overall !== undefined
                            ? Number(prev.overall)
                            : (Number(prev.screen ?? 0) +
                                Number(prev.picture ?? 0) +
                                Number(prev.sound ?? 0) +
                                Number(prev.seat ?? 0)) /
                            4;
                }
                const existingLikeCount = reviewSnap.exists() ? Number((reviewSnap.data() as any).likeCount ?? 0) : 0;

                const baseReview = {
                    userId: user.uid,
                    displayName: user.displayName ?? user.email ?? "",
                    screen: myReview.screen,
                    picture: myReview.picture,
                    sound: myReview.sound,
                    seat: myReview.seat,
                    overall: newOverall,
                    comment: myReview.comment,
                    updatedAt: serverTimestamp(),
                    likeCount: existingLikeCount,
                };

                if (!reviewSnap.exists()) {
                    tx.set(
                        reviewRef,
                        {
                            ...baseReview,
                            likeCount: 0,
                            createdAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                } else {
                    tx.set(reviewRef, baseReview, { merge: true });
                }

                const stats = statsSnap.exists() ? (statsSnap.data() as any) : { count: 0, sumOverall: 0 };
                let count = Number(stats.count ?? 0);
                let sumOverall = Number(stats.sumOverall ?? 0);

                if (oldOverall === null) {
                    count += 1;
                    sumOverall += newOverall;
                } else {
                    sumOverall += newOverall - oldOverall;
                }

                const avgOverall = count === 0 ? 0 : sumOverall / count;

                tx.set(
                    statsRef,
                    { count, sumOverall, avgOverall, updatedAt: serverTimestamp() },
                    { merge: true }
                );
            });

            setReviewEditorTouched(true);
            setReviewEditorOpen(false);
        } catch (e) {
            setError(String(e));
        } finally {
            setSavingReview(false);
        }
    };

    const deleteMyReview = async () => {
        if (!selectedTag) return;

        setError(null);
        setSavingReview(true);

        const reviewRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", user.uid);
        const statsRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "stats", "summary");

        try {
            await runTransaction(db, async (tx) => {
                const reviewSnap = await tx.get(reviewRef);
                if (!reviewSnap.exists()) return;

                const prev = reviewSnap.data() as any;
                const oldOverall =
                    prev.overall !== undefined
                        ? Number(prev.overall)
                        : (Number(prev.screen ?? 0) +
                            Number(prev.picture ?? 0) +
                            Number(prev.sound ?? 0) +
                            Number(prev.seat ?? 0)) /
                        4;

                const statsSnap = await tx.get(statsRef);
                const stats = statsSnap.exists() ? (statsSnap.data() as any) : { count: 0, sumOverall: 0 };

                let count = Number(stats.count ?? 0);
                let sumOverall = Number(stats.sumOverall ?? 0);

                tx.delete(reviewRef);

                count = Math.max(0, count - 1);
                sumOverall = sumOverall - oldOverall;
                if (count === 0) sumOverall = 0;

                const avgOverall = count === 0 ? 0 : sumOverall / count;

                tx.set(statsRef, { count, sumOverall, avgOverall, updatedAt: serverTimestamp() }, { merge: true });
            });

            setMyReview({ screen: 0, picture: 0, sound: 0, seat: 0, comment: "" });
            setReviewEditorTouched(true);
            setReviewEditorOpen(true);
        } catch (e) {
            setError(String(e));
        } finally {
            setSavingReview(false);
        }
    };

    const toggleLike = async (reviewId: string) => {
        if (!selectedTag) return;

        if (likeBusy[reviewId]) return;
        setLikeBusy((m) => ({ ...m, [reviewId]: true }));
        setError(null);

        const reviewRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", reviewId);
        const likeRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", reviewId, "likes", user.uid);

        try {
            await runTransaction(db, async (tx) => {
                const likeSnap = await tx.get(likeRef);
                const reviewSnap = await tx.get(reviewRef);

                const currentLike = reviewSnap.exists()
                    ? Number((reviewSnap.data() as any).likeCount ?? 0)
                    : 0;

                if (likeSnap.exists()) {
                    const nextLike = Math.max(0, currentLike - 1);
                    tx.delete(likeRef);
                    tx.set(reviewRef, { likeCount: nextLike }, { merge: true });
                } else {
                    const nextLike = currentLike + 1;
                    tx.set(likeRef, { createdAt: serverTimestamp() }, { merge: true });
                    tx.set(reviewRef, { likeCount: nextLike }, { merge: true });
                }
            });

            setLikedMap((m) => ({ ...m, [reviewId]: !m[reviewId] }));
        } catch (e) {
            setError(String(e));
        } finally {
            setLikeBusy((m) => ({ ...m, [reviewId]: false }));
        }
    };

    const overallScore = (r: { screen: number; picture: number; sound: number; seat: number }) =>
        (r.screen + r.picture + r.sound + r.seat) / 4;

    const tagStats = useMemo(() => {
        if (!selectedTag) return null;
        if (reviews.length === 0) return { count: 0, avgOverall: 0 };
        const n = reviews.length;
        const avgOverall = reviews.reduce((acc, r) => acc + overallScore(r), 0) / n;
        return { count: n, avgOverall };
    }, [reviews, selectedTag]);

    // pagination (reviews)
    useEffect(() => {
        setPage(1);
    }, [selectedTag, sortMode]); // 태그/정렬 바뀌면 1페이지로

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(reviews.length / PAGE_SIZE));
    }, [reviews.length]);

    const pagedReviews = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return reviews.slice(start, start + PAGE_SIZE);
    }, [reviews, page]);

    useEffect(() => {
        // reviews가 줄어들어서 현재 페이지가 범위를 벗어나면 보정
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    if (!cinema) {
        return <div className="muted">로딩중...</div>;
    }

    return (
        <div className="grid">
            {/* Top bar */}
            <div className="glass card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <Link className="pill" to="/">← 홈</Link>

                <div style={{ display: "grid", gap: 4 }}>
                    <h2 className="title" style={{ margin: 0 }}>{cinema.name}</h2>
                    <div className="muted">{cinema.address}</div>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn primary" onClick={toggleFavorite} disabled={favBusy}>
                        {favBusy ? "처리 중..." : isFavorite ? "💔️ 관심 해제" : "❤️ 관심 등록"}
                    </button>
                </div>
            </div>

            {/* Tag */}
            <div className="glass card">
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <h3 className="title" style={{ margin: 0, fontSize: 16 }}>특별 상영관</h3>
                    <div className="muted" style={{ marginLeft: "auto" }}>{selectedTag ? `현재 태그: ${selectedTag}` : ""}</div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {(cinema.tags ?? []).map((tag) => (
                        <button
                            key={tag}
                            className="btn"
                            onClick={() => setSelectedTag(tag)}
                            style={{
                                borderColor: selectedTag === tag ? "rgba(242,208,122,.32)" : undefined,
                                background: selectedTag === tag ? "rgba(242,208,122,.10)" : undefined,
                            }}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>



            {/* Summary */}
            {selectedTag && tagStats && (
                <div className="glass card">
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                        <h3 className="title" style={{ margin: 0, fontSize: 16 }}>상영관 평점</h3>
                        <div className="muted" style={{ marginLeft: "auto" }}>
                            평균 <b>{tagStats.avgOverall.toFixed(1)}</b> / 5.0 · {tagStats.count}명
                        </div>
                    </div>
                    <div className="muted" style={{ marginTop: 8 }}>
                        (크기 + 화질 + 사운드 + 좌석)
                    </div>
                </div>
            )}

            {/* My review */}
            {selectedTag && (
                <div className="glass card">
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <h3 className="title" style={{ margin: 0, fontSize: 16 }}>내 리뷰</h3>
                        <button
                            className="btn"
                            onClick={() => {
                                setReviewEditorTouched(true);
                                setReviewEditorOpen((v) => !v);
                            }}
                            style={{ marginLeft: "auto" }}
                        >
                            {reviewEditorOpen ? "접기" : "리뷰 작성/수정"}
                        </button>
                    </div>

                    {!reviewEditorOpen ? (
                        <div style={{ marginTop: 12, fontSize: 13 }}>
                            <div className="muted">
                                내 평점: 크기 {myReview.screen.toFixed(1)} · 화질 {myReview.picture.toFixed(1)} · 사운드{" "}
                                {myReview.sound.toFixed(1)} · 좌석 {myReview.seat.toFixed(1)}
                            </div>
                            <div style={{ marginTop: 10 }}>
                                {myReview.comment ? `댓글: ${myReview.comment}` : <span className="muted">댓글: (없음)</span>}
                            </div>
                        </div>
                    ) : (
                        <div className="grid" style={{ marginTop: 12 }}>
                            <label className="muted">
                                크기 <b>{myReview.screen.toFixed(1)}</b>
                                <input
                                    className="input"
                                    type="range"
                                    min={0}
                                    max={5}
                                    step={0.5}
                                    value={myReview.screen}
                                    onChange={(e) => setMyReview((v) => ({ ...v, screen: Number(e.target.value) }))}
                                />
                            </label>

                            <label className="muted">
                                화질 <b>{myReview.picture.toFixed(1)}</b>
                                <input
                                    className="input"
                                    type="range"
                                    min={0}
                                    max={5}
                                    step={0.5}
                                    value={myReview.picture}
                                    onChange={(e) => setMyReview((v) => ({ ...v, picture: Number(e.target.value) }))}
                                />
                            </label>

                            <label className="muted">
                                사운드 <b>{myReview.sound.toFixed(1)}</b>
                                <input
                                    className="input"
                                    type="range"
                                    min={0}
                                    max={5}
                                    step={0.5}
                                    value={myReview.sound}
                                    onChange={(e) => setMyReview((v) => ({ ...v, sound: Number(e.target.value) }))}
                                />
                            </label>

                            <label className="muted">
                                좌석 <b>{myReview.seat.toFixed(1)}</b>
                                <input
                                    className="input"
                                    type="range"
                                    min={0}
                                    max={5}
                                    step={0.5}
                                    value={myReview.seat}
                                    onChange={(e) => setMyReview((v) => ({ ...v, seat: Number(e.target.value) }))}
                                />
                            </label>

                            <textarea
                                className="input"
                                rows={3}
                                value={myReview.comment}
                                onChange={(e) => setMyReview((v) => ({ ...v, comment: e.target.value }))}
                                placeholder="리뷰 코멘트를 남겨주세요"
                            />

                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button className="btn primary" onClick={saveMyReview} disabled={savingReview}>
                                    {savingReview ? "저장 중..." : "내 리뷰 저장"}
                                </button>

                                <button className="btn danger" onClick={deleteMyReview} disabled={savingReview}>
                                    내 리뷰 삭제
                                </button>

                                <span className="muted" style={{ marginLeft: "auto" }}>
                  저장하면 랭킹/통계에 반영됩니다
                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Review list */}
            <div className="glass card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 className="title" style={{ margin: 0, fontSize: 16 }}>
                        전체 리뷰
                    </h3>

                    {selectedTag && (
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                className="btn"
                                onClick={() => setSortMode("latest")}
                                style={{
                                    borderColor: sortMode === "latest" ? "rgba(242,208,122,.32)" : undefined,
                                    background: sortMode === "latest" ? "rgba(242,208,122,.10)" : undefined,
                                }}
                            >
                                최신순
                            </button>

                            <button
                                className="btn"
                                onClick={() => setSortMode("likes")}
                                style={{
                                    borderColor: sortMode === "likes" ? "rgba(242,208,122,.32)" : undefined,
                                    background: sortMode === "likes" ? "rgba(242,208,122,.10)" : undefined,
                                }}
                            >
                                좋아요순
                            </button>
                        </div>
                    )}

                    <div className="muted" style={{ marginLeft: "auto" }}>
                        {reviews.length}개
                    </div>
                </div>

                {reviewLoadError && (
                    <div style={{ marginTop: 10, color: "#fca5a5", fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {reviewLoadError}
                    </div>
                )}

                {error && (
                    <div style={{ marginTop: 10, color: "#fca5a5", fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {error}
                    </div>
                )}

                <div className="grid" style={{ marginTop: 12 }}>
                    {pagedReviews.map((r) => {
                        const liked = !!likedMap[r.id];
                        const busy = !!likeBusy[r.id];

                        return (
                            <div key={r.id} className="glass card" style={{ boxShadow: "none" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <b>{r.displayName || r.userId}</b>

                                    <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                                        <span className="pill">❤️ {r.likeCount}</span>
                                        <button className="btn" onClick={() => toggleLike(r.id)} disabled={busy}>
                                            {busy ? "..." : liked ? "좋아요 취소" : "좋아요"}
                                        </button>
                                    </div>
                                </div>

                                <div className="muted" style={{ marginTop: 8 }}>
                                    크기 {r.screen.toFixed(1)} · 화질 {r.picture.toFixed(1)} · 사운드 {r.sound.toFixed(1)} · 좌석{" "}
                                    {r.seat.toFixed(1)} · 평균 <b>{overallScore(r).toFixed(1)}</b>
                                </div>

                                {r.comment && <div style={{ marginTop: 10 }}>{r.comment}</div>}
                            </div>
                        );
                    })}
                </div>
                {reviews.length > PAGE_SIZE && (
                    <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 12 }}>
                        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            이전
                        </button>

                        <span className="muted">
      {page} / {totalPages}
    </span>

                        <button
                            className="btn"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                            다음
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
