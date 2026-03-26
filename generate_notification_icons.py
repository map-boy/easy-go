"""
Android Notification Icon Generator
------------------------------------
Run this from your project root:
    python generate_notification_icons.py

It reads:  assets/icon.png
It writes: android/app/src/main/res/drawable-*/ic_notification.png
           android/app/src/main/res/drawable/ic_notification.png
"""

from PIL import Image
import os, sys

# ── Config ────────────────────────────────────────────────────────────────────
INPUT_PATH  = os.path.join("assets", "icon.png")
OUTPUT_NAME = "ic_notification.png"

# Android notification icon sizes (dp → px at each density)
SIZES = {
    "drawable-mdpi":    24,   # 1×
    "drawable-hdpi":    36,   # 1.5×
    "drawable-xhdpi":   48,   # 2×
    "drawable-xxhdpi":  72,   # 3×
    "drawable-xxxhdpi": 96,   # 4×
    "drawable":         96,   # fallback
}

RES_BASE = os.path.join("android", "app", "src", "main", "res")

# ── Load source icon ──────────────────────────────────────────────────────────
if not os.path.exists(INPUT_PATH):
    print(f"❌  Could not find '{INPUT_PATH}'")
    print("    Run this script from your project root (where 'assets/' lives).")
    sys.exit(1)

src = Image.open(INPUT_PATH).convert("RGBA")
print(f"✅  Loaded '{INPUT_PATH}'  ({src.width}×{src.height}px)")

# ── Convert to white silhouette on transparent background ─────────────────────
def make_white_silhouette(img: Image.Image, size: int) -> Image.Image:
    img = img.resize((size, size), Image.LANCZOS)
    r, g, b, a = img.split()

    # Build a new image: pure white pixels where the original is opaque
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    pixels_white = white.load()
    pixels_alpha = img.load()

    for y in range(img.height):
        for x in range(img.width):
            _, _, _, alpha = pixels_alpha[x, y]
            # Threshold: keep pixels that are at least 30% opaque
            pixels_white[x, y] = (255, 255, 255, alpha if alpha > 30 else 0)

    return white

# ── Generate every density ────────────────────────────────────────────────────
print()
for folder, px in SIZES.items():
    out_dir = os.path.join(RES_BASE, folder)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, OUTPUT_NAME)

    icon = make_white_silhouette(src, px)
    icon.save(out_path, "PNG")
    print(f"  ✔  {out_path}  ({px}×{px}px)")

print()
print("🎉  Done! All notification icons generated.")
print()
print("─" * 60)
print("Next steps:")
print()
print("1. Add to android/app/src/main/AndroidManifest.xml")
print("   (inside the <application> tag):")
print()
print('   <meta-data')
print('     android:name="com.google.firebase.messaging.default_notification_icon"')
print('     android:resource="@drawable/ic_notification" />')
print()
print('   <meta-data')
print('     android:name="com.google.firebase.messaging.default_notification_color"')
print('     android:resource="@color/notification_color" />')
print()
print("2. Add to android/app/src/main/res/values/colors.xml:")
print()
print('   <color name="notification_color">#F5C518</color>')
print("   (change #F5C518 to your Easy GO brand color)")
print()
print("3. Rebuild your app:  npx expo run:android  or  cd android && ./gradlew assembleDebug")
print("─" * 60)