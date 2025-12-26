# 🎬 Your Special Cinema
> **너를 위한 특별 영화관 리스트**

웹(Web App)과 모바일(Mobile App)을 동시에 개발하고,
**Firebase를 통해 동일한 데이터베이스(Firestore)를 공유**하는 영화관 정보 & 리뷰 서비스입니다.

---

## 📌 프로젝트 개요

- **과목**: 2025-2학기 초급프로젝트 Term Project
- **프로젝트 유형**: Web + Mobile 연동 서비스
- **주제**: 특별 상영관 검색 및 리뷰 평점 사이트
- **개발자**: 강석민

---

## 🛠️ 사용 기술 스택

### Web App
- React + TypeScript + Vite
- React Router
- Firebase Authentication
- Firebase Firestore
- 배포: **JCloud (Nginx)**

### Mobile App
- React Native (Expo) + TypeScript
- React Navigation
- Firebase Authentication
- Firebase Firestore

---

## 🔗 배포 주소

### 🌐 Web App (JCloud)
- `http://113.198.66.68:10103`

**JCloud에 직접 배포**했습니다.

### 📱 Mobile App
- Expo 기반 React Native 앱
- 시연 영상에서 실행 흐름을 확인할 수 있습니다.

---

## 🔐 주요 기능

### 1) 사용자 인증 (Firebase Auth)
- 이메일/비밀번호 회원가입 & 로그인
- Google 소셜 로그인
- 닉네임 설정 및 중복 방지
- 로그아웃

### 2) 홈
- 내 위치 기반 **주변 특별 영화관 목록**
- 반경 선택 (1km ~ 100km)
- 지도 기반 영화관 표시
- 랭킹 TOP10 표시

### 3) 특별 영화관 검색
- 전체 영화관 목록 조회
- 체인별 필터 (CGV / 롯데시네마 / 메가박스 / 기타)
- 지역별 필터
- 페이지네이션

### 4) 영화관 상세
- 영화관 정보 조회
- 특별 상영관 태그 선택
- 리뷰 CRUD
- 좋아요 기능
- 리뷰 정렬 (최신순 / 좋아요순)

### 5) 관심 영화관
- 관심 등록/해제
- 관심 목록 조회
- 페이지네이션

---

## 🔄 Web ↔ Mobile 데이터 연동

- Web App과 Mobile App이 **동일한 Firebase 프로젝트**를 사용합니다.
- 한쪽에서 작성/수정한 데이터가 다른 쪽에서도 즉시 반영됩니다.

---

## ▶️ 실행 방법

### Web App (로컬)
```bash
npm install
npm run dev
```

### Web App (배포)
```bash
npm run build
# dist/ 산출물을 JCloud 서버(Nginx)로 배포
```

### Mobile App (Expo)
```bash
npm install
npx expo start
```

---

## 🎥 시연 영상

- Web App 실행 화면
- Mobile App 실행 화면
- Firebase 연동 확인
- 로그인/데이터 CRUD 흐름

---

## 📂 GitHub Repository

📎 **GitHub 주소**:
Web App
- https://github.com/gangsuckmin/PB-Project.git
---
