import { useEffect, useState } from "react";
import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    createUserWithEmailAndPassword,
    updateProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

import Home from "./pages/Home";
import AllCinemas from "./pages/AllCinemas";
import CinemaDetail from "./pages/CinemaDetail";
import Favorites from "./pages/Favorites";

export default function App() {
    const [user, setUser] = useState<User | null>(null);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const authModeKey = isSignUp ? "signup" : "login";
    const [nickname, setNickname] = useState("");


    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    const handleEmailAuth = async () => {
        try {
            setError(null);
            if (isSignUp) {
                const nick = nickname.trim();
                if (!nick) {
                    setError("닉네임을 입력해주세요.");
                    return;
                }
                if (nick.length < 2) {
                    setError("닉네임은 2글자 이상으로 입력해주세요.");
                    return;
                }
                if (passwordConfirm !== password) {
                    setError("비밀번호가 일치하지 않습니다.");
                    return;
                }

                // 1) Auth 계정 생성
                const cred = await createUserWithEmailAndPassword(auth, email, password);

                // 2) 닉네임 중복 방지: nicknames/{nicknameLower} 문서로 예약
                const nickKey = nick.toLowerCase(); // 대소문자 무시 중복 방지
                const nickRef = doc(db, "nicknames", nickKey);
                const userRef = doc(db, "users", cred.user.uid);

                await runTransaction(db, async (tx) => {
                    const nickSnap = await tx.get(nickRef);
                    if (nickSnap.exists()) {
                        throw new Error("이미 사용 중인 닉네임입니다.");
                    }

                    tx.set(nickRef, {
                        uid: cred.user.uid,
                        nickname: nick,
                        createdAt: serverTimestamp(),
                    });

                    tx.set(
                        userRef,
                        {
                            uid: cred.user.uid,
                            email: cred.user.email ?? email,
                            nickname: nick,
                            createdAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                });

                // 3) Auth displayName 저장 (리뷰/댓글에 user.displayName으로 바로 뜸)
                await updateProfile(cred.user, { displayName: nick });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setError(null);
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e) {
            setError(String(e));
        }
    };

    if (!user) {
        return (
            <div className="container">
                <div className="glass card" style={{ maxWidth: 600, margin: "200px auto 0" }}>
                    <div className="brand" style={{ marginBottom: 50 }}>
                        <span style={{ fontSize: 30}}></span>
                        <span>Your Special Cinema</span>
                        <span className="badge"> 너를 위한 특별 영화관 리스트 </span>
                    </div>

                    <div key={authModeKey} className="grid authSwap">
                        <div className="muted" style={{ fontSize: 15 }}>
                            {isSignUp ? " 회원가입" : " 로그인"}
                        </div>
                        <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        <input
                            className="input"
                            placeholder="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        {isSignUp && (
                            <input
                                className="input"
                                placeholder="confirm password"
                                type="password"

                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                            />

                        )}

                        {isSignUp && (
                            <input
                                className="input"
                                placeholder="nickname"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                            />
                        )}

                        {error && (
                            <div style={{ color: "#fca5a5", fontSize: 12, whiteSpace: "pre-wrap" }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button className="btn primary" onClick={handleEmailAuth}>
                                {isSignUp ? "회원가입" : "로그인"}
                            </button>
                            <button
                                className="btn"
                                onClick={() => {
                                    setError(null);
                                    setPasswordConfirm("");
                                    setNickname("");
                                    setIsSignUp((v) => !v);
                                }}
                            >
                                {isSignUp ? "로그인으로 전환" : "회원가입으로 전환"}
                            </button>
                            <button className="btn" onClick={handleGoogleLogin}>
                                Google 로그인
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <div className="glass header">
                <div className="brand">
                    <span style={{ fontSize: 20 }}></span>
                    <span> Your Special Cinema  </span>
                    <Link className="pill" to="/"> 너를 위한 특별 영화관 리스트 </Link>
                </div>

                {error && (
                    <div style={{ marginLeft: 12, color: "#fca5a5", fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {error}
                    </div>
                )}

                <div className="nav">
                    <Link className="pill" to="/">🏠 홈</Link>
                    <Link className="pill" to="/cinemas">🛰️ 특별 영화관 검색</Link>
                    <Link className="pill" to="/favorites">❤️ 나의 관심 영화관</Link>
                    <button className="btn danger" onClick={() => signOut(auth)}>로그아웃</button>
                </div>
            </div>

            <div style={{ height: 14 }} />

            <Routes>
                <Route path="/" element={<Home user={user} />} />
                <Route path="/cinemas" element={<AllCinemas user={user} />} />
                <Route path="/cinema/:id" element={<CinemaDetail user={user} />} />
                <Route path="/favorites" element={<Favorites user={user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}
