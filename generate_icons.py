from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs("dfy-frontend/public", exist_ok=True)

def create_pwa_icon(size, filename):
    # Create high-res rounded icon
    img = Image.new("RGBA", (size, size), (79, 70, 229, 255)) # Indigo 600
    draw = ImageDraw.Draw(img)
    
    # Draw white medical / chart symbol in center
    margin = size // 4
    # Draw a stylish pulse / health cross / DFY monogram
    # Let's draw an inner rounded card / emblem
    pad = size // 8
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size // 6, fill=(99, 102, 241, 255))
    
    # Cross / Medical icon
    bar_w = size // 8
    center = size // 2
    arm_len = size // 4
    
    # Vertical bar
    draw.rounded_rectangle([center - bar_w//2, center - arm_len, center + bar_w//2, center + arm_len], radius=bar_w//4, fill=(255, 255, 255, 255))
    # Horizontal bar
    draw.rounded_rectangle([center - arm_len, center - bar_w//2, center + arm_len, center + bar_w//2], radius=bar_w//4, fill=(255, 255, 255, 255))
    
    img.save(filename, "PNG")
    print(f"Generated {filename}")

create_pwa_icon(192, "dfy-frontend/public/pwa-192x192.png")
create_pwa_icon(512, "dfy-frontend/public/pwa-512x512.png")
