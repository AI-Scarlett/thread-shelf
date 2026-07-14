$ErrorActionPreference = "SilentlyContinue"

function Test-SupportedNode([string]$Candidate) {
    if ([string]::IsNullOrWhiteSpace($Candidate) -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
        return $false
    }

    $major = & $Candidate -p "Number(process.versions.node.split('.')[0])" 2>$null
    return ($LASTEXITCODE -eq 0 -and [int]$major -ge 22)
}

function Find-Node {
    $candidates = [System.Collections.Generic.List[string]]::new()

    foreach ($candidate in @($env:THREAD_SHELF_NODE, $env:NODE_BINARY)) {
        if (-not [string]::IsNullOrWhiteSpace($candidate)) { $candidates.Add($candidate) }
    }

    $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($onPath) { $candidates.Add($onPath.Source) }

    foreach ($candidate in @(
        $(if ($env:NVM_SYMLINK) { Join-Path $env:NVM_SYMLINK "node.exe" }),
        $(if ($env:NVM_HOME) { Join-Path $env:NVM_HOME "node.exe" }),
        $(if ($env:VOLTA_HOME) { Join-Path $env:VOLTA_HOME "bin\node.exe" }),
        $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "nodejs\node.exe" }),
        $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe" }),
        $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe" }),
        $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".volta\bin\node.exe" }),
        $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE "scoop\apps\nodejs\current\node.exe" }),
        $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE "scoop\apps\nodejs-lts\current\node.exe" }),
        $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".local\share\mise\shims\node.exe" }),
        $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".asdf\shims\node.exe" })
    )) {
        if (-not [string]::IsNullOrWhiteSpace($candidate)) { $candidates.Add($candidate) }
    }

    if ($env:USERPROFILE) {
        foreach ($pattern in @(
            ".nvm\v*\node.exe",
            ".fnm\node-versions\v*\installation\node.exe",
            "AppData\Roaming\fnm\node-versions\v*\installation\node.exe"
        )) {
            Get-ChildItem -Path (Join-Path $env:USERPROFILE $pattern) -File -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                ForEach-Object { $candidates.Add($_.FullName) }
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-SupportedNode $candidate) { return $candidate }
    }
    return $null
}

$pluginRoot = if ($env:PLUGIN_ROOT) {
    $env:PLUGIN_ROOT
} elseif ($env:CLAUDE_PLUGIN_ROOT) {
    $env:CLAUDE_PLUGIN_ROOT
} else {
    Split-Path -Parent $PSScriptRoot
}

$nodePath = Find-Node
if (-not $nodePath) { exit 0 }

$payload = [Console]::In.ReadToEnd()
$payload | & $nodePath (Join-Path $pluginRoot "hooks\capture_session.mjs") 2>$null
exit 0
