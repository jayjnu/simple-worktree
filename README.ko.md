# @jayjnu/simple-worktree

레포별 `.worktree.yaml` 설정을 기준으로 Git worktree 생성/정리를 도와주는 작은 CLI입니다.

- [English](./README.md) | 한국어
- 바이너리 이름: `swt`, `simple-worktree`
- 기본적으로 `.worktrees/` 아래에 worktree 생성
- `.env` 같은 로컬 전용 파일을 새 worktree로 복사
- 선택적으로 생성/정리 hook 실행

## 요구사항

### CLI 사용 시

- Node.js 18+
- Git
- 아래 예시처럼 `pnpm dlx`, `pnpm exec`를 쓰려면 pnpm 필요

pnpm이 아직 활성화되어 있지 않다면:

```bash
corepack enable
```

### 이 패키지를 개발할 때

- Node.js 22.22.x, 권장 `22.22.3`
- pnpm `10.32.1`

이 저장소에는 개발용 `.nvmrc`, `.node-version`이 포함되어 있습니다. 높은 Node 버전 요구사항은 이 패키지를 개발/빌드하기 위한 기준입니다. 배포된 CLI를 설치해서 사용하는 런타임 기준은 위의 사용 요구사항을 따릅니다.

## 빠른 시작

worktree 기능을 사용할 저장소에서 실행하세요:

```bash
pnpm dlx @jayjnu/simple-worktree init
```

생성된 설정을 확인하고 commit합니다:

```bash
git add .worktree.yaml
git commit -m "add worktree config"
```

worktree를 생성합니다:

```bash
pnpm dlx @jayjnu/simple-worktree create feature/my-task
```

나중에 정리합니다:

```bash
pnpm dlx @jayjnu/simple-worktree cleanup feature/my-task
```

> child worktree 안에서 `--config` 없이 `cleanup`을 실행하고 싶다면, worktree를 만들기 전에 `.worktree.yaml`을 commit해두세요.

## 반복 사용을 위한 설치

프로젝트에 devDependency로 설치:

```bash
pnpm add -D @jayjnu/simple-worktree
pnpm exec swt create feature/my-task
pnpm exec swt cleanup feature/my-task
```

전역 설치:

```bash
pnpm add -g @jayjnu/simple-worktree
swt create feature/my-task
swt cleanup feature/my-task
```

## 설정

`swt init`은 다음 기본 설정을 생성합니다:

```yaml
worktreeDir: .worktrees

copyFiles: []

hooks:
  postCreate: []
  preCleanup: []
  postCleanup: []
```

조금 더 현실적인 예시:

```yaml
worktreeDir: .worktrees

copyFiles:
  - backend/.env
  - frontend/.env.local

hooks:
  postCreate:
    - pnpm install
  preCleanup: []
  postCleanup: []
```

### `worktreeDir`

primary worktree 아래에서 새 worktree가 생성될 상대 경로입니다. 기본값은 `.worktrees`입니다.

`..`, `.`, `.git/**` 같은 위험한 값은 거부됩니다.

### `copyFiles`

primary worktree에서 새 worktree로 복사할 상대 파일 목록입니다.

다음처럼 의도적으로 commit하지 않는 파일에 사용하면 좋습니다:

- `.env`
- `.env.local`
- 로컬 도구 설정

없는 파일은 경고만 출력하고 건너뜁니다.

### `hooks`

현재 플랫폼의 기본 shell을 통해 실행되는 명령입니다.

- `postCreate`: `copyFiles` 복사 후 새 worktree 안에서 실행
- `preCleanup`: 대상 worktree 제거 전에 대상 worktree 안에서 실행
- `postCleanup`: 제거 후 primary worktree 안에서 실행

## 명령어

### `swt init`

```bash
swt init [--force] [--config .worktree.yaml]
```

기본 설정 파일을 생성합니다. 이미 설정 파일이 있으면 덮어쓰지 않습니다. 덮어쓰려면 `--force`를 사용하세요.

### `swt create`

```bash
swt create [--enter] [--config .worktree.yaml] <branch-name> [base-ref]
```

primary worktree 아래 `<worktreeDir>/<sanitized-branch-name>` 경로에 worktree를 생성합니다.

동작:

- `<branch-name>`이 이미 있으면 해당 branch를 새 worktree에 checkout합니다.
- 없으면 `[base-ref]` 또는 실행한 worktree의 `HEAD`에서 branch를 생성합니다.
- `postCreate`가 실패하면 새로 생성한 worktree와 branch를 rollback합니다.
- `--enter`는 호환성을 위해 받지만, child process가 parent shell의 디렉터리를 바꿀 수는 없습니다. 대신 복사해서 쓸 수 있는 `cd` 힌트를 출력합니다.

### `swt cleanup`

```bash
swt cleanup [--config .worktree.yaml] [--keep-branch] [--force] [worktree-path-or-branch]
```

Git worktree를 제거합니다.

동작:

- 대상이 없으면 현재 worktree context를 제거합니다.
- primary repository worktree는 제거하지 않습니다.
- 기본적으로 worktree branch도 삭제합니다.
- branch를 남기려면 `--keep-branch`를 사용하세요.
- 강제 삭제는 `--force`를 사용하세요. 내부적으로 `git worktree remove --force`, `git branch -D`에 전달됩니다.

## 로컬 개발

```bash
pnpm install
pnpm run lint
pnpm test
pnpm run pack:dry-run
```

배포 전 현재 checkout을 로컬 binary로 사용하려면:

```bash
pnpm run build
pnpm link --global
swt --help
```

## 참고

- 프로젝트별 `.sh` 스크립트가 필요 없습니다.
- TypeScript로 구현되어 있습니다.
- 핵심 worktree 동작은 Node/OS adapter와 분리되어 mock port 기반으로 테스트할 수 있습니다.
