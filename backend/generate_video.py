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

prompt = """A sleek, cinematic dark-themed technology product reveal. Camera slowly pushes through a dark environment with floating holographic data visualizations - glowing indigo and cyan charts, revenue graphs trending upward, pipeline funnels, and AI neural network patterns. The aesthetic is premium, minimal, and futuristic with deep blacks and electric indigo accents. Particles of light drift through the scene. The mood is anticipation and innovation. Professional B2B SaaS product launch teaser style. No text overlays."""

print("Starting video generation... (this may take several minutes)")
result = generate_video(prompt, '/app/frontend/public/inflow-teaser.mp4')
print(f'Video saved to: {result}' if result else 'Video generation failed')
