# ===============================================================================
# Easy GO - Firebase & Capacitor Android Setup Checker
# Run from your project root: .\check-firebase.ps1
# ===============================================================================

$pass  = "[OK]"
$fail  = "[!!]"
$warn  = "[??]"
$root  = Get-Location

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Easy GO - Android Firebase Setup Checker" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

$errors = 0
$warnings = 0

function Check($label, $ok, $detail = "", $isWarn = $false) {
    if ($ok) {
        Write-Host "  $pass $label" -ForegroundColor Green
        if ($detail) { Write-Host "       $detail" -ForegroundColor DarkGray }
    } elseif ($isWarn) {
        Write-Host "  $warn $label" -ForegroundColor Yellow
        if ($detail) { Write-Host "       $detail" -ForegroundColor Yellow }
        $script:warnings++
    } else {
        Write-Host "  $fail $label" -ForegroundColor Red
        if ($detail) { Write-Host "       FIX: $detail" -ForegroundColor Red }
        $script:errors++
    }
}

# -- 1. google-services.json --------------------------------------------------
Write-Host "[ 1 ] google-services.json" -ForegroundColor White
$gsJson = "$root\android\app\google-services.json"
$gsExists = Test-Path $gsJson
Check "File exists at android/app/google-services.json" $gsExists `
      "Download from Firebase Console -> Project Settings -> Your Android app"

if ($gsExists) {
    $gsContent = Get-Content $gsJson -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    $pkg = $gsContent.client[0].client_info.android_client_info.android_package_name
    Check "Package name is com.easygo.rwanda" ($pkg -eq "com.easygo.rwanda") `
          "Package in google-services.json is '$pkg' -- must be com.easygo.rwanda"
}
Write-Host ""

# -- 2. Top-level build.gradle ------------------------------------------------
Write-Host "[ 2 ] android/build.gradle (top-level)" -ForegroundColor White
$topGradle = "$root\android\build.gradle"
if (Test-Path $topGradle) {
    $topContent = Get-Content $topGradle -Raw
    Check "File exists" $true
    Check "google-services classpath declared" `
          ($topContent -match "com\.google\.gms:google-services") `
          "Add: classpath 'com.google.gms:google-services:4.4.4' inside buildscript > dependencies"
} else {
    Check "android/build.gradle exists" $false "File not found -- is this the project root?"
}
Write-Host ""

# -- 3. App-level build.gradle ------------------------------------------------
Write-Host "[ 3 ] android/app/build.gradle (app-level)" -ForegroundColor White
$appGradle = "$root\android\app\build.gradle"
if (Test-Path $appGradle) {
    $appContent = Get-Content $appGradle -Raw
    Check "File exists" $true

    Check "apply plugin: com.android.application" `
          ($appContent -match "apply plugin: ['`"]com\.android\.application['`"]") `
          "Add: apply plugin: 'com.android.application' at top of file"

    Check "apply plugin: com.google.gms.google-services" `
          ($appContent -match "apply plugin: ['`"]com\.google\.gms\.google-services['`"]") `
          "Add: apply plugin: 'com.google.gms.google-services' below the android.application line"

    Check "firebase-bom or firebase-messaging dependency" `
          ($appContent -match "firebase-(bom|messaging)") `
          "Add inside dependencies {}: implementation platform('com.google.firebase:firebase-bom:33.1.0') and implementation 'com.google.firebase:firebase-messaging'"

    Check "compileSdk is 34 or higher" `
          ($appContent -match "compileSdk(Version)?(\s*=\s*|\s+)(3[4-9]|[4-9]\d)") `
          "Set compileSdk = 34 or higher" -isWarn $true
} else {
    Check "android/app/build.gradle exists" $false "File not found"
}
Write-Host ""

