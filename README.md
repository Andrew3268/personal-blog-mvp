# Wacky Wiki 개인 블로그

Cloudflare Pages + Pages Functions + D1 기반의 SSR 블로그입니다. 공개 글은 서버에서 완성된 HTML로 렌더링되며, 게시글·카테고리·사이트맵·RSS가 D1 데이터와 연동됩니다.


## 글 수정일 관리

- `posts.updated_at`은 관리자가 체크박스로 지정하지 않고 서버가 실제 공개 콘텐츠 변경 여부를 비교해 자동 관리합니다.
- 제목, 작성자, 요약, 대표 이미지, 본문, FAQ처럼 독자에게 보이는 내용이 바뀌면 `updated_at`이 현재 시각으로 갱신됩니다.
- 메타 설명, SEO 키워드, 태그, 광고 설정처럼 공개 본문의 실질 내용이 바뀌지 않은 저장은 기존 `updated_at`을 유지합니다.
- 초안을 처음 발행하는 경우에도 발행 시각에 맞춰 수정일이 갱신됩니다.
- `metadata_updated_at`은 관리자 저장 이력을 추적하기 위해 저장할 때 갱신됩니다.

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
- 게시글 `BlogPosting`, `WebPage`, `BreadcrumbList`, `WebSite`, `Organization`을 `@graph`로 연결한 JSON-LD 구조화 데이터
- Life/Tech/Pet 작성자 전용 `ProfilePage`와 게시글 `author` 엔터티 연결
- 발행 글과 공개 글이 있는 카테고리만 사이트맵에 포함
- 최초 공개일과 실제 공개 콘텐츠 수정일을 분리하여 `datePublished`, `dateModified`, `lastmod`에 반영
- 대표 이미지가 없을 때 사이트 로고를 기사 이미지로 강제 사용하지 않고, 본문 첫 이미지가 있을 때만 BlogPosting `image`로 사용
- API·관리자 페이지의 `X-Robots-Tag: noindex, nofollow`
- `www`, `pages.dev`, `index.html`, 비표준 슬래시·페이지 번호 URL의 301 정규화

## 기존 D1 데이터베이스

페이지 요청 중에는 테이블 생성, 컬럼 추가, 기본 데이터 입력을 실행하지 않습니다. 배포 전에 `db/migrations/`의 SQL을 D1에 적용해야 합니다.

현재 운영 DB에는 다음 마이그레이션이 적용되어 있어야 합니다.

- `2026-07-31-seo-hardening.sql`: `posts.first_published_at`, 관련 인덱스
- `2026-07-31-add-metadata-updated-at.sql`: `posts.metadata_updated_at`, 관련 인덱스
- `2026-08-02-runtime-schema-initialization.sql`: 관리자·카테고리·사이트 설정 테이블과 기본값
- `2026-08-02-query-normalization-and-indexes.sql`: 게시글 데이터 정규화와 조회 패턴별 복합 인덱스
- `2026-08-02-cache-tags-view-aggregation.sql`: 관계형 태그 테이블과 조회수 누적 테이블
- `2026-08-22-add-post-author-key.sql`: 게시글 작성자 키 분리 및 Life/Tech/Pet 기존 글 작성자 백필

각 단계가 아직 적용되지 않은 DB라면 다음 순서대로 실행합니다.

```bash
npm run d1:migrate:runtime-init:remote
npm run d1:migrate:query-optimization:remote
npm run d1:migrate:performance-phase3:remote
npm run d1:migrate:category-subcategories:remote
npm run d1:migrate:post-author:remote
```

기존 마이그레이션이 이미 적용된 운영 DB라면 이번 변경에서는 `d1:migrate:post-author:remote`를 새로 1회 실행하면 됩니다.

운영 데이터를 유지하려면 **`db/seed.sql`을 다시 실행하지 마세요.** `2026-08-22-add-post-author-key.sql`은 `ALTER TABLE`을 포함하므로 운영 DB에서 1회만 실행합니다.


## 메인/서브 카테고리 마이그레이션 (2026-08-12)

이번 버전부터 서브 카테고리는 `subcategories`, 글별 선택값은 `post_subcategories` 테이블에 저장합니다. 기존 `posts.category`와 공개 카테고리 URL 구조는 그대로 유지됩니다.

운영 D1에는 **배포 전 또는 배포 직후 1회** 다음 명령을 실행하세요.

```bash
npm run d1:migrate:category-subcategories:remote
```

마이그레이션은 `CREATE TABLE IF NOT EXISTS` 기반이라 여러 번 실행해도 기존 글과 카테고리를 덮어쓰지 않습니다. 실행하지 않으면 `/admin/categories.html`의 서브 카테고리 관리와 add/edit의 서브 카테고리 저장 기능을 사용할 수 없습니다.


## 게시글 작성자 마이그레이션 (2026-08-22)

이번 버전부터 게시글 작성자는 카테고리명에서 추론하지 않고 `posts.author_key`에 별도로 저장합니다. 운영 D1에는 **새 코드를 배포하기 전에 1회** 다음 명령을 실행하세요.

```bash
npm run d1:migrate:post-author:remote
```

마이그레이션은 기존 `Life`, `Tech`, `Pet` 글을 각각 `Life.Archiver`, `Tech.Archiver`, `Pet.Archiver`로 연결합니다. 그 외 기존 카테고리 글은 작성자를 임의 추정하지 않고 Wacky Wiki 조직 작성자로 처리하며, 이후 편집 화면에서 작성자를 직접 선택할 수 있습니다. 운영 데이터를 유지하려면 `db/seed.sql`은 다시 실행하지 마세요.

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

## 정적 자산 캐시 정책

CSS와 JavaScript는 파일명을 수동으로 `v14`, `v15`처럼 바꾸거나 `?v=`를 붙이지 않습니다. 개발 원본은 `public/assets/css/app.css`와 각 JavaScript 파일 하나만 유지합니다.

Cloudflare Pages의 기본 정적 자산 캐시를 사용합니다. Pages가 CDN 캐시, ETag 재검증, Brotli/Gzip을 처리하고 새 배포 시 배포된 자산을 갱신하므로, 변경 가능한 CSS/JS 파일에는 별도의 장기 `immutable` Cache-Control을 설정하지 않습니다.

배포 전 다음 검증을 실행할 수 있습니다.

```bash
npm run verify:assets
```

`npm run deploy`를 사용할 경우 `predeploy`에서 이 검사가 자동 실행됩니다. `app-*.css`, 로컬 자산의 `?v=`, CSS/JS에 대한 장기 immutable 캐시가 다시 추가되면 검증이 실패합니다.

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
