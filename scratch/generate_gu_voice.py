import os
import subprocess
import sys

# Ensure gtts is installed
try:
    import gtts
except ImportError:
    print("Installing gTTS package...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "gTTS"])
    from gtts import gTTS

# Define scripts to speak in Gujarati
voices = {
    "ggms_order_gu": "જી જી એમ એસ પર ઓર્ડર આવ્યો છે",
    "ggms_new_order_gu": "જી જી એમ એસ પર નવો ઓર્ડર આવ્યો છે",
    "ggms_attention_order_gu": "ધ્યાન આપો, જી જી એમ એસ પર નવો ઓર્ડર આવ્યો છે",
    "ggms_grocery_order_gu": "જી જી એમ એસ ગ્રોસરી માં નવો ઓર્ડર મળ્યો છે"
}

output_dir = "./public/sounds"
os.makedirs(output_dir, exist_ok=True)

print("Generating Gujarati TTS announcements using Google Text-to-Speech...")
for filename, text in voices.items():
    # lang='gu' specifies Gujarati language
    tts = gTTS(text=text, lang='gu', slow=False)
    mp3_path = os.path.join(output_dir, f"{filename}.mp3")
    tts.save(mp3_path)
    print(f"✅ Generated: {mp3_path} ({text})")

print("All voice variations successfully created!")