# -- 4. AndroidManifest.xml ---------------------------------------------------
Write-Host "[ 4 ] AndroidManifest.xml" -ForegroundColor White
$manifest = "$root\android\app\src\main\AndroidManifest.xml"
if (Test-Path $manifest) {
    $mContent = Get-Content $manifest -Raw
    Check "File exists" $true

    Check "INTERNET permission" `
          ($mContent -match "android.permission.INTERNET") `
          "Add: <uses-permission android:name='android.permission.INTERNET' />"

    Check "POST_NOTIFICATIONS permission (Android 13+)" `
          ($mContent -match "POST_NOTIFICATIONS") `
          "Add: <uses-permission android:name='android.permission.POST_NOTIFICATIONS' />" -isWarn $true

    Check "FirebaseMessagingService declared" `
          ($mContent -match "FirebaseMessagingService|com\.google\.firebase\.messaging") `
          "Capacitor Push plugin handles this -- if missing, run: npx cap sync android" -isWarn $true
} else {
    Check "AndroidManifest.xml exists" $false "File not found"
}
Write-Host ""

# -- 5. capacitor.config.json -------------------------------------------------
Write-Host "[ 5 ] capacitor.config.json" -ForegroundColor White
$capConfig = "$root\capacitor.config.json"
if (Test-Path $capConfig) {
    $capContent = Get-Content $capConfig -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    Check "File exists" $true
    Check "appId is com.easygo.rwanda" `
          ($capContent.appId -eq "com.easygo.rwanda") `
          "appId is '$($capContent.appId)' -- must match google-services.json package name"
    Check "webDir is set" `
          ($capContent.webDir -ne $null -and $capContent.webDir -ne "") `
          "Set webDir to 'dist'"
} else {
    Check "capacitor.config.json exists" $false "File not found at project root"
}
Write-Host ""

# -- 6. package.json - required packages --------------------------------------
Write-Host "[ 6 ] package.json - npm dependencies" -ForegroundColor White
$pkgJson = "$root\package.json"
if (Test-Path $pkgJson) {
    $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
    $deps = ($pkg.dependencies | Get-Member -MemberType NoteProperty).Name
    $devDeps = ($pkg.devDependencies | Get-Member -MemberType NoteProperty).Name
    $allDeps = $deps + $devDeps

    Check "@capacitor/core installed"               ($allDeps -contains "@capacitor/core") `
          "Run: npm install @capacitor/core"
    Check "@capacitor/android installed"            ($allDeps -contains "@capacitor/android") `
          "Run: npm install @capacitor/android"
    Check "@capacitor/push-notifications installed" ($allDeps -contains "@capacitor/push-notifications") `
          "Run: npm install @capacitor/push-notifications"
    Check "@capacitor/local-notifications installed" ($allDeps -contains "@capacitor/local-notifications") `
          "Run: npm install @capacitor/local-notifications" -isWarn $true
} else {
    Check "package.json exists" $false "Not at project root"
}
Write-Host ""

# -- 7. dist/ folder (built web assets) ---------------------------------------
Write-Host "[ 7 ] Built web assets" -ForegroundColor White
$distExists = Test-Path "$root\dist"
Check "dist/ folder exists" $distExists `
      "Run: npm run build   (then npx cap sync android)" -isWarn (-not $distExists)
Write-Host ""

# -- 8. android/app/src/main/assets/public ------------------------------------
Write-Host "[ 8 ] Capacitor synced assets" -ForegroundColor White
$syncedAssets = "$root\android\app\src\main\assets\public\index.html"
Check "index.html synced to Android assets" (Test-Path $syncedAssets) `
      "Run: npx cap sync android"
Write-Host ""

# -- Summary ------------------------------------------------------------------
Write-Host "======================================================" -ForegroundColor Cyan
if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "  ALL CHECKS PASSED - ready to build!" -ForegroundColor Green
} elseif ($errors -eq 0) {
    Write-Host "  $warnings warning(s) - review above, then build" -ForegroundColor Yellow
} else {
    Write-Host "  $errors error(s)  $warnings warning(s) - fix errors before building" -ForegroundColor Red
}
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

if ($errors -gt 0) {
    Write-Host "  Quick fix order:" -ForegroundColor White
    Write-Host "   1. Add google-services.json to android/app/" -ForegroundColor Gray
    Write-Host "   2. Add 'apply plugin: com.google.gms.google-services' to android/app/build.gradle" -ForegroundColor Gray
    Write-Host "   3. Add Firebase dependencies to android/app/build.gradle" -ForegroundColor Gray
    Write-Host "   4. npm run build" -ForegroundColor Gray
    Write-Host "   5. npx cap sync android" -ForegroundColor Gray
    Write-Host "   6. Open Android Studio and rebuild" -ForegroundColor Gray
    Write-Host ""
}