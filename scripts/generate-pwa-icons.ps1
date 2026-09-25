Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'web'

function Add-RoundedSquare {
    param([System.Drawing.Drawing2D.GraphicsPath]$Path)
    $Path.AddArc(0, 0, 24, 24, 180, 90)
    $Path.AddArc(24, 0, 24, 24, 270, 90)
    $Path.AddArc(24, 24, 24, 24, 0, 90)
    $Path.AddArc(0, 24, 24, 24, 90, 90)
    $Path.CloseFigure()
}

function Draw-BrandIcon {
    param([System.Drawing.Graphics]$Graphics)

    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#174E4A'))
    $leftPage = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#F7F4EB'))
    $rightPage = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E7EDE5'))
    $star = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E4BC69'))
    $spine = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#C99B49'), 2)
    $lines = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#78958A'), 1.5)
    $rounded = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $left = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $right = [System.Drawing.Drawing2D.GraphicsPath]::new()

    try {
        Add-RoundedSquare $rounded
        $Graphics.FillPath($background, $rounded)

        $left.StartFigure()
        $left.AddBezier(8, 13.5, 13.8, 11.2, 19.1, 12.1, 24, 15.6)
        $left.AddLine(24, 15.6, 24, 36.6)
        $left.AddBezier(24, 36.6, 19.1, 33.1, 13.8, 32.2, 8, 34.5)
        $left.CloseFigure()
        $Graphics.FillPath($leftPage, $left)

        $right.StartFigure()
        $right.AddBezier(40, 13.5, 34.2, 11.2, 28.9, 12.1, 24, 15.6)
        $right.AddLine(24, 15.6, 24, 36.6)
        $right.AddBezier(24, 36.6, 28.9, 33.1, 34.2, 32.2, 40, 34.5)
        $right.CloseFigure()
        $Graphics.FillPath($rightPage, $right)

        $spine.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $spine.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $Graphics.DrawLine($spine, 24, 15.6, 24, 36.6)

        foreach ($row in @(20, 25)) {
            $Graphics.DrawBezier($lines, 12, $row, 15, ($row - 0.7), 18, ($row - 0.3), 20.8, ($row + 1.1))
            $Graphics.DrawBezier($lines, 36, $row, 33, ($row - 0.7), 30, ($row - 0.3), 27.2, ($row + 1.1))
        }

        $points = [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new(35, 5.5),
            [System.Drawing.PointF]::new(36.5, 8.9),
            [System.Drawing.PointF]::new(40, 10.3),
            [System.Drawing.PointF]::new(36.5, 11.8),
            [System.Drawing.PointF]::new(35, 15.2),
            [System.Drawing.PointF]::new(33.6, 11.8),
            [System.Drawing.PointF]::new(30.1, 10.3),
            [System.Drawing.PointF]::new(33.6, 8.9)
        )
        $Graphics.FillPolygon($star, $points)
    }
    finally {
        $right.Dispose()
        $left.Dispose()
        $rounded.Dispose()
        $lines.Dispose()
        $spine.Dispose()
        $star.Dispose()
        $rightPage.Dispose()
        $leftPage.Dispose()
        $background.Dispose()
    }
}

foreach ($size in @(180, 192, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.ScaleTransform($size / 48, $size / 48)
        Draw-BrandIcon $graphics
        $bitmap.Save((Join-Path $iconDirectory "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
