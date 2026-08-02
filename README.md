# Wacky Wiki 개인 블로그

Cloudflare Pages + Pages Functions + D1 기반의 SSR 블로그입니다. 공개 글은 서버에서 완성된 HTML로 렌더링되며, 게시글·카테고리·사이트맵·RSS가 D1 데이터와 연동됩니다.

## 핵심 구조

- 홈·카테고리 목록 SSR: `functions/index.js`, `functions/category/[category].js`
- 게시글 SSR: `functions/post/[slug].js`
- 공개 API: `functions/api/posts.js`, `functions/api/categories.js`
- 관리자 인증·글 관리: `functions/api/admin/*`, `public/admin/`, `public/add.html`, `public/edit.html`
- 사이트맵·RSS: `functions/sitemap.xml.js`, `functions/rss.xml.js`
- R2 이미지 프록시·리사이징: `functions/img/[encoded].js`, `lib/image-utils.js`
- 공통 보안·정규화 미들웨어: `functions/_middleware.js`

## 기술적 SEO 적용 사항

- 홈·카테고리·게시글의 고유 title, description, canonical, robots 메타
- 페이지 2 이후도 Google이 발견할 수 있는 실제 `a[href]` 페이지네이션
- 존재하지 않는 카테고리와 초과 페이지 번호의 실제 404 응답
- 빈 카테고리와 태그 필터 URL의 `noindex,follow`
- 게시글 `BlogPosting`, `BreadcrumbList`, FAQ 구조화 데이터
- 발행 글과 공개 글이 있는 카테고리만 사이트맵에 포함
- 최초 공개일과 실제 본문 수정일을 분리하여 `datePublished`, `dateModified`, `lastmod`에 반영
- API·관리자 페이지의 `X-Robots-Tag: noindex, nofollow`
- `www`, `pages.dev`, `index.html`, 비표준 슬래시·페이지 번호 URL의 301 정규화

## 기존 D1 데이터베이스

페이지 요청 중에는 테이블 생성, 컬럼 추가, 기본 데이터 입력을 실행하지 않습니다. 배포 전에 `db/migrations/`의 SQL을 D1에 적용해야 합니다.

현재 운영 DB에는 다음 마이그레이션이 적용되어 있어야 합니다.

- `2026-07-31-seo-hardening.sql`: `posts.first_published_at`, 관련 인덱스
- `2026-07-31-add-metadata-updated-at.sql`: `posts.metadata_updated_at`, 관련 인덱스
- `2026-08-02-runtime-schema-initialization.sql`: 관리자·카테고리·사이트 설정 테이블과 기본값
- `2026-08-02-query-normalization-and-indexes.sql`: 게시글 카테고리·발행일·조회수 정규화와 조회 패턴별 복합 인덱스

이번 성능 개선 배포 전에는 다음 순서로 실행합니다.

```bash
npm run d1:migrate:runtime-init:remote
npm run d1:migrate:query-optimization:remote
```

이미 1차 마이그레이션을 적용했다면 두 번째 명령만 실행하면 됩니다. 반드시 D1 마이그레이션이 성공한 뒤 코드를 배포하세요.

1차 마이그레이션은 기존 관리자·카테고리·사이트 설정 값을 덮어쓰지 않습니다. 2차 마이그레이션은 게시글 본문을 변경하지 않고 카테고리 공백, 발행일 형식, 조회수 NULL·음수만 정규화한 뒤 인덱스를 교체합니다. 운영 데이터를 유지하려면 **`db/seed.sql`을 다시 실행하지 마세요.**

## 최초 관리자 계정 생성

새 D1 데이터베이스에서 관리자 계정을 처음 만들 때 Cloudflare Pages 환경변수에 다음 값을 먼저 등록해야 합니다.

```text
ADMIN_SETUP_TOKEN=충분히 긴 임의 문자열
```

관리자 초기 설정 화면에서 같은 값을 입력해야 계정을 생성할 수 있습니다. 기존 관리자 계정이 이미 있는 운영 DB에는 영향을 주지 않습니다.

## 애드센스

- 게시자 ID: `ca-pub-7298667883751711`
- `public/ads.txt`가 사이트 루트 `/ads.txt`로 배포됩니다.
- 광고 슬롯 ID는 Cloudflare 환경변수로 관리할 수 있습니다.

```text
ADSENSE_SLOT_SIDEBAR
ADSENSE_SLOT_INARTICLE_1
ADSENSE_SLOT_INARTICLE_2
```

## 로컬 실행

```bash
npm install
npm run dev
```

새 로컬 D1 데이터베이스를 준비할 때만 다음을 실행합니다.

```bash
npm run d1:exec
npm run d1:seed
```

## 배포

1. 변경 파일을 Git에 커밋합니다.
2. GitHub의 `main` 브랜치로 push합니다.
3. Cloudflare Pages 자동 배포가 성공했는지 확인합니다.
4. 배포 후 `/robots.txt`, `/sitemap.xml`, `/ads.txt`와 공개 게시글 소스를 확인합니다.

## 주요 URL

- 홈: `/`
- 카테고리: `/category/카테고리명/`
- 게시글: `/post/슬러그`
- 관리자: `/admin/`
- 사이트맵: `/sitemap.xml`
- RSS: `/rss.xml`
