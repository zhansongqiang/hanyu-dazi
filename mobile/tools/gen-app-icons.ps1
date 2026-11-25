# gen-app-icons.ps1 -- regenerate the Android launcher icons + launch screen for HanYu DaZi.
#
# WHAT THIS WRITES (all under mobile/android/app/src/main/res):
#   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png            48/72/96/144/192   legacy (API 24-25)
#   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png      same sizes         round launcher slot
#   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png 108/162/216/324/432 adaptive foreground
#   drawable*/splash.png                                   11 files           solid paper
#
# THE MARK, and why it looks the way it does:
#   The project's own design language (mobile/src/App.vue :root) forbids a solid cinnabar
#   block on screen -- cinnabar is reserved for seals, emphasis and errors, capped at 5%
#   of the screen. A launcher icon is not a screen, and the documented identity rule is
#   "seal-style mark: a cinnabar-OUTLINED square, not a filled red block" (.hd-seal).
#   Rather than violate that, this uses the seal's own two-colour logic: a bai-wen yin
#   (white-character seal) -- the cinnabar field IS the seal body, and the border plus the
#   character are knocked out in paper white. That is a real seal form, not a red square.
#
#   Adaptive icons get a RING, not a square. The guaranteed-visible region of the 108dp
#   adaptive canvas is the central 66dp-diameter circle; a square seal's corners sit at
#   radius 0.707*side and would be clipped by a circular launcher mask, which reads as a
#   rendering bug. A ring is rotation-invariant, so it survives every mask. Verified by
#   rendering the masks in preview below, not by reasoning.
#
# KEEP THIS FILE ASCII-ONLY. Windows PowerShell 5.1 decodes .ps1 as ANSI unless the file
# carries a UTF-8 BOM, so any non-ASCII byte here (Chinese comment or literal glyph) would
# be silently mis-decoded. The character is therefore written as [char]0x642D.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File mobile/tools/gen-app-icons.ps1

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$res = Join-Path $repo 'android\app\src\main\res'
if (-not (Test-Path $res)) { throw "res dir not found: $res" }

