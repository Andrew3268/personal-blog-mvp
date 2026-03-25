# 개인 블로그 MVP (Cloudflare Pages + Functions + D1)

이 프로젝트는 **글 작성 → D1 저장 → `/post/:slug` SSR 렌더링 → Cloudflare 엣지 캐시** 흐름으로 동작하는 개인 블로그 MVP입니다.

## 핵심 구조
- 홈 / 글목록 / 소개: `public/` 아래 정적 페이지
- 개별 글 페이지: `functions/post/[slug].js`에서 SSR HTML 생성
- 글 등록 / 수정: `public/add.html`, `public/edit.html`
- 데이터 저장: Cloudflare D1
- 캐시: `functions/_utils.js`의 `edgeCache()` 사용
- 사이트맵: `functions/sitemap.xml.js`

## 작성 방식
관리자 화면에서 아래 항목을 입력합니다.
- 제목
- 슬러그
- 카테고리
- 요약문
- 태그
- 대표 이미지 URL
- 플랫폼 템플릿
- 본문 마크다운

저장하면 D1에 저장되고, 실제 공개 페이지는 `/post/슬러그`에서 HTML로 SSR 생성됩니다.

## 로컬 실행
```bash
npm i
wrangler d1 create personal-blog-db
```

생성된 `database_id`를 `wrangler.toml`에 넣은 뒤:

```bash
npm run d1:exec
npm run d1:seed
npm run dev
```

## 주요 URL
- 홈: `http://localhost:8788/`
- 글 목록: `http://localhost:8788/posts/`
- 글 작성: `http://localhost:8788/add.html`
- 글 수정: `http://localhost:8788/edit.html?slug=your-slug`
- 글 상세(SSR): `http://localhost:8788/post/your-slug`
- 사이트맵: `http://localhost:8788/sitemap.xml`

## 배포 흐름
1. GitHub 저장소 생성
2. 이 프로젝트 업로드
3. Cloudflare Pages에서 Git 연결
4. Pages 프로젝트에 D1 바인딩 `BLOG_DB` 연결
5. main 브랜치 push 시 자동 배포

## 캐시 확인
글 상세 페이지 응답 헤더에서 아래 값을 확인할 수 있습니다.
- `x-blog-cache: HIT`
- `x-blog-cache: MISS`

## 다음 단계 확장 아이디어
- 관리자 인증 추가
- 공개/비공개 상태 분리
- 예약 발행
- 태그 페이지 / 카테고리 페이지
- RSS 생성
- OG 이미지 자동 생성
