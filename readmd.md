# EV 무선충전 데모 프로젝트 안내

React 기반 사용자/관리자 화면과 FastAPI + SQLite 백엔드를 갖춘 풀스택 예제입니다. 한 번의 스크립트 실행으로 가상환경/의존성 설치와 개발 서버 실행이 가능하며, 예약 생성/삭제가 프런트와 DB 모두에 즉시 반영됩니다.

## 폴더 구조
```
backend/
  app/
    main.py             # FastAPI 엔드포인트 + SQLAlchemy ORM
  reservations.db      # SQLite 데이터베이스 (자동 생성/업데이트)
  requirements.txt
  setup.sh / setup.ps1 # 백엔드 가상환경/패키지 설치 스크립트
frontend/
  index.html
  package.json
  vite.config.ts
  src/
    main.tsx           # Vite 진입점
    App.tsx            # 공통 로그인 및 역할 분기
    pages/
      UserFront.tsx    # 사용자 예약 UI (가능 시간 실시간 계산)
      AdminPage.tsx    # 관리자 예약 관리 UI (추가/삭제)
setup_all.sh / setup_all.ps1  # 루트에서 백엔드+프런트 의존성 설치
run_all.sh / run_all.ps1      # 백엔드+프런트 개발 서버 실행
readmd.md                     # 사용 가이드
```

## 최초 설정
루트에서 아래 명령 중 하나를 실행하세요.
- Bash/Git Bash: `./setup_all.sh`
- PowerShell: `./setup_all.ps1`

동작 내용
1. `backend/.venv` 가상환경 생성 및 FastAPI/SQLAlchemy 등 의존성 설치
2. `backend/reservations.db` 스키마 자동 생성 및 필요 시 컬럼 추가
3. `frontend`에서 `npm install` 실행

## 개발 서버 실행
루트에서 다음 명령으로 FastAPI(8000)와 Vite Dev Server(5173)를 동시에 띄웁니다.
- Bash/Git Bash: `./run_all.sh`
- PowerShell: `./run_all.ps1`

실행 확인
- 백엔드: `http://localhost:8000/health`, `http://localhost:8000/docs`
- 프런트: `http://localhost:5173`
- 로그인 화면에서 관리자(admin@demo.dev / admin123) 또는 자유 이메일/비밀번호로 로그인 역할이 결정됩니다.

중지 시 터미널에서 `Ctrl+C`로 프런트를 내리면 백엔드 잡도 함께 종료됩니다.

## 주요 기능
### 사용자 화면
- 로그인 후 번호판 검증 → 날짜/세션/시간대 선택 → 예약 생성
- `GET /api/user/sessions?date=...&durationMin=...`에서 반환된 실제 가능 시간만 드롭다운에 표시
- 예약 성공 시 `GET /api/user/reservations`를 통해 나의 예약 목록 카드에 즉시 반영

### 관리자 화면
- 관리자 로그인 후 날짜별 세션(1~4) 예약 현황 조회
- 예약 삭제 시 DB에서 제거 후 프런트 목록도 즉시 업데이트
- 일정 추가 폼 제공 (세션/시간/소요시간/메모 입력) → `POST /api/admin/reservations`
- 자동 새로고침(30초) 옵션과 수동 새로고침 버튼 제공

### 백엔드 REST API 요약
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/user/login` | 사용자 로그인 토큰 발급 |
| GET  | `/api/user/sessions` | 날짜·소요시간 기준 가능 시작 시간 목록 |
| POST | `/api/user/reservations` | 사용자 예약 생성(중복 검사) |
| GET  | `/api/user/reservations` | 로그인 사용자의 예약 목록 조회 |
| POST | `/api/admin/login` | 관리자 인증 |
| GET  | `/api/admin/sessions` | 세션별 예약 목록 조회 |
| POST | `/api/admin/reservations` | 관리자 예약(블록) 추가 |
| DELETE | `/api/admin/reservations/{id}` | 예약 삭제 |

모든 예약 기록은 SQLite `reservations` 테이블에 저장되며, 시드 데이터는 하루/세션별 최초 조회 시 한 번만 삽입됩니다.

## 단위 테스트 / 빌드 확인
- 백엔드 문법 확인: `cd backend && .venv/Scripts/python.exe -m compileall backend`
- 프런트 빌드: `cd frontend && npm run build`

## 참고 사항
- `reservations.db` 스키마 변경은 애플리케이션 시작 시 `ensure_schema()`에서 자동으로 적용됩니다.
- 기존 DB로 실행 중 오류가 난다면 `backend/reservations.db`를 삭제한 후 `setup_all`을 다시 실행하세요.
- 향후 방송/알림과 같은 실시간 기능은 추가 구현이 필요합니다.
