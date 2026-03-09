# Simple Static File Server for PowerShell
$port = 8080
$root = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Server listening on http://localhost:$port/"
Start-Process "http://localhost:$port/"
Write-Host "Press Ctrl+C to stop."

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $path = $root + $request.Url.LocalPath
    
    # Default to index.html for root
    if ($request.Url.LocalPath -eq "/") {
        $path = $root + "/index.html"
    }

    if (Test-Path $path -PathType Leaf) {
        $content = [System.IO.File]::ReadAllBytes($path)
        
        # Simple MIME type handling
        $extension = [System.IO.Path]::GetExtension($path)
        switch ($extension) {
            ".html" { $response.ContentType = "text/html" }
            ".js" { $response.ContentType = "application/javascript" }
            ".css" { $response.ContentType = "text/css" }
            ".json" { $response.ContentType = "application/json" }
            ".png" { $response.ContentType = "image/png" }
            ".jpg" { $response.ContentType = "image/jpeg" }
            ".wasm" { $response.ContentType = "application/wasm" }
        }

        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
        $response.StatusCode = 200
    }
    else {
        $response.StatusCode = 404
    }

    $response.Close()
}
