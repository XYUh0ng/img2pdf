# setup.ps1 - Download jsPDF and SortableJS to lib folder
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'

$libDir = Join-Path $PSScriptRoot "lib"
if (!(Test-Path $libDir)) { New-Item -ItemType Directory -Path $libDir | Out-Null }

$downloads = @(
    @{ url = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'; file = 'jspdf.umd.min.js' },
    @{ url = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'; file = 'Sortable.min.js' }
)

foreach ($d in $downloads) {
    $dest = Join-Path $libDir $d.file
    Write-Host "Downloading $($d.file) ..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $d.url -OutFile $dest -UseBasicParsing -TimeoutSec 30
        $size = (Get-Item $dest).Length
        Write-Host "  OK ($size bytes)" -ForegroundColor Green
    } catch {
        Write-Host "  FAIL: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Open index.html in your browser." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