function Col([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
$CINNABAR = Col '#AE332E'   # zhu-sha, the seal body
$PAPER = Col '#F6F2EA'      # xuan-zhi, the knocked-out strokes
$GLYPH = [string][char]0x642D  # 搭 -- the "da" of hanyu-dazi

# Pick a serif CJK face; the app's .hd-title uses Songti, so prefer SimSun.
$face = $null
foreach ($f in @('SimSun', 'NSimSun', 'KaiTi', 'SimHei', 'Microsoft YaHei')) {
    foreach ($installed in [System.Drawing.FontFamily]::Families) {
        if ($installed.Name -eq $f) { $face = $f; break }
    }
    if ($face) { break }
}
if (-not $face) { throw 'no CJK font family found' }
Write-Host "font family: $face"

$script:written = @()

function New-Surface([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)
    [pscustomobject]@{ Bmp = $bmp; G = $g }
}

function Save-Png($surface, [string]$path) {
    $dir = Split-Path -Parent $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $surface.Bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $script:written += [pscustomobject]@{ Path = $path; Bytes = (Get-Item $path).Length }
}

# Rounded rectangle as a GraphicsPath; radius $r on a $w x $h box at ($x,$y).
function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# The seal character, centred on ($cx,$cy), em box $em px.
function Add-Glyph($g, [single]$cx, [single]$cy, [single]$em) {
    $font = New-Object System.Drawing.Font($face, $em, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $fmt.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip
    $brush = New-Object System.Drawing.SolidBrush($PAPER)
    $half = $em * 1.05
    $rect = New-Object System.Drawing.RectangleF(($cx - $half), ($cy - $half), ($half * 2), ($half * 2))
    $g.DrawString($GLYPH, $font, $brush, $rect, $fmt)
    $brush.Dispose(); $font.Dispose(); $fmt.Dispose()
}

# ---------------------------------------------------------------- adaptive foreground
# 108dp canvas. Content must stay inside the central 66dp circle (radius 0.3056*S).
function Write-AdaptiveForeground([int]$S, [string]$path) {
    # NB: PowerShell variable names are case-INsensitive, so a local named $s would BE the
    # [int]$S parameter and assigning the surface to it would fail a type constraint.
    $surf = New-Surface $S $S
    $g = $surf.G
    $cx = $S / 2.0
    $ring = 0.270 * $S          # centreline; outer edge 0.2865*S = 30.9dp, i.e. 2.1dp
                                # INSIDE the 66dp safe circle. At 0.285 the outer edge was
                                # 0.3025*S = 32.7dp -- 0.3dp inside the safe circle, i.e.
                                # exactly on the line whose whole purpose is "beyond here a
                                # launcher may crop you". The preview showed it touching.
    $pen = New-Object System.Drawing.Pen($PAPER, [single](0.033 * $S))
    $g.DrawEllipse($pen, [single]($cx - $ring), [single]($cx - $ring), [single]($ring * 2), [single]($ring * 2))
    $pen.Dispose()
    Add-Glyph $g $cx $cx (0.32 * $S)
    Save-Png $surf $path
    $surf.Bmp.Dispose()
}

# ---------------------------------------------------------------- legacy square icon
# No mask on API 24-25, so the artwork carries its own full-bleed rounded square.
function Write-LegacySquare([int]$S, [string]$path) {
    $surf = New-Surface $S $S
    $g = $surf.G
    $body = New-RoundRect 0 0 $S $S ([single](0.22 * $S))
    $fill = New-Object System.Drawing.SolidBrush($CINNABAR)
    $g.FillPath($fill, $body)
    $fill.Dispose()
    $inset = 0.085 * $S
    $inner = New-RoundRect ([single]$inset) ([single]$inset) ([single]($S - 2 * $inset)) ([single]($S - 2 * $inset)) ([single](0.15 * $S))
    $pen = New-Object System.Drawing.Pen($PAPER, [single](0.028 * $S))
    $g.DrawPath($pen, $inner)
    $pen.Dispose(); $inner.Dispose(); $body.Dispose()
    Add-Glyph $g ($S / 2.0) ($S / 2.0) (0.50 * $S)
    Save-Png $surf $path
    $surf.Bmp.Dispose()
}

# ---------------------------------------------------------------- round icon
function Write-Round([int]$S, [string]$path) {
    $surf = New-Surface $S $S
    $g = $surf.G
    $fill = New-Object System.Drawing.SolidBrush($CINNABAR)
    $g.FillEllipse($fill, 0, 0, $S, $S)
    $fill.Dispose()
    $r = 0.415 * $S
    $pen = New-Object System.Drawing.Pen($PAPER, [single](0.030 * $S))
    $g.DrawEllipse($pen, [single](($S / 2.0) - $r), [single](($S / 2.0) - $r), [single]($r * 2), [single]($r * 2))
    $pen.Dispose()
    Add-Glyph $g ($S / 2.0) ($S / 2.0) (0.50 * $S)
    Save-Png $surf $path
    $surf.Bmp.Dispose()
}

# ---------------------------------------------------------------- launch screen
# Solid paper, at the exact pixel size of the file being replaced. A centred mark would
# be stretched non-uniformly here: this drawable is set as the window background, and a
# bitmap window background is scaled to fill the window, so any non-uniform device aspect
# would squash the seal into an ellipse. The system splash screen already draws the app
# icon on top of this on API 31+, which is the platform-correct look.
function Write-Splash([int]$W, [int]$H, [string]$path) {
    $surf = New-Surface $W $H
    $brush = New-Object System.Drawing.SolidBrush($PAPER)
    $surf.G.FillRectangle($brush, 0, 0, $W, $H)
    $brush.Dispose()
    Save-Png $surf $path
    $surf.Bmp.Dispose()
}

# ---------------------------------------------------------------- masks, for eyeballing
# Nothing here is shipped; these exist so the mark can be judged the way a launcher shows
# it (clipped by a circle / squircle) instead of only as a bare square.
function Write-Preview([string]$path) {
    $cell = 192; $gap = 24
    $W = $cell * 4 + $gap * 5                  # 888
    $labelY = $gap + $cell + 4
    $thumbTop = $labelY + 28
    $H = $thumbTop + 104 + $gap
    $surf = New-Surface $W $H
    $g = $surf.G
    $checker = New-Object System.Drawing.SolidBrush((Col '#E8E4DC'))
    $g.FillRectangle($checker, 0, 0, $W, $H)
    $checker.Dispose()

    $src = New-Object System.Drawing.Bitmap((Join-Path $res 'mipmap-xxxhdpi\ic_launcher_foreground.png'))
    $bgBrush = New-Object System.Drawing.SolidBrush($CINNABAR)
    # The drawing overflows the cell by exactly as much as it does on a phone: the art is
    # drawn for the full 108dp canvas, while the cell represents the 72dp viewport.
    $art = 108 * ($cell / 72.0)
    $labels = @('circle mask 72dp', 'rounded r=42%', 'rounded r=18%', 'legacy png')

    for ($i = 0; $i -lt 4; $i++) {
        $x = $gap + $i * ($cell + $gap)
        $y = $gap
        $box = New-Object System.Drawing.RectangleF($x, $y, $cell, $cell)
        $artBox = New-Object System.Drawing.RectangleF(($x + $cell / 2 - $art / 2), ($y + $cell / 2 - $art / 2), $art, $art)

        if ($i -eq 3) {
            # the legacy icon (API 24-25 slot): carries its own full-bleed square, never masked
            $leg = New-Object System.Drawing.Bitmap((Join-Path $res 'mipmap-xxxhdpi\ic_launcher.png'))
            $g.FillRectangle($bgBrush, $box)
            $g.DrawImage($leg, $box)
            $leg.Dispose()
        } else {
            if ($i -eq 0) {
                $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
                $clip.AddEllipse($x, $y, $cell, $cell)
            } elseif ($i -eq 1) {
                $clip = New-RoundRect $x $y $cell $cell ([single](0.42 * $cell))
            } else {
                $clip = New-RoundRect $x $y $cell $cell ([single](0.18 * $cell))
            }
            $g.SetClip($clip)
            $g.FillRectangle($bgBrush, $box)
            $g.DrawImage($src, $artBox)
            $g.ResetClip()
            if ($i -eq 0) {
                # the guaranteed-visible circle: 66dp inside the 72dp viewport. If the ring
                # crosses this line the mark is at the mercy of the launcher's mask.
                $safe = $cell * 66.0 / 72.0
                $penSafe = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(170, 0, 0, 0), 1)
                $g.DrawEllipse($penSafe, [single]($x + ($cell - $safe) / 2), [single]($y + ($cell - $safe) / 2), [single]$safe, [single]$safe)
                $penSafe.Dispose()
            }
            $clip.Dispose()
        }

        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 0, 0, 0), 1)
        $g.DrawRectangle($pen, [single]$x, [single]$y, [single]$cell, [single]$cell)
        $pen.Dispose()
        $f = New-Object System.Drawing.Font('Segoe UI', 13)
        $tb = New-Object System.Drawing.SolidBrush((Col '#1A1A1D'))
        $g.DrawString($labels[$i], $f, $tb, [single]$x, [single]$labelY)
        $tb.Dispose(); $f.Dispose()
    }

    # 1:1 strip -- the real pixel sizes a launcher renders at mdpi/hdpi/xhdpi. This is the
    # size that decides legibility; a 192px preview never will.
    $thumbFont = New-Object System.Drawing.Font('Segoe UI', 11)
    $thumbBrush = New-Object System.Drawing.SolidBrush((Col '#1A1A1D'))
    $tx = $gap
    $thumbs = @(
        @{ f = 'mipmap-mdpi\ic_launcher.png';       s = 48; l = 'mdpi 48 legacy' },
        @{ f = 'mipmap-mdpi\ic_launcher_round.png'; s = 48; l = 'mdpi 48 round'  },
        @{ f = 'mipmap-hdpi\ic_launcher_round.png'; s = 72; l = 'hdpi 72 round'  },
        @{ f = 'mipmap-xhdpi\ic_launcher.png';      s = 96; l = 'xhdpi 96 legacy' }
    )
    foreach ($t in $thumbs) {
        $b = New-Object System.Drawing.Bitmap((Join-Path $res $t.f))
        $g.DrawImage($b, (New-Object System.Drawing.Rectangle([int]$tx, [int]$thumbTop, $t.s, $t.s)))
        $g.DrawString($t.l, $thumbFont, $thumbBrush, [single]($tx + $t.s + 8), [single]($thumbTop + $t.s / 2 - 9))
        $b.Dispose()
        $tx += $t.s + 8 + 92
    }
    $thumbFont.Dispose(); $thumbBrush.Dispose()

    $src.Dispose(); $bgBrush.Dispose()
    Save-Png $surf $path
    $surf.Bmp.Dispose()
}

