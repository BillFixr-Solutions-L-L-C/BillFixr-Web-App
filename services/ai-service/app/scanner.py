from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings
from app.contracts import MalwareScanStatus


@dataclass(frozen=True)
class MalwareScanResult:
    status: MalwareScanStatus
    message: str


SUSPICIOUS_MARKERS = (
    b"<script",
    b"eval(",
    b"powershell",
    b"/bin/sh",
    b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
)


def scan_upload(
    *,
    data: bytes,
    filename: str,
    settings: Settings,
) -> MalwareScanResult:
    if not settings.malware_scan_enabled:
        return MalwareScanResult(MalwareScanStatus.skipped, "Malware scanning disabled.")

    lowered = data[:4096].lower()
    for marker in SUSPICIOUS_MARKERS:
        if marker.lower() in lowered:
            return MalwareScanResult(
                MalwareScanStatus.rejected,
                f"Upload rejected by local heuristic scanner: {marker.decode(errors='ignore')}",
            )

    if settings.clamav_enabled:
        return _scan_with_clamav(data=data, filename=filename, settings=settings)

    return MalwareScanResult(MalwareScanStatus.clean, "Upload passed local heuristic scanner.")


def _scan_with_clamav(
    *,
    data: bytes,
    filename: str,
    settings: Settings,
) -> MalwareScanResult:
    clamscan = shutil.which(settings.clamscan_path)
    if not clamscan:
        return MalwareScanResult(
            MalwareScanStatus.rejected,
            f"ClamAV enabled but '{settings.clamscan_path}' was not found.",
        )

    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=settings.cache_dir) as handle:
        handle.write(data)
        temp_path = Path(handle.name)

    try:
        result = subprocess.run(
            [clamscan, "--no-summary", str(temp_path)],
            capture_output=True,
            check=False,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return MalwareScanResult(MalwareScanStatus.rejected, "ClamAV scan timed out.")
    finally:
        temp_path.unlink(missing_ok=True)

    if result.returncode == 0:
        return MalwareScanResult(MalwareScanStatus.clean, "Upload passed ClamAV scan.")
    return MalwareScanResult(
        MalwareScanStatus.rejected,
        "ClamAV rejected upload: " + " ".join((result.stdout + result.stderr).split())[:500],
    )

