# Khởi động VideoPic Workflow cho chủ dự án: bấm đúp "Khoi-dong-VideoPic.cmd" ở thư mục dự án.
# 1. Thư mục sạch thì lên bản mới nhất của nhánh main (có thay đổi chưa lưu thì giữ nguyên, không đổi gì).
# 2. Thư viện đổi so với lần cài trước thì cài lại (npm ci).
# 3. Chạy app (npm run dev) và mở trình duyệt ở http://127.0.0.1:5190. App đang chạy sẵn thì chỉ mở trình duyệt.
# PowerShell đọc hết file này trước khi chạy, nên git đổi/ghi đè chính file này lúc chuyển bản không làm hỏng lần chạy đang dở.

# -ChiCapNhat: chỉ làm bước 1 (lên bản mới nhất) rồi dừng — để thử bước chuyển bản mà không cài thư viện hay bật app.
param([switch]$ChiCapNhat)

# "Continue": git/npm ghi ra stderr không làm dừng script (Windows PowerShell 5.1 coi stderr là lỗi); mỗi lệnh tự kiểm $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$Host.UI.RawUI.WindowTitle = "VideoPic Workflow"
$url = "http://127.0.0.1:5190"
$launcher = @("Khoi-dong-VideoPic.cmd", "scripts/khoi-dong.ps1")

function Say([string]$text, [string]$color = "Gray") { Write-Host $text -ForegroundColor $color }
function Stop-Here([int]$code) {
  Read-Host "Bấm Enter để đóng cửa sổ" | Out-Null
  exit $code
}

Say "=== VideoPic Workflow ===" Cyan
foreach ($tool in "git", "node", "npm") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Say "Chưa có '$tool' trên máy (hoặc chưa nằm trong PATH). Cài Node.js 24+ và Git rồi chạy lại." Red
    Stop-Here 1
  }
}

if (Get-NetTCPConnection -State Listen -LocalPort 5190 -ErrorAction SilentlyContinue) {
  Say "App đang chạy sẵn ở $url — mở trình duyệt." Green
  Start-Process $url
  exit 0
}

# --- 1. Lên bản mới nhất ---------------------------------------------------------------------------------------------
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  Say "Thư mục có thay đổi chưa lưu (nhánh '$branch') — giữ nguyên, không chuyển bản. Chạy 'git status' để xem." Yellow
} else {
  git fetch origin main --quiet
  if ($LASTEXITCODE -ne 0) { Say "Không tải được bản mới từ GitHub (mạng?) — chạy bản đang có." Yellow }
  elseif ($branch -ne "main" -and (git rev-list HEAD --not --remotes)) {
    # Nhánh còn commit chưa có trên GitHub (việc đang làm dở): không tự chuyển, để khỏi tưởng việc đó đã mất.
    Say "Nhánh '$branch' còn commit chưa đẩy lên GitHub — giữ nguyên nhánh này, không chuyển sang 'main'." Yellow
  }
  elseif ($branch -ne "main") {
    Say "Đang ở nhánh '$branch' (đã có trên GitHub) — chuyển sang 'main' (bản mới nhất)…" Cyan
    # Bản sao chưa theo dõi của chính file khởi động sẽ vướng lệnh chuyển (git không ghi đè file chưa theo dõi): cất tạm, chuyển, rồi
    # main mang bản chính thức về. Chuyển lỗi thì trả lại bản cất tạm.
    $stash = Join-Path $env:TEMP "videopic-khoi-dong"
    New-Item -ItemType Directory -Force -Path $stash | Out-Null
    $moved = @()
    foreach ($f in $launcher) {
      if ((Test-Path -LiteralPath $f) -and -not (git ls-files -- $f)) {
        git cat-file -e "origin/main:$f" 2>$null
        if ($LASTEXITCODE -eq 0) {
          Copy-Item -LiteralPath $f -Destination (Join-Path $stash ($f -replace "[/\\]", "_")) -Force
          Remove-Item -LiteralPath $f -Force
          $moved += $f
        }
      }
    }
    git switch main --quiet
    if ($LASTEXITCODE -ne 0) {
      foreach ($f in $moved) { Copy-Item -LiteralPath (Join-Path $stash ($f -replace "[/\\]", "_")) -Destination $f -Force }
      Say "Không chuyển được sang 'main' — chạy bản đang có ở nhánh '$branch'." Yellow
    }
  }
  if ((git rev-parse --abbrev-ref HEAD).Trim() -eq "main") {
    git merge --ff-only origin/main --quiet
    if ($LASTEXITCODE -ne 0) { Say "Nhánh main trên máy lệch với GitHub — chạy bản đang có, không ghi đè." Yellow }
    else { Say ("Bản đang chạy: " + (git log -1 --format="%h %s")) Green }
  }
}

if ($ChiCapNhat) { exit 0 }

# --- 2. Thư viện -------------------------------------------------------------------------------------------------------
$lockHash = (Get-FileHash -LiteralPath "package-lock.json" -Algorithm SHA256).Hash
$marker = "node_modules/.videopic-lock-hash"
$installed = if (Test-Path -LiteralPath $marker) { (Get-Content -LiteralPath $marker -Raw).Trim() } else { "" }
if ($installed -ne $lockHash) {
  $ok = $false
  if (-not $installed -and (Test-Path -LiteralPath "node_modules")) {
    # Chưa có dấu (lần đầu dùng file này): thư viện đang có đúng với danh sách thì khỏi cài lại.
    npm ls --depth=0 *> $null
    $ok = $LASTEXITCODE -eq 0
  }
  if (-not $ok) {
    Say "Danh sách thư viện đã đổi — cài lại (npm ci), lần này mất vài phút…" Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { Say "Cài thư viện lỗi (xem dòng báo phía trên)." Red; Stop-Here 1 }
  }
  Set-Content -LiteralPath $marker -Value $lockHash -Encoding ascii
}

# --- 3. Chạy app ------------------------------------------------------------------------------------------------------
Say "Đang bật app… trình duyệt tự mở khi sẵn sàng ($url)." Cyan
Say "Đóng cửa sổ này (hoặc bấm Ctrl+C) là tắt app. Dữ liệu nằm ở thư mục .data, không mất khi tắt." DarkGray
Start-Job -ScriptBlock {
  param($u)
  for ($i = 0; $i -lt 120; $i++) {
    try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $u; return } catch { Start-Sleep -Seconds 1 }
  }
} -ArgumentList $url | Out-Null
npm run dev
if ($LASTEXITCODE -ne 0) { Say "App dừng kèm lỗi (xem dòng báo phía trên)." Red; Stop-Here $LASTEXITCODE }
