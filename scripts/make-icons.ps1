Add-Type -AssemblyName System.Drawing

# SymPal Events app icon: six people around a shared centre, in warm gold on
# the brand teal.
#
# The committee rather than the festival. This app is multi-event, so anything
# festival-specific (a diya, a modak, a Ganesh silhouette) would date it to one
# celebration; what does not change is a group of residents organising
# something together.
#
# Geometry is authored in a 1024x1024 space and scaled per output size, so
# these files and public/favicon.svg draw the exact same shape. Change one and
# you must change the other.

$Teal     = [System.Drawing.Color]::FromArgb(255, 29, 91, 94)     # --primary  hsl(182 53% 24%)
$TealDark = [System.Drawing.Color]::FromArgb(255, 16, 60, 63)
$GoldPale = [System.Drawing.Color]::FromArgb(255, 255, 228, 160)
$GoldMid  = [System.Drawing.Color]::FromArgb(255, 246, 190, 96)
$Cream    = [System.Drawing.Color]::FromArgb(255, 255, 244, 214)
$Rose     = [System.Drawing.Color]::FromArgb(255, 226, 122, 62)

$PeopleCount = 6
$RingRadius  = 262

function Add-RoundedRect {
    param($Path, [single]$X, [single]$Y, [single]$W, [single]$H, [single]$R)
    $d = $R * 2
    $Path.AddArc($X, $Y, $d, $d, 180, 90)
    $Path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $Path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $Path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $Path.CloseFigure()
}

# Built inside each person's own rotated frame, so every figure is shaded
# identically head-to-shoulder. One gradient across the whole icon instead made
# the top of the ring pale and the bottom deep orange, and the six stopped
# reading as one group. The range is deliberately short for the same reason:
# too much contrast and the head reads as an object separate from the body.
function Get-PersonBrush {
    $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, -112)), (New-Object System.Drawing.PointF(0, 84)),
        $GoldPale, $GoldMid)
    $b.WrapMode = [System.Drawing.Drawing2D.WrapMode]::TileFlipXY
    return $b
}

# One person, in a local frame where -y points away from the icon centre.
#
# Head and shoulders are separate shapes with a 12-unit gap, and the dome is
# wider than the head so the silhouette narrows at the neck. Overlapping them
# makes the pair read as a heart; opening the gap much further makes it read as
# a crescent moon beside a dot.
function Draw-Person {
    param($g)
    $brush = Get-PersonBrush
    $g.FillEllipse($brush, -50, -108, 100, 100)   # head, centre (0,-58) r50
    $dome = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dome.AddArc(-72, 0, 144, 150, 180, 180)      # shoulders, y 0..75
    $g.FillPath($brush, $dome)
    $brush.Dispose()
}

function Draw-Art {
    param($g)
    for ($i = 0; $i -lt $PeopleCount; $i++) {
        $state = $g.Save()
        $g.TranslateTransform(512, 512)
        $g.RotateTransform(360.0 / $PeopleCount * $i)
        $g.TranslateTransform(0, -[single]$RingRadius)
        Draw-Person $g
        $g.Restore($state)
    }
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($Cream)), 512 - 136, 512 - 136, 272, 272)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($Rose)), 512 - 66, 512 - 66, 132, 132)
}

function New-Icon {
    param([int]$Size, [string]$Path, [bool]$Rounded, [double]$ArtScale)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.ScaleTransform($Size / 1024.0, $Size / 1024.0)

    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($Rounded) {
        Add-RoundedRect $bgPath 0 0 1024 1024 224
    } else {
        $bgPath.AddRectangle((New-Object System.Drawing.RectangleF(0, 0, 1024, 1024)))
    }
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF(1024, 1024)),
        $Teal, $TealDark)
    $g.FillPath($bgBrush, $bgPath)

    # Art is scaled about the canvas centre for the maskable variant, which has
    # to survive Android cropping it to a circle. The art reaches 370 from the
    # centre, so even at 0.95 it stays inside the guaranteed 410 safe radius.
    $state = $g.Save()
    $g.TranslateTransform(512, 512)
    $g.ScaleTransform($ArtScale, $ArtScale)
    $g.TranslateTransform(-512, -512)
    Draw-Art $g
    $g.Restore($state)

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("wrote " + $Path)
}

$out = $args[0]
New-Icon -Size 512 -Path "$out\icon-512.png"          -Rounded $true  -ArtScale 1.0
New-Icon -Size 192 -Path "$out\icon-192.png"          -Rounded $true  -ArtScale 1.0
New-Icon -Size 512 -Path "$out\icon-maskable-512.png" -Rounded $false -ArtScale 0.95
New-Icon -Size 180 -Path "$out\apple-touch-icon.png"  -Rounded $false -ArtScale 1.0
New-Icon -Size 48  -Path "$out\ico-48.png"            -Rounded $true  -ArtScale 1.0
New-Icon -Size 32  -Path "$out\ico-32.png"            -Rounded $true  -ArtScale 1.0
New-Icon -Size 16  -Path "$out\ico-16.png"            -Rounded $true  -ArtScale 1.0
