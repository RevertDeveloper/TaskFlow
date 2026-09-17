import shutil
import subprocess
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile

ALLOWED_AUDIO_MIME_TYPES = frozenset({"audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"})
MIME_ALIASES = {"audio/x-wav": "audio/wav", "audio/x-m4a": "audio/mp4"}
MIME_EXTENSIONS = {
    "audio/webm": frozenset({".webm"}),
    "audio/mp4": frozenset({".mp4", ".m4a"}),
    "audio/mpeg": frozenset({".mp3"}),
    "audio/wav": frozenset({".wav"}),
}


class AudioValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True, slots=True)
class AudioUploadResult:
    path: Path
    content_type: str
    size_bytes: int
    duration_seconds: float


def store_uploaded_audio(uploaded_file: UploadedFile, session_id: uuid.UUID) -> AudioUploadResult:
    content_type = _normalize_content_type(uploaded_file.content_type)
    extension = _validate_filename(uploaded_file.name, content_type)
    if content_type not in ALLOWED_AUDIO_MIME_TYPES:
        raise AudioValidationError(
            "audio_type_not_allowed", "El formato de audio no está permitido."
        )

    declared_size = uploaded_file.size
    if isinstance(declared_size, int) and declared_size > settings.AI_MAX_AUDIO_BYTES:
        raise AudioValidationError("audio_too_large", "El audio supera el tamaño máximo permitido.")

    session_dir = get_session_audio_dir(session_id)
    target_path = session_dir / f"source{extension}"
    try:
        session_dir.mkdir(parents=True, exist_ok=False)
        size_bytes = _write_bounded_upload(uploaded_file, target_path)
        detected_type = detect_audio_mime(target_path)
        if detected_type != content_type:
            raise AudioValidationError(
                "audio_mime_mismatch", "El contenido no coincide con su formato declarado."
            )
        duration_seconds = probe_audio_duration(target_path)
        if duration_seconds is None:
            raise AudioValidationError(
                "audio_duration_unavailable", "No se pudo validar la duración del audio."
            )
        if duration_seconds <= 0 or duration_seconds > settings.AI_MAX_AUDIO_SECONDS:
            raise AudioValidationError(
                "audio_too_long", "El audio supera la duración máxima permitida."
            )
        return AudioUploadResult(target_path, content_type, size_bytes, duration_seconds)
    except AudioValidationError:
        _remove_file_quietly(target_path)
        _remove_directory_quietly(session_dir)
        raise
    except OSError as exc:
        _remove_file_quietly(target_path)
        _remove_directory_quietly(session_dir)
        raise AudioValidationError(
            "audio_storage_failed", "No se pudo almacenar el audio temporal."
        ) from exc


def get_session_audio_dir(session_id: uuid.UUID) -> Path:
    normalized_id = uuid.UUID(str(session_id))
    root = Path(settings.AI_AUDIO_TEMP_DIR).expanduser().resolve()
    session_dir = (root / str(normalized_id)).resolve()
    if root not in session_dir.parents:
        raise AudioValidationError("audio_path_invalid", "La ruta temporal del audio no es válida.")
    return session_dir


def get_session_audio_path(session_id: uuid.UUID) -> Path | None:
    session_dir = get_session_audio_dir(session_id)
    if not session_dir.is_dir():
        return None
    candidates = [path for path in session_dir.glob("source.*") if path.is_file()]
    if len(candidates) != 1:
        return None
    return candidates[0]


def cleanup_session_audio(session_id: uuid.UUID) -> bool:
    session_dir = get_session_audio_dir(session_id)
    try:
        for path in session_dir.glob("source.*"):
            if path.is_file():
                path.unlink()
        session_dir.rmdir()
        return True
    except FileNotFoundError:
        return True
    except OSError:
        return False


def detect_audio_mime(path: Path) -> str | None:
    try:
        header = path.read_bytes()[:128]
    except OSError:
        return None
    if header[:4] == b"RIFF" and header[8:12] == b"WAVE":
        return "audio/wav"
    if header[:4] == b"\x1a\x45\xdf\xa3" and b"webm" in header.lower():
        return "audio/webm"
    if len(header) >= 8 and header[4:8] == b"ftyp":
        return "audio/mp4"
    if header[:3] == b"ID3" or (
        len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0
    ):
        return "audio/mpeg"
    return None


def probe_audio_duration(path: Path) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        completed = subprocess.run(
            [
                ffprobe,
                "-hide_banner",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        try:
            duration = float(completed.stdout.strip())
        except (TypeError, ValueError):
            duration = None
        if duration is not None and duration > 0:
            return duration

    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path), "rb") as wav_file:
                frame_rate = wav_file.getframerate()
                frame_count = wav_file.getnframes()
            if frame_rate > 0 and frame_count > 0:
                return frame_count / frame_rate
        except (OSError, wave.Error):
            return None
    return None


def _normalize_content_type(content_type: str | None) -> str:
    base_type = (content_type or "").split(";", 1)[0].strip().lower()
    return MIME_ALIASES.get(base_type, base_type)


def _validate_filename(name: str | None, content_type: str) -> str:
    filename = str(name or "")
    if not filename or "/" in filename or "\\" in filename:
        raise AudioValidationError("audio_filename_invalid", "El nombre del audio no es válido.")
    extension = Path(filename).suffix.lower()
    if extension not in MIME_EXTENSIONS.get(content_type, frozenset()):
        raise AudioValidationError(
            "audio_extension_not_allowed", "La extensión del audio no está permitida."
        )
    return extension


def _write_bounded_upload(uploaded_file: UploadedFile, target_path: Path) -> int:
    total = 0
    with target_path.open("xb") as destination:
        for chunk in uploaded_file.chunks():
            total += len(chunk)
            if total > settings.AI_MAX_AUDIO_BYTES:
                raise AudioValidationError(
                    "audio_too_large", "El audio supera el tamaño máximo permitido."
                )
            destination.write(chunk)
    if total == 0:
        raise AudioValidationError("audio_empty", "El audio está vacío.")
    return total


def _remove_file_quietly(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _remove_directory_quietly(path: Path) -> None:
    try:
        path.rmdir()
    except OSError:
        pass
