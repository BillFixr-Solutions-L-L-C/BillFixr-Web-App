FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app
COPY scripts ./scripts
# The Render blueprints override CMD with ./render-start.sh, which runs the
# API and the job worker together. It has to be in the image for that to
# work -- without it the container exits immediately with status 128.
COPY render-start.sh ./

# No [dev]: that extra is pytest and ruff, a test runner and a linter, and
# nothing in app/ imports either. OCR stays on tesseract, installed above --
# the [ocr] extra is paddleocr and is deliberately not installed.
RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

