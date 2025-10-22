# EV 무선충전 데모 프로젝트

React 기반 사용자/관리자 프런트엔드와 FastAPI + SQLite 백엔드가 한 번에 구동되는 풀스택 예제입니다. 루트 스크립트만 실행하면 가상환경/의존성 설치부터 개발 서버 실행, 실시간 예약 동기화까지 모두 자동화되어 있습니다.

---

## 기능 요약
- **사용자 화면**
  - 이메일/패스워드 로그인, 번호판 검증
  - 날짜·세션·소요시간에 맞는 “빈 시간대”만 선택 가능
  - 예약 완료 시 “나의 예약 목록”에 즉시 반영
- **관리자 화면**
  - 세션(1~4)별 예약 현황 실시간 조회, 30초 자동 새로고침
  - 일정 추가(세션/시간/소요·메모) 및 삭제 시 프런트·DB 동기화
  - 사용자 예약과 관리자 블록을 구분하여 저장(`source`, `owner_email`)

---

## 디렉터리 구조
```
backend/
  app/
    main.py             # FastAPI 엔드포인트 + SQLAlchemy ORM
  requirements.txt
  setup.sh / setup.ps1  # 백엔드 가상환경/패키지 설치 스크립트
frontend/
  package.json
  vite.config.ts
  src/
    App.tsx             # 공통 로그인 및 역할 분기
    pages/
      AdminPage.tsx     # 관리자 UI (추가/삭제 즉시 반영)
      UserFront.tsx     # 사용자 UI (가용 시간 계산 + 예약 내역)
setup_all.sh / setup_all.ps1  # 루트에서 백엔드 + 프런트 의존성 설치
run_all.sh / run_all.ps1      # FastAPI + Vite 개발 서버 동시 실행
readmd.md / report.md         # 사용 가이드, 작업 보고서
```
**주의**: `backend/reservations.db`는 실행 시 자동 생성되며 Git에는 추적되지 않습니다.

---

## 설치 & 실행
### 1. 최초 세팅
루트에서 아래 스크립트 중 하나를 실행하세요.
- **Bash / Git Bash**: `./setup_all.sh`
- **PowerShell**   : `./setup_all.ps1`

내용: `backend/.venv` 생성 → FastAPI/SQLAlchemy 등 설치 → SQLite 스키마 자동 구성 → `frontend`에서 `npm install` 실행

### 2. 개발 서버 기동
- Bash / Git Bash: `./run_all.sh`
- PowerShell   : `./run_all.ps1`

실행 후 확인:
- 백엔드 헬스체크: `http://localhost:8000/health`
- OpenAPI 문서  : `http://localhost:8000/docs`
- 프런트 UI    : `http://localhost:5173`
  - 관리자 계정: `admin@demo.dev / admin123`
  - 사용자 계정: 임의 이메일/비밀번호 입력 가능

서버 종료 시 터미널에서 `Ctrl+C`를 누르면 Vite가 종료되고, 스크립트가 uvicorn 백엔드도 함께 정리합니다.

---

## REST API
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/user/login` | 사용자 로그인 토큰 발급 |
| GET  | `/api/user/sessions` | 날짜·소요시간 기준 가용 시작 시간 조회 |
| POST | `/api/user/reservations` | 사용자 예약 생성 (중복/시간대 검증) |
| GET  | `/api/user/reservations` | 사용자별 예약 목록 조회 |
| POST | `/api/admin/login` | 관리자 로그인 |
| GET  | `/api/admin/sessions` | 세션별 예약 목록 조회 |
| POST | `/api/admin/reservations` | 관리자 일정(블록) 추가 |
| DELETE | `/api/admin/reservations/{id}` | 예약 삭제 |

모든 예약은 SQLite `reservations` 테이블에 저장되며, 날짜·세션 최초 조회 시 한 번만 시드 데이터가 삽입됩니다.

---

## 테스트 & 빌드
- 백엔드 문법/스키마 확인: `cd backend && .venv/Scripts/python.exe -m compileall backend`
- 프런트 빌드 확인      : `cd frontend && npm run build`

각 명령 성공 후에는 `frontend/dist/`, `backend/__pycache__/` 등이 생성되지만 `.gitignore`에 포함되어 있으니 커밋에 영향을 주지 않습니다.

---

## 참고 사항
- `backend/reservations.db`를 삭제하면 다음 실행 시 자동으로 최신 스키마로 재생성됩니다.
- 기존 DB로 인한 UNIQUE 충돌이 발생하면 DB 파일을 삭제 후 `run_all`을 다시 실행하세요.
- 방송/알림 등 실시간 안내 기능은 TODO로 남겨 두었습니다. 필요 시 WebSocket/이벤트 브로커를 추가해 확장할 수 있습니다.

즐거운 개발 되세요!
