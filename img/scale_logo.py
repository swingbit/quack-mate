from PIL import Image
import os

# Paths
source_path = "quackmate_logo_1024.png"
assets_dir = "."

# Output paths
png_64_path = os.path.join(assets_dir, "quackmate_logo_64.png")
png_128_path = os.path.join(assets_dir, "quackmate_logo_128.png")
png_256_path = os.path.join(assets_dir, "quackmate_logo_256.png")
favicon_path = "../favicon.ico"

# Load the source transparent image
img = Image.open(source_path).convert("RGBA")

# Ensure assets directory exists
os.makedirs(assets_dir, exist_ok=True)

# 1. Save 64x64 PNG
img_64 = img.resize((64, 64), Image.Resampling.LANCZOS)
img_64.save(png_64_path, "PNG")
print(f"Saved 64x64 logo to: {png_64_path}")

# 2. Save 128x128 PNG
img_128 = img.resize((128, 128), Image.Resampling.LANCZOS)
img_128.save(png_128_path, "PNG")
print(f"Saved 128x128 logo to: {png_128_path}")

# 3. Save 256x256 PNG
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
img_256.save(png_256_path, "PNG")
print(f"Saved 256x256 logo to: {png_256_path}")

# 4. Save multi-resolution favicon.ico (16x16, 32x32, 48x48)
img.save(favicon_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print(f"Saved multi-resolution favicon to: {favicon_path}")
