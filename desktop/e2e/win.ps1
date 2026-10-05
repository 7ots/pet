# Windows helpers for desktop/e2e/installer-e2e.sh (kept in a file: quoting PowerShell through bash/argv is fragile).
#   win.ps1 procs                 "<pid> <command line>" of every running 7ots.exe
#   win.ps1 shot <file.png>       screenshot of the primary screen
param([string]$cmd, [string]$out)
$ErrorActionPreference = 'Stop'
switch ($cmd) {
  'procs' {
    Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '7ots.exe' } |
      ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }
  }
  'shot' {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }
  default { throw "usage: win.ps1 procs | shot <file.png>" }
}
