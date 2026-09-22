"""Exercise the same Piper CLI and Whisper stdio server used by native Drool.

Run with the isolated voice-runtime Python after setup-drool-voice.ps1.
This synthetic round trip does not test microphone hardware or user-perceived latency.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import wave


def main():
    root = Path(__file__).resolve().parents[1]
    identity = json.loads((root / "src-tauri" / "tauri.conf.json").read_text())["identifier"]
    voices = Path(os.environ["APPDATA"]) / identity / "piper_voices"
    voice = "en_US-lessac-medium"
    output = Path(os.environ["LOCALAPPDATA"]) / "Drool" / "voice-runtime" / "verification.wav"
    started = time.perf_counter()
    phrase = "Hello, this is Drool. Your local voice system is ready."
    subprocess.run([
        sys.executable, "-m", "piper", "-m", str(voices / f"{voice}.onnx"),
        "-c", str(voices / f"{voice}.onnx.json"), "-f", str(output)
    ], input=phrase, text=True, check=True, capture_output=True, timeout=120)
    speech_seconds = time.perf_counter() - started
    with wave.open(str(output), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
        if duration <= 0:
            raise RuntimeError("Piper produced empty audio")
    started = time.perf_counter()
    commands = "\n".join(json.dumps(command) for command in [
        {"action": "transcribe", "path": str(output)}, {"action": "quit"}
    ]) + "\n"
    completed = subprocess.run([
        sys.executable, "-u", str(root / "public" / "whisper_server.py")
    ], input=commands, text=True, check=True, capture_output=True, timeout=240)
    responses = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
    transcript = next((row["transcript"] for row in responses if row.get("transcript")), "")
    if "local voice" not in transcript.lower():
        raise RuntimeError(f"Whisper round trip did not recover the test phrase: {transcript!r}")
    print(json.dumps({
        "verified": True, "piper_seconds": round(speech_seconds, 2),
        "whisper_cold_start_and_transcription_seconds": round(time.perf_counter() - started, 2),
        "audio_seconds": round(duration, 2), "transcript": transcript,
        "microphone_tested": False, "desktop_ui_tested": False,
    }))


if __name__ == "__main__":
    main()