# ---------------------------------------------------------------- run
$dens = @{ mdpi = 1.0; hdpi = 1.5; xhdpi = 2.0; xxhdpi = 3.0; xxxhdpi = 4.0 }
foreach ($d in $dens.Keys) {
    $k = $dens[$d]
    Write-AdaptiveForeground ([int](108 * $k)) (Join-Path $res "mipmap-$d\ic_launcher_foreground.png")
    Write-LegacySquare ([int](48 * $k)) (Join-Path $res "mipmap-$d\ic_launcher.png")
    Write-Round ([int](48 * $k)) (Join-Path $res "mipmap-$d\ic_launcher_round.png")
}

$splashes = @(
    @{ p = 'drawable\splash.png'; w = 480; h = 320 },
    @{ p = 'drawable-land-mdpi\splash.png'; w = 480; h = 320 },
    @{ p = 'drawable-land-hdpi\splash.png'; w = 800; h = 480 },
    @{ p = 'drawable-land-xhdpi\splash.png'; w = 1280; h = 720 },
    @{ p = 'drawable-land-xxhdpi\splash.png'; w = 1600; h = 960 },
    @{ p = 'drawable-land-xxxhdpi\splash.png'; w = 1920; h = 1280 },
    @{ p = 'drawable-port-mdpi\splash.png'; w = 320; h = 480 },
    @{ p = 'drawable-port-hdpi\splash.png'; w = 480; h = 800 },
    @{ p = 'drawable-port-xhdpi\splash.png'; w = 720; h = 1280 },
    @{ p = 'drawable-port-xxhdpi\splash.png'; w = 960; h = 1600 },
    @{ p = 'drawable-port-xxxhdpi\splash.png'; w = 1280; h = 1920 }
)
foreach ($s in $splashes) { Write-Splash $s.w $s.h (Join-Path $res $s.p) }

$preview = Join-Path $repo 'android\_scratch\launcher-preview.png'
Write-Preview $preview

foreach ($w in $script:written) {
    Write-Host ("{0,8} B  {1}" -f $w.Bytes, $w.Path.Replace($res + '\', ''))
}
Write-Host ("total files: {0}" -f $script:written.Count)
