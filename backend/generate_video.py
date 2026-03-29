import os
import sys
sys.path.insert(0, os.path.abspath(''))
from dotenv import load_dotenv
from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration

load_dotenv()

def generate_video(prompt, output_path, duration=12):
    video_gen = OpenAIVideoGeneration(api_key=os.environ['EMERGENT_LLM_KEY'])
    video_bytes = video_gen.text_to_video(
        prompt=prompt,
        model="sora-2",
        size="1280x720",
        duration=duration,
        max_wait_time=900
    )
    if video_bytes:
        video_gen.save_video(video_bytes, output_path)
        return output_path
    return None

prompt = """A smooth cinematic shot of a modern minimalist office desk at night. A large monitor displays a beautiful dark-themed analytics dashboard with glowing indigo and teal line charts showing upward trends. Soft ambient light illuminates the scene. The camera slowly orbits around the desk, revealing floating holographic data points and subtle light particles in the air. Premium tech aesthetic, clean and professional. Dark background with indigo accent lighting."""

print("Generating TikTok/Instagram Reels video (vertical 720x1280)...")
result = generate_video(prompt, '/app/frontend/public/inflow-social-vertical.mp4')
print(f'Video saved to: {result}' if result else 'Video generation failed')
